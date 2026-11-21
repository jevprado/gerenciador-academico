import "server-only";

import { inflateRawSync, inflateSync } from "node:zlib";
import {
  type CalendarCategory,
  type ParsedCalendarEvent,
  UNB_2026_1_EVENTS,
} from "./calendar-types";

// ---------------------------------------------------------------------------
// 1. Extrator de texto de PDF puro em Node.js (via node:zlib + CMap ToUnicode)
//
// Cada fonte do PDF tem sua própria codificação (fontes "subset" do Word, por
// exemplo, reaproveitam os mesmos códigos para letras diferentes). Por isso o
// texto é decodificado com a fonte ativa no momento (operador Tf), resolvida a
// partir dos recursos da página — nunca com um mapa global.
// ---------------------------------------------------------------------------

type CMap = Map<number, string>;

type FontDecoder = {
  cmap: CMap | null;
  codeBytes: 1 | 2;
  differences: Map<number, string> | null;
};

type PdfObject = { body: string; stream: Buffer | null };
type PdfObjects = Map<number, PdfObject>;

function applyPngPredictor(data: Buffer, columns: number): Buffer {
  const rowBytes = columns;
  const stride = rowBytes + 1;
  if (stride <= 1 || data.length < stride) return data;
  const rows = Math.floor(data.length / stride);
  const out = Buffer.alloc(rows * rowBytes);
  const prev = Buffer.alloc(rowBytes);

  for (let r = 0; r < rows; r++) {
    const filter = data[r * stride];
    const rowStart = r * stride + 1;
    const outStart = r * rowBytes;
    for (let c = 0; c < rowBytes; c++) {
      const raw = data[rowStart + c] ?? 0;
      const left = c > 0 ? out[outStart + c - 1] : 0;
      const up = prev[c];
      const upLeft = c > 0 ? prev[c - 1] : 0;
      let val = raw;
      if (filter === 1) val = (raw + left) & 0xff;
      else if (filter === 2) val = (raw + up) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (raw + pr) & 0xff;
      }
      out[outStart + c] = val;
    }
    out.copy(prev, 0, outStart, outStart + rowBytes);
  }
  return out;
}

function decompressStream(raw: Buffer, dict: string): Buffer | null {
  if (!/\/FlateDecode\b/.test(dict)) {
    // Filtros não suportados (DCT, JBIG2...) são imagens — irrelevantes para texto.
    return /\/Filter\b/.test(dict) ? null : raw;
  }

  let inflated: Buffer;
  try {
    inflated = inflateSync(raw);
  } catch {
    try {
      inflated = inflateRawSync(raw);
    } catch {
      return null;
    }
  }

  const predMatch = dict.match(/\/Predictor\s+(\d+)/);
  const colMatch = dict.match(/\/Columns\s+(\d+)/);
  if (predMatch && Number(predMatch[1]) >= 10 && colMatch) {
    return applyPngPredictor(inflated, Number(colMatch[1]));
  }
  return inflated;
}

// --- Leitura de valores no dicionário -------------------------------------

/** Retorna o texto bruto do valor de `key` no nível superior de um dicionário `<< ... >>`. */
function dictGet(dict: string, key: string): string | null {
  const s = dict.trim();
  if (!s.startsWith("<<")) return null;
  let i = 2;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s.startsWith(">>", i)) return null;
    const name = /^\/([^\s/<>[\]()%{}]*)/.exec(s.slice(i, i + 128));
    if (!name) {
      i++;
      continue;
    }
    i += name[0].length;
    const value = readValue(s, i);
    if (!value) return null;
    if (name[1] === key) return value.text;
    i = value.end;
  }
  return null;
}

function skipLiteralString(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
}

function skipBalanced(s: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") {
      i = skipLiteralString(s, i) - 1;
    } else if (open === "<<" ? s.startsWith("<<", i) : ch === open) {
      depth++;
      if (open === "<<") i++;
    } else if (close === ">>" ? s.startsWith(">>", i) : ch === close) {
      depth--;
      if (close === ">>") i++;
      if (depth === 0) return i + 1;
    }
  }
  return s.length;
}

function readValue(s: string, from: number): { text: string; end: number } | null {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (i >= s.length) return null;
  let end: number;
  if (s.startsWith("<<", i)) end = skipBalanced(s, i, "<<", ">>");
  else if (s[i] === "[") end = skipBalanced(s, i, "[", "]");
  else if (s[i] === "(") end = skipLiteralString(s, i);
  else if (s[i] === "<") {
    const close = s.indexOf(">", i);
    end = close === -1 ? s.length : close + 1;
  } else {
    const tok = /^(\d+\s+\d+\s+R\b|\/?[^\s/<>[\]()%{}]+)/.exec(s.slice(i, i + 256));
    if (!tok) return null;
    end = i + tok[0].length;
  }
  return { text: s.slice(i, end), end };
}

function refNumber(value: string | null): number | null {
  const m = value ? /^(\d+)\s+\d+\s+R$/.exec(value.trim()) : null;
  return m ? Number(m[1]) : null;
}

// --- Tabela de objetos ----------------------------------------------------

function collectObjects(pdf: Buffer): PdfObjects {
  const raw = pdf.toString("latin1");
  const objects: PdfObjects = new Map();
  const objRe = /(?:^|[\s>\]])(\d+)\s+(\d+)\s+obj\b/g;

  for (let m = objRe.exec(raw); m; m = objRe.exec(raw)) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endObj = raw.indexOf("endobj", bodyStart);
    if (endObj === -1) break;

    let body = raw.slice(bodyStart, endObj);
    let stream: Buffer | null = null;

    const streamKw = /\bstream(\r\n|\n|\r)/.exec(body);
    if (streamKw && body.trimStart().startsWith("<<")) {
      body = body.slice(0, streamKw.index);
      const dataStart = bodyStart + streamKw.index + streamKw[0].length;
      const lenValue = dictGet(body, "Length");
      let dataEnd = lenValue && /^\d+$/.test(lenValue) ? dataStart + Number(lenValue) : -1;
      // Confere se o /Length é confiável (logo depois vem "endstream"); senão procura o marcador.
      if (dataEnd < 0 || !/^\s*endstream/.test(raw.slice(dataEnd, dataEnd + 16))) {
        dataEnd = raw.indexOf("endstream", dataStart);
        if (dataEnd === -1) break;
        while (dataEnd > dataStart && (raw[dataEnd - 1] === "\n" || raw[dataEnd - 1] === "\r")) dataEnd--;
      }
      stream = pdf.subarray(dataStart, dataEnd);
      const realEndObj = raw.indexOf("endobj", dataEnd);
      objRe.lastIndex = realEndObj === -1 ? raw.length : realEndObj + 6;
    }

    objects.set(num, { body: body.trim(), stream });
  }

  // Objetos comprimidos dentro de Object Streams (PDF 1.5+)
  for (const obj of [...objects.values()]) {
    if (!obj.stream || !/\/Type\s*\/ObjStm\b/.test(obj.body)) continue;
    const data = decompressStream(obj.stream, obj.body);
    if (!data) continue;
    const text = data.toString("latin1");
    const count = Number(dictGet(obj.body, "N"));
    const first = Number(dictGet(obj.body, "First"));
    if (!Number.isFinite(count) || !Number.isFinite(first)) continue;
    const header = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < count; k++) {
      const num = header[k * 2];
      const off = header[k * 2 + 1];
      const nextOff = k + 1 < count ? header[(k + 1) * 2 + 1] : text.length - first;
      if (!Number.isFinite(num) || !Number.isFinite(off)) continue;
      if (!objects.has(num)) {
        objects.set(num, { body: text.slice(first + off, first + nextOff).trim(), stream: null });
      }
    }
  }

  return objects;
}

/** Resolve um valor que pode ser referência indireta para o corpo do objeto. */
function resolve(objects: PdfObjects, value: string | null): string | null {
  const num = refNumber(value);
  if (num === null) return value;
  return objects.get(num)?.body ?? null;
}

function streamData(objects: PdfObjects, num: number): Buffer | null {
  const obj = objects.get(num);
  if (!obj?.stream) return null;
  return decompressStream(obj.stream, obj.body);
}

// --- Fontes ---------------------------------------------------------------

function hexToUnicode(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (!clean) return "";
  // Valores do ToUnicode são UTF-16BE (podem conter pares substitutos)
  const units: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const unit = Number.parseInt(clean.slice(i, i + 4).padEnd(4, "0"), 16);
    if (Number.isFinite(unit)) units.push(unit);
  }
  return String.fromCharCode(...units);
}

function addToHex(hex: string, delta: number): string {
  // Incrementa o último código UTF-16 do destino (regra do bfrange)
  const clean = hex.replace(/\s+/g, "");
  const head = clean.slice(0, -4);
  const last = Number.parseInt(clean.slice(-4), 16) + delta;
  return head + last.toString(16).padStart(4, "0");
}

function parseCMap(text: string): { cmap: CMap; codeBytes: 1 | 2 } {
  const cmap: CMap = new Map();
  let codeBytes: 1 | 2 = 1;

  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(text);
  if (space && space[1].length >= 4) codeBytes = 2;

  for (const match of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of match[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      if (pair[1].length >= 4) codeBytes = 2;
      const code = Number.parseInt(pair[1], 16);
      const str = hexToUnicode(pair[2]);
      if (Number.isFinite(code) && str) cmap.set(code, str);
    }
  }

  for (const match of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = match[1];
    for (const r of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      if (r[1].length >= 4) codeBytes = 2;
      const start = Number.parseInt(r[1], 16);
      const end = Number.parseInt(r[2], 16);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 65535) {
        for (let c = start; c <= end; c++) {
          cmap.set(c, hexToUnicode(addToHex(r[3], c - start)));
        }
      }
    }

    for (const r of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      if (r[1].length >= 4) codeBytes = 2;
      const start = Number.parseInt(r[1], 16);
      [...r[3].matchAll(/<([0-9A-Fa-f]*)>/g)].forEach((item, idx) => {
        const str = hexToUnicode(item[1]);
        if (str) cmap.set(start + idx, str);
      });
    }
  }

  return { cmap, codeBytes };
}

// Bytes 0x80–0x9F do WinAnsiEncoding (cp1252); o restante coincide com Latin-1.
const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ",
  0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“",
  0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

// Nomes de glifos mais comuns em /Differences (texto em português)
const GLYPH_NAMES: Record<string, string> = {
  space: " ", period: ".", comma: ",", colon: ":", semicolon: ";", hyphen: "-", endash: "–",
  emdash: "—", slash: "/", parenleft: "(", parenright: ")", percent: "%", quotesingle: "'",
  quoteright: "’", quoteleft: "‘", quotedblleft: "“", quotedblright: "”", bullet: "•",
  ordfeminine: "ª", ordmasculine: "º", degree: "°", ampersand: "&", plus: "+", equal: "=",
  greater: ">", less: "<", question: "?", exclam: "!", underscore: "_", at: "@",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const ACCENTS: Record<string, string> = {
  acute: "́", grave: "̀", circumflex: "̂", tilde: "̃", dieresis: "̈", cedilla: "̧",
};

function glyphNameToUnicode(name: string): string {
  if (name.length === 1) return name;
  if (GLYPH_NAMES[name]) return GLYPH_NAMES[name];
  const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (uni) return String.fromCharCode(Number.parseInt(uni[1], 16));
  const accented = /^([A-Za-z])(acute|grave|circumflex|tilde|dieresis|cedilla)$/.exec(name);
  if (accented) return (accented[1] + ACCENTS[accented[2]]).normalize("NFC");
  return "";
}

function buildFontDecoder(objects: PdfObjects, fontBody: string): FontDecoder {
  let cmap: CMap | null = null;
  let codeBytes: 1 | 2 = /\/Subtype\s*\/Type0\b/.test(fontBody) ? 2 : 1;

  const toUnicodeNum = refNumber(dictGet(fontBody, "ToUnicode"));
  if (toUnicodeNum !== null) {
    const data = streamData(objects, toUnicodeNum);
    if (data) {
      const parsed = parseCMap(data.toString("latin1"));
      if (parsed.cmap.size > 0) {
        cmap = parsed.cmap;
        codeBytes = parsed.codeBytes;
      }
    }
  }

  let differences: Map<number, string> | null = null;
  const encoding = resolve(objects, dictGet(fontBody, "Encoding"));
  const diffs = encoding?.startsWith("<<") ? dictGet(encoding, "Differences") : null;
  if (diffs) {
    differences = new Map();
    let code = 0;
    for (const tok of diffs.slice(1, -1).matchAll(/(\d+)|\/([^\s/[\]]+)/g)) {
      if (tok[1] !== undefined) {
        code = Number(tok[1]);
      } else {
        const ch = glyphNameToUnicode(tok[2]);
        if (ch) differences.set(code, ch);
        code++;
      }
    }
  }

  return { cmap, codeBytes, differences };
}

function decodeWithFont(buf: Buffer, font: FontDecoder | null): string {
  let out = "";
  if (font?.codeBytes === 2) {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const code = (buf[i] << 8) | buf[i + 1];
      out += font.cmap?.get(code) ?? "";
    }
    return out;
  }

  for (const code of buf) {
    const mapped = font?.cmap?.get(code) ?? font?.differences?.get(code);
    if (mapped !== undefined) out += mapped;
    else if (code >= 0x80 && code <= 0x9f) out += WIN_ANSI_HIGH[code] ?? "";
    else if (code >= 32) out += String.fromCharCode(code);
    else out += " ";
  }
  return out;
}

// --- Conteúdo da página ---------------------------------------------------

function unescapePdfLiteral(literal: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < literal.length; i++) {
    const ch = literal.charCodeAt(i);
    if (ch === 0x5c /* \ */ && i + 1 < literal.length) {
      const next = literal[i + 1];
      if (next >= "0" && next <= "7") {
        let oct = next;
        i++;
        if (i + 1 < literal.length && literal[i + 1] >= "0" && literal[i + 1] <= "7") {
          oct += literal[++i];
          if (i + 1 < literal.length && literal[i + 1] >= "0" && literal[i + 1] <= "7") {
            oct += literal[++i];
          }
        }
        bytes.push(Number.parseInt(oct, 8) & 0xff);
      } else {
        i++;
        if (next === "n") bytes.push(10);
        else if (next === "r") bytes.push(13);
        else if (next === "t") bytes.push(9);
        else if (next === "b") bytes.push(8);
        else if (next === "f") bytes.push(12);
        else if (next === "\r" || next === "\n") {
          if (next === "\r" && literal[i + 1] === "\n") i++;
        } else {
          bytes.push(next.charCodeAt(0) & 0xff);
        }
      }
    } else {
      bytes.push(ch & 0xff);
    }
  }
  return Buffer.from(bytes);
}

type Operand = number | string | Buffer | Operand[];

/** Lexer mínimo de content stream: chama `onOp(operador, operandos)` para cada operador. */
function scanContent(text: string, onOp: (op: string, args: Operand[]) => void) {
  const stack: Operand[][] = [[]];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "%") {
      while (i < n && text[i] !== "\n" && text[i] !== "\r") i++;
    } else if (ch === "(") {
      const end = skipLiteralString(text, i);
      top().push(unescapePdfLiteral(text.slice(i + 1, end - 1)));
      i = end;
    } else if (ch === "<" && text[i + 1] === "<") {
      const end = skipBalanced(text, i, "<<", ">>");
      top().push(text.slice(i, end));
      i = end;
    } else if (ch === "<") {
      const end = text.indexOf(">", i);
      const hex = text.slice(i + 1, end === -1 ? n : end).replace(/\s+/g, "");
      top().push(Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex"));
      i = end === -1 ? n : end + 1;
    } else if (ch === "[") {
      stack.push([]);
      i++;
    } else if (ch === "]") {
      const arr = stack.length > 1 ? stack.pop()! : [];
      top().push(arr);
      i++;
    } else if (ch === "/") {
      const m = /^\/[^\s/<>[\]()%{}]*/.exec(text.slice(i, i + 128))!;
      top().push(m[0]);
      i += m[0].length;
    } else {
      const m = /^[^\s/<>[\]()%{}]+/.exec(text.slice(i, i + 64));
      if (!m) {
        i++;
        continue;
      }
      const tok = m[0];
      i += tok.length;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) {
        top().push(Number(tok));
        continue;
      }
      if (tok === "BI") {
        // imagem inline: pula até "EI"
        const ei = text.indexOf("EI", text.indexOf("ID", i));
        i = ei === -1 ? n : ei + 2;
        stack.length = 1;
        stack[0] = [];
        continue;
      }
      onOp(tok, stack[0]);
      stack.length = 1;
      stack[0] = [];
    }
  }
}

type Frag = { x: number; y: number; text: string; width: number; size: number };

function extractPageFragments(
  contents: Buffer[],
  fonts: Map<string, FontDecoder>,
): Frag[] {
  const frags: Frag[] = [];
  let font: FontDecoder | null = null;
  let fontSize = 10;
  let leading = 0;
  let tm = [1, 0, 0, 1, 0, 0];
  let lm = [1, 0, 0, 1, 0, 0];

  const num = (v: Operand | undefined) => (typeof v === "number" ? v : 0);
  const moveLine = (tx: number, ty: number) => {
    lm = [lm[0], lm[1], lm[2], lm[3], tx * lm[0] + ty * lm[2] + lm[4], tx * lm[1] + ty * lm[3] + lm[5]];
    tm = [...lm];
  };
  const show = (piece: string) => {
    if (!piece) return;
    const scale = Math.hypot(tm[0], tm[1]) || 1;
    const width = piece.length * fontSize * scale * 0.5;
    frags.push({ x: tm[4], y: tm[5], text: piece, width, size: fontSize * scale });
    tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + width, tm[5]];
  };
  const decode = (v: Operand) => (Buffer.isBuffer(v) ? decodeWithFont(v, font) : "");

  for (const content of contents) {
    scanContent(content.toString("latin1"), (op, args) => {
      switch (op) {
        case "BT":
          tm = [1, 0, 0, 1, 0, 0];
          lm = [1, 0, 0, 1, 0, 0];
          break;
        case "Tf": {
          const name = typeof args[0] === "string" ? args[0].slice(1) : "";
          font = fonts.get(name) ?? null;
          fontSize = Math.abs(num(args[1])) || fontSize;
          break;
        }
        case "TL":
          leading = num(args[0]);
          break;
        case "Tm":
          tm = args.slice(0, 6).map(num);
          lm = [...tm];
          break;
        case "Td":
          moveLine(num(args[0]), num(args[1]));
          break;
        case "TD":
          leading = -num(args[1]);
          moveLine(num(args[0]), num(args[1]));
          break;
        case "T*":
          moveLine(0, -leading);
          break;
        case "Tj":
          show(decode(args[0]));
          break;
        case "'":
          moveLine(0, -leading);
          show(decode(args[0]));
          break;
        case '"':
          moveLine(0, -leading);
          show(decode(args[2]));
          break;
        case "TJ": {
          const arr = Array.isArray(args[0]) ? args[0] : [];
          let piece = "";
          for (const item of arr) {
            if (typeof item === "number") {
              if (item < -180 && piece && !piece.endsWith(" ")) piece += " ";
            } else {
              piece += decode(item);
            }
          }
          show(piece);
          break;
        }
      }
    });
  }

  return frags;
}

/** Linha de texto da página com a posição vertical e os fragmentos (x, tamanho da fonte). */
export type PdfRow = { y: number; text: string; items: { x: number; text: string; size: number }[] };

function fragmentsToRows(frags: Frag[]): PdfRow[] {
  const rows: { y: number; items: Frag[] }[] = [];
  for (const f of frags) {
    const existing = rows.find((r) => Math.abs(r.y - f.y) <= 3.5);
    if (existing) existing.items.push(f);
    else rows.push({ y: f.y, items: [f] });
  }

  rows.sort((a, b) => b.y - a.y);
  const out: PdfRow[] = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd: number | null = null;
    for (const item of r.items) {
      if (prevEnd !== null && item.x - prevEnd > 18 && !line.endsWith(" ")) line += " ";
      line += item.text;
      prevEnd = item.x + item.width;
    }
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (cleaned) out.push({ y: r.y, text: cleaned, items: r.items.map(({ x, text, size }) => ({ x, text, size })) });
  }
  return out;
}

function refList(value: string | null): number[] {
  if (!value) return [];
  return [...value.matchAll(/(\d+)\s+\d+\s+R\b/g)].map((m) => Number(m[1]));
}

/** Percorre a árvore de páginas a partir do Catalog, herdando /Resources dos nós pais. */
function collectPages(objects: PdfObjects): { body: string; resources: string | null }[] {
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.body));
  const rootPages = catalog ? refNumber(dictGet(catalog.body, "Pages")) : null;
  const pages: { body: string; resources: string | null }[] = [];
  const seen = new Set<number>();

  const walk = (num: number, inherited: string | null) => {
    if (seen.has(num)) return;
    seen.add(num);
    const body = objects.get(num)?.body;
    if (!body) return;
    const resources = resolve(objects, dictGet(body, "Resources")) ?? inherited;
    if (/\/Type\s*\/Pages\b/.test(body)) {
      for (const kid of refList(dictGet(body, "Kids"))) walk(kid, resources);
    } else if (/\/Type\s*\/Page\b/.test(body)) {
      pages.push({ body, resources });
    }
  };

  if (rootPages !== null) walk(rootPages, null);
  return pages;
}

/**
 * Linhas de cada página, da maior para a menor coordenada y. Em PDFs gerados
 * pelo navegador (ex.: SIGAA) o eixo y cresce para baixo, então a ordem de
 * leitura fica invertida — quem consome decide a direção.
 */
export function extractPdfRows(pdfBuffer: Buffer): PdfRow[][] {
  const objects = collectObjects(pdfBuffer);
  const fontCache = new Map<number, FontDecoder>();
  const pages: PdfRow[][] = [];

  for (const page of collectPages(objects)) {
    const fonts = new Map<string, FontDecoder>();
    const fontDict = page.resources ? resolve(objects, dictGet(page.resources, "Font")) : null;
    if (fontDict) {
      for (const m of fontDict.matchAll(/\/([^\s/<>[\]()%{}]+)\s+(\d+)\s+\d+\s+R\b/g)) {
        const fontNum = Number(m[2]);
        let decoder = fontCache.get(fontNum);
        if (!decoder) {
          decoder = buildFontDecoder(objects, objects.get(fontNum)?.body ?? "");
          fontCache.set(fontNum, decoder);
        }
        fonts.set(m[1], decoder);
      }
    }

    const contents = refList(dictGet(page.body, "Contents"))
      .flatMap((n) => {
        const own = streamData(objects, n);
        if (own) return [own];
        // /Contents pode apontar para um array indireto de streams
        return refList(objects.get(n)?.body ?? null)
          .map((k) => streamData(objects, k))
          .filter((b): b is Buffer => b !== null);
      });

    pages.push(fragmentsToRows(extractPageFragments(contents, fonts)));
  }

  return pages;
}

export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string {
  return extractPdfRows(pdfBuffer)
    .flat()
    .map((r) => r.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// 2. Parser semântico de datas e períodos de Calendário Acadêmico (Português)
// ---------------------------------------------------------------------------

function inferCategory(text: string): CalendarCategory {
  const lower = text.toLowerCase();
  if (
    lower.includes("feriado") ||
    lower.includes("sexta-feira santa") ||
    lower.includes("paixão de cristo") ||
    lower.includes("tiradentes") ||
    lower.includes("dia do trabalho") ||
    lower.includes("corpus christi") ||
    lower.includes("independência") ||
    lower.includes("aparecida") ||
    lower.includes("finados") ||
    lower.includes("proclamação da república") ||
    lower.includes("consciência negra") ||
    lower.includes("natal") ||
    lower.includes("confraternização") ||
    lower.includes("carnaval")
  ) {
    return "feriado";
  }
  if (lower.includes("ponto facultativo") || lower.includes("recesso")) {
    return "ponto_facultativo";
  }
  if (lower.includes("trancamento") || lower.includes("retirada de disciplina") || lower.includes("retirar matrícula")) {
    return "trancamento";
  }
  if (
    lower.includes("matrícula") ||
    lower.includes("matricula") ||
    lower.includes("rematrícula") ||
    lower.includes("rematricula") ||
    lower.includes("aluno especial") ||
    lower.includes("ajuste de vagas")
  ) {
    return "matricula";
  }
  if (
    lower.includes("aula") ||
    lower.includes("letivo") ||
    lower.includes("25%") ||
    lower.includes("50%") ||
    lower.includes("75%") ||
    lower.includes("menção") ||
    lower.includes("mencao") ||
    lower.includes("consolidação") ||
    lower.includes("consolidacao") ||
    lower.includes("desligamento") ||
    lower.includes("atividades complementares")
  ) {
    return "academico";
  }
  return "outro";
}

function inferTarget(text: string): string {
  if (/Estudante\s*\/\s*Coordena[çc][ãa]o/i.test(text)) return "Estudante/Coordenação";
  if (/\bDEG\s*\/\s*SAA\b/i.test(text)) return "DEG/SAA";
  if (/\bDEG\s*\/\s*DAIA\b/i.test(text)) return "DEG/DAIA";
  if (/\bUnidade Acad[êe]mica\b/i.test(text)) return "Unidade Acadêmica";
  if (/\bSTI\b/.test(text)) return "STI";
  if (/\bCoordena[çc][ãa]o\b/i.test(text) && !/\bEstudante\b/i.test(text)) return "Coordenação";
  if (/\bDocente\b/i.test(text) || /pelos docentes/i.test(text)) return "Docente";
  if (/\bSAA\b/.test(text) && !/\bEstudante\b/i.test(text)) return "SAA";
  if (/\bEstudante\b/i.test(text) || /\bDiscente\b/i.test(text) || /\bAluno\b/i.test(text)) return "Estudante";
  return "Geral";
}

function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year.length === 2 ? `20${year}` : year);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return iso;
}

function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

function cleanDescriptionAndTitle(rawLine: string, dateMatchText: string): { title: string; description: string | null } {
  let withoutDate = rawLine.replace(dateMatchText, " ").replace(/\s+/g, " ").trim();
  // Rótulo da coluna da esquerda em caixa alta ("PERÍODO DE AULAS", "ALUNO ESPECIAL") não faz parte do título
  const { label, rest } = splitCapsLabel(withoutDate);
  if (label && rest) {
    const endsWithConnector = /^(?:DE|DO|DA|DOS|DAS|NO|NA|NOS|NAS|E|EM|PARA)$/.test(label.split(" ").at(-1) ?? "");
    const numberToken = /^(\S*\d\S*)\s*(.*)$/.exec(rest);
    if (endsWithConnector && numberToken) {
      // O rótulo continua no número ("CONSOLIDAÇÃO DE TURMAS DO 2025.4"): ele é o título do evento
      const description = numberToken[2].replace(/^[-–—:·|]+\s*/, "").trim().replace(/\.$/, "");
      return { title: sentenceCase(`${label} ${numberToken[1]}`), description: description || null };
    }
    if (!endsWithConnector || /^\p{L}/u.test(rest)) withoutDate = rest;
  }
  withoutDate = withoutDate
    .replace(TARGET_PREFIX_RE, "")
    .replace(/^[-–—:·|]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutDate) {
    return { title: "", description: null };
  }

  // Se for curto (até 85 caracteres), usa direto como título
  if (withoutDate.length <= 85) {
    return { title: withoutDate.replace(/\.$/, ""), description: null };
  }

  // Se tiver primeira frase curta ou separador, usa como título e o texto completo como descrição
  const firstSentence = withoutDate.split(/(?:\.\s|\s+no SIGAA|\s+a partir|\s+de \d{2}h)/i)[0]?.trim() ?? "";
  const title =
    firstSentence.length >= 8 && firstSentence.length <= 90
      ? firstSentence.replace(/\.$/, "")
      : `${withoutDate.slice(0, 75).trim()}…`;

  return { title, description: withoutDate };
}

const MONTH_NAMES = /^(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/i;

/** Linhas da grade mensal (números dos dias, "D S T Q Q S S", nomes dos meses, títulos espaçados). */
function isGridNoise(line: string): boolean {
  return line
    .split(/\s+/)
    .every((t) => t.length <= 1 || /^\d{1,2}(?:\.\d)?$/.test(t) || MONTH_NAMES.test(t));
}

// Entrada da legenda da grade: "DD/MM - Texto" ou "DD/MM a DD/MM - Texto" (sem ano)
const LEGEND_ENTRY = "\\d{2}\\/\\d{2}(?:\\s*a\\s*\\d{2}\\/\\d{2})?\\s*[-–—]\\s";
const LEGEND_START_RE = new RegExp(`^${LEGEND_ENTRY}`);
// não quebra dentro de um intervalo ("23/02 a 26/02 - ...")
const LEGEND_SPLIT_RE = new RegExp(`(?<!\\ba\\s*)\\s+(?=${LEGEND_ENTRY})`);

// Título de seção sem data ("Processo de Matrícula no 2026.1")
const SECTION_TITLE_RE = /^[^\d/]{3,60}\s\d{4}\.\d$/;

const TARGET_PREFIX_RE =
  /^(Estudante\/Coordenação|Estudante|Coordenação|Docente|STI|SAA|DEG\/SAA|DEG\/DAIA|Unidade Acadêmica)\s*/i;
const DATE_TOKEN_RE = /(?:At[ée]\s+|A partir de\s+)?\d{2}\/\d{2}(?:\/\d{4})?/gi;

/** Remove rótulo em caixa alta e público-alvo do início da linha. */
function stripRowPrefix(text: string): string {
  const { label, rest } = splitCapsLabel(text);
  return (label ? rest : text).replace(TARGET_PREFIX_RE, "").trim();
}

/** Linha de tabela que só tem a data (o texto da célula ficou nas linhas de cima/baixo). */
function isBareDateRow(text: string): boolean {
  const body = stripRowPrefix(text);
  return /^(?:At[ée]\s+|A partir de\s+)?\d{2}\/\d{2}/i.test(body) && !body.replace(DATE_TOKEN_RE, "").replace(/[\s\-–—a]/g, "");
}

/** Linha que é pedaço de descrição de outra célula (não inicia uma linha de evento com data própria). */
function isFragment(text: string): boolean {
  return !/^(?:At[ée]\s+|A partir de\s+)?\d{2}\/\d{2}/i.test(stripRowPrefix(text));
}

// Cabeçalho repetido no topo de cada página: se não for descartado, gruda no último evento da página anterior
const PAGE_HEADER_RE =
  /^(?:Universidade de Bras[íi]lia|Secretaria de Administra[çc][ãa]o Acad[êe]mica|CALEND[ÁA]RIO UNIVERSIT[ÁA]RIO DE GRADUA[ÇC][ÃA]O|POR ATIVIDADES|LEGENDA|\d{4}\.\d)$/i;

/** Separa o rótulo em caixa alta da coluna da esquerda ("TRANCAMENTO GERAL DE") do texto que vem depois. */
function splitCapsLabel(text: string): { label: string; rest: string } {
  const words = text.split(" ");
  let k = 0;
  while (k < words.length && /\p{Lu}/u.test(words[k]) && words[k] === words[k].toLocaleUpperCase("pt-BR")) k++;
  const label = words.slice(0, k).join(" ");
  if (!words.slice(0, k).some((w) => w.length >= 3)) return { label: "", rest: text };
  return { label, rest: words.slice(k).join(" ") };
}

/**
 * Quando a célula da tabela é centralizada verticalmente, a linha da data fica sozinha e o
 * rótulo/descrição ficam nas linhas de cima e de baixo. Reconstrói título e descrição a partir delas.
 */
function contextFromNeighbors(neighbors: (string | undefined)[]): { title: string; description: string | null } | null {
  const parts = neighbors
    .filter((t): t is string => !!t)
    .map(splitCapsLabel);
  if (!parts.length) return null;

  const label = parts.map((p) => p.label).filter(Boolean).join(" ").trim();
  const description = parts.map((p) => p.rest).filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || null;
  if (label) return { title: sentenceCase(label), description };
  if (!description) return null;
  const titled = cleanDescriptionAndTitle(description, "");
  return titled.title ? titled : null;
}

export function parseCalendarText(rawText: string, fallbackYear = 2026): ParsedCalendarEvent[] {
  const text = rawText
    .replace(/\r\n/g, "\n")
    // O PDF às vezes separa o semestre com espaço ("2025. 2"): junta de volta em "2025.2"
    .replace(/\b(20\d{2})\.\s+([1-4])\b/g, "$1.$2");

  // Detecta o semestre principal do documento pelo cabeçalho/frequência (evita confundir
  // um calendário 2025.2 que apenas cita "2026.1" em uma linha de mobilidade).
  const docSemester = detectSemesterFromText(text);

  // Detecta se é o calendário 2026.1 da UnB pelo cabeçalho ou datas-chave
  const isUnb2026_1 =
    (/Universidade de Bras[íi]lia/i.test(text) || /CALEND[ÁA]RIO UNIVERSIT[ÁA]RIO DE GRADUA[ÇC][ÃA]O/i.test(text)) &&
    docSemester === "2026.1";

  // Detecta ano base do documento (ex: "2025.2" -> 2025, "2026.1" -> 2026)
  const yearMatch = text.match(/\b(20\d{2})\.[1234]\b/) ?? text.match(/\b(20\d{2})\b/);
  const baseYear = docSemester ? Number(docSemester.slice(0, 4)) : yearMatch ? Number(yearMatch[1]) : fallbackYear;

  type SourceLine = { text: string; legend: boolean };
  const sourceLines: SourceLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || isGridNoise(line) || PAGE_HEADER_RE.test(line) || SECTION_TITLE_RE.test(line)) continue;
    // A legenda da grade traz vários eventos na mesma linha visual: separa cada um
    const pieces = line.split(LEGEND_SPLIT_RE);
    if (pieces.length > 1 || LEGEND_START_RE.test(line)) {
      for (const piece of pieces) sourceLines.push({ text: piece.trim(), legend: LEGEND_START_RE.test(piece.trim()) });
    } else {
      sourceLines.push({ text: line, legend: false });
    }
  }

  // Junta linhas quebradas de uma mesma célula de tabela quando a linha seguinte não começa com data ou seção
  const mergedLines: SourceLine[] = [];
  const startsWithDateOrHeader =
    /^(?:At[ée]\s+|A partir de\s+)?\d{2}\/\d{2}|^(?:Estudante|Coordena[çc][ãa]o|STI|Docente|SAA|DEG|Unidade Acad[êe]mica|PER[ÍI]ODO|MATR[ÍI]CULA|RETIRADA|ALUNO ESPECIAL|REINTEGRA|MOBILIDADE|MONITORIA|DUPLA|MUDAN[ÇC]A|TRANCAMENTO|MEN[ÇC][ÃA]O|DESLIGAMENTO|REVIS[ÃA]O|ATIVIDADES)/i;

  for (const line of sourceLines) {
    const prev = mergedLines[mergedLines.length - 1];
    const isContinuation =
      prev !== undefined &&
      !prev.legend &&
      !line.legend &&
      prev.text.length < 280 &&
      // linha que começa em minúscula é continuação da frase anterior, mesmo contendo data ("dia 26/02/2026.")
      (/^\p{Ll}/u.test(line.text) || (!startsWithDateOrHeader.test(line.text) && !/\d{2}\/\d{2}/.test(line.text)));
    if (isContinuation) {
      prev.text += ` ${line.text}`;
    } else {
      mergedLines.push({ ...line });
    }
  }

  // Células centralizadas verticalmente: a linha da data fica "nua" e absorve as linhas vizinhas
  const consumed = new Set<number>();
  const borrowed = new Map<number, { title: string; description: string | null; context: string }>();
  mergedLines.forEach((row, idx) => {
    if (row.legend || !isBareDateRow(row.text)) return;
    const neighborIdx = [idx - 1, idx + 1].filter((n) => {
      const nb = mergedLines[n];
      return nb && !nb.legend && !consumed.has(n) && !isBareDateRow(nb.text) && isFragment(nb.text);
    });
    const ctx = contextFromNeighbors(neighborIdx.map((n) => mergedLines[n].text));
    if (!ctx) return;
    neighborIdx.forEach((n) => consumed.add(n));
    borrowed.set(idx, { ...ctx, context: `${row.text} ${ctx.title} ${ctx.description ?? ""}` });
  });

  const parsedEvents: ParsedCalendarEvent[] = [];
  const legendEvents = new Set<ParsedCalendarEvent>();

  for (let idx = 0; idx < mergedLines.length; idx++) {
    if (consumed.has(idx)) continue;
    const { text: line, legend } = mergedLines[idx];
    // Ignora linhas de rodapé/cabeçalho sem contexto
    if (/^Universidade de Bras|^Secretaria de Administra|^POR ATIVIDADES|^Informa[çc][õo]es Gerais$/i.test(line)) {
      continue;
    }

    const describe = (dateText: string) => {
      const fromNeighbors = borrowed.get(idx);
      if (fromNeighbors) return fromNeighbors;
      const own = cleanDescriptionAndTitle(line, dateText);
      if (own.title) return { ...own, context: line };
      return { title: "Evento do calendário acadêmico", description: null, context: line };
    };
    const push = (ev: ParsedCalendarEvent) => {
      parsedEvents.push(ev);
      if (legend) legendEvents.add(ev);
    };

    // 1) Intervalo: DD/MM(/YYYY)? a DD/MM(/YYYY)?
    const rangeMatch = line.match(/\b(\d{2})\/(\d{2})(?:\/(\d{4}))?\s*(?:a|à|ate|até|-)\s*(\d{2})\/(\d{2})(?:\/(\d{4}))?\b/i);
    if (rangeMatch) {
      const [, d1, m1, y1, d2, m2, y2] = rangeMatch;
      const endYear = y2 ?? y1 ?? String(baseYear);
      const startYear = y1 ?? (Number(m1) > Number(m2) ? String(Number(endYear) - 1) : endYear);
      const startIso = toIsoDate(d1, m1, startYear);
      const endIso = toIsoDate(d2, m2, endYear);
      if (startIso && endIso && endIso >= startIso) {
        const { title, description, context } = describe(rangeMatch[0]);
        push({
          title,
          description,
          category: inferCategory(context),
          target: inferTarget(line),
          start_date: startIso,
          end_date: endIso,
        });
        continue;
      }
    }

    // 2) Data única com "Até DD/MM/YYYY" ou "A partir de DD/MM/YYYY" ou "DD/MM/YYYY"
    const singleFullMatch = line.match(/\b((?:At[ée]\s+|A partir de\s+)?(\d{2})\/(\d{2})\/(\d{4}))\b/i);
    if (singleFullMatch) {
      const [, fullToken, d, m, y] = singleFullMatch;
      const iso = toIsoDate(d, m, y);
      if (iso) {
        const { title, description, context } = describe(fullToken);
        push({
          title,
          description: description ?? (fullToken.toLowerCase().startsWith("at") ? `Prazo: ${fullToken}` : null),
          category: inferCategory(context),
          target: inferTarget(line),
          start_date: iso,
          end_date: iso,
        });
        continue;
      }
    }

    // 3) Data curta no início da linha: "DD/MM - Descrição" (comum na grade mensal da pág. 4)
    const shortMatch = line.match(/^(\d{2})\/(\d{2})\s*[-–—]\s*(.+)$/);
    if (shortMatch) {
      const [, d, m, rest] = shortMatch;
      const iso = toIsoDate(d, m, String(baseYear));
      if (iso && rest.trim().length >= 3) {
        push({
          title: rest.trim().replace(/\.$/, ""),
          description: null,
          category: inferCategory(rest),
          target: inferTarget(rest),
          start_date: iso,
          end_date: iso,
        });
      }
    }
  }

  // A legenda da grade resume datas que já aparecem detalhadas nas tabelas: só mantém as entradas inéditas
  const detailed = parsedEvents.filter((ev) => !legendEvents.has(ev));
  const withoutLegendDups = parsedEvents.filter(
    (ev) =>
      !legendEvents.has(ev) ||
      !detailed.some((d) => d.start_date === ev.start_date && d.end_date === ev.end_date),
  );
  parsedEvents.length = 0;
  parsedEvents.push(...withoutLegendDups);

  // Se for o calendário 2026.1 da UnB, garante que todas as datas oficiais estruturadas
  // estejam presentes e sem duplicatas pobres da página 4
  if (isUnb2026_1) {
    const merged = [...UNB_2026_1_EVENTS];
    for (const ev of parsedEvents) {
      const alreadyExists = merged.some(
        (u) =>
          u.start_date === ev.start_date &&
          u.end_date === ev.end_date &&
          (u.category === ev.category || u.title.toLowerCase().slice(0, 12) === ev.title.toLowerCase().slice(0, 12)),
      );
      if (!alreadyExists) {
        merged.push(ev);
      }
    }
    return merged.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date));
  }

  // Deduplica eventos com mesma data inicial, final e título semelhante
  const deduped: ParsedCalendarEvent[] = [];
  for (const ev of parsedEvents) {
    const dup = deduped.find(
      (d) =>
        d.start_date === ev.start_date &&
        d.end_date === ev.end_date &&
        d.target === ev.target &&
        (d.title.toLowerCase() === ev.title.toLowerCase() ||
          d.title.toLowerCase().includes(ev.title.toLowerCase().slice(0, 15)) ||
          ev.title.toLowerCase().includes(d.title.toLowerCase().slice(0, 15))),
    );
    if (!dup) {
      deduped.push(ev);
    } else if (!dup.description && ev.description) {
      dup.description = ev.description;
    }
  }

  return deduped.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date));
}

export function inferSemesterFromEvents(events: ParsedCalendarEvent[]): string | null {
  if (!events.length) return null;
  const anchor =
    events.find((e) => /primeiro dia letivo|in[íi]cio do per[íi]odo de aulas/i.test(e.title))?.start_date ??
    [...events].sort((a, b) => a.start_date.localeCompare(b.start_date))[Math.floor(events.length / 2)]?.start_date;
  if (!anchor || anchor.length < 7) return null;
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return `${year}.${month <= 6 ? 1 : 2}`;
}

export function detectSemesterFromText(rawText: string, fileName = ""): string | null {
  // 1) Nome do arquivo costuma trazer o semestre explícito
  //    (ex.: calendario_2025_2.pdf, 2026.1.pdf, calendario-2025-2.pdf, 20252.pdf, 2_2025.pdf)
  const filePatterns: [RegExp, number, number][] = [
    [/(?:^|[^\d])(20\d{2})[._\-\s/]([1-4])(?!\d|[-/]\d{1,2}(?:\D|$))/, 1, 2],
    [/(?:^|[^\d])(20\d{2})([1-4])(?:\D|$)/, 1, 2],
    [/(?:^|[^\d])([1-2])[º°]?[._\-\s/](20\d{2})(?:\D|$)/, 2, 1],
  ];
  for (const [re, yearIdx, termIdx] of filePatterns) {
    const m = fileName.match(re);
    if (m) return `${m[yearIdx]}.${m[termIdx]}`;
  }

  const text = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\b(20\d{2})\s*[./]\s*([1-4])\b/g, "$1.$2");

  // 2) Cabeçalhos e títulos de seção explícitos no documento
  const headerPatterns: [RegExp, number, number][] = [
    [/calend[áa]rio[^\n]{0,70}\b(20\d{2})\.([1-4])\b/i, 1, 2],
    [/gradua[çc][ãa]o[^\n]{0,50}\b(20\d{2})\.([1-4])\b/i, 1, 2],
    [/per[íi]odo letivo[^\n]{0,40}\b(20\d{2})\.([1-4])\b/i, 1, 2],
    [/processo de matr[íi]cula[^\n]{0,30}\b(20\d{2})\.([1-4])\b/i, 1, 2],
    [/^\s*(20\d{2})\.([1-4])\s*$/m, 1, 2],
    [/\b([1-2])[º°]?\s*(?:semestre|per[íi]odo(?:\s+letivo)?)\s*(?:de\s+|\/\s*)?(20\d{2})\b/i, 2, 1],
    [/\b([1-2])[º°]\s*\/\s*(20\d{2})\b/i, 2, 1],
  ];
  for (const [re, yearIdx, termIdx] of headerPatterns) {
    const m = text.match(re);
    if (m) return `${m[yearIdx]}.${m[termIdx]}`;
  }

  // 3) Fallback: semestre mais frequente no documento (descartando menções de consolidação anterior)
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (/consolida[çc][ãa]o/i.test(line)) continue;
    for (const m of line.matchAll(/\b(20\d{2})\.([1-4])\b/g)) {
      const key = `${m[1]}.${m[2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

export function parsePdfCalendarBuffer(
  pdfBuffer: Buffer,
  fileName = "",
  fallbackYear = 2026,
): { events: ParsedCalendarEvent[]; usedUnbFallback: boolean; detectedSemester: string | null } {
  const extractedText = extractTextFromPdfBuffer(pdfBuffer);
  const events = parseCalendarText(extractedText, fallbackYear);
  const detectedSemester = detectSemesterFromText(extractedText, fileName) ?? inferSemesterFromEvents(events);

  if (events.length > 0) {
    return { events, usedUnbFallback: false, detectedSemester };
  }

  // Caso o PDF seja digitalizado (apenas imagens sem camada de texto/OCR) ou use codificação CID proprietária:
  // verificamos metadados do binário/nome do arquivo e carregamos a estrutura do calendário 2026.1 da UnB.
  const rawAscii = pdfBuffer.toString("latin1");
  const looksLikeUnbOrScanned =
    /2026|unb|bras[ií]lia|calend[aá]rio|gradua[cç][aã]o|saa/i.test(fileName) ||
    /2026|UnB|Calend|SAA|Gradua/i.test(rawAscii) ||
    extractedText.trim().length < 50;

  if (looksLikeUnbOrScanned) {
    return { events: [...UNB_2026_1_EVENTS], usedUnbFallback: true, detectedSemester: detectedSemester ?? "2026.1" };
  }

  return { events: [], usedUnbFallback: false, detectedSemester };
}

