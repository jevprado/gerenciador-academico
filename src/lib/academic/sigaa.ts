import { extractPdfRows, type PdfRow } from "./pdf-parser";

// ---------------------------------------------------------------------------
// Leitura do "Atestado de Matrícula" emitido pelo SIGAA.
//
// Código de horário do SIGAA: <dias><turno><horários>, ex.: 24T23
//   dias      1 = domingo, 2 = segunda … 7 = sábado
//   turno     M (manhã), T (tarde), N (noite)
//   horários  posição do horário dentro do turno (T2 = 14:00–14:55)
// Uma turma pode ter mais de um bloco, separados por espaço: "2M12 4T34".
// ---------------------------------------------------------------------------

export type SigaaShift = "M" | "T" | "N";
export type SigaaBlock = { days: number[]; shift: SigaaShift; slots: number[] };
export type SubjectSchedule = { weekday: number; start_time: string; end_time: string };

export type ParsedEnrollmentSubject = {
  code: string;
  name: string;
  professor: string | null;
  room: string | null;
  classGroup: string | null;
  status: string;
  scheduleCode: string | null;
  schedules: SubjectSchedule[];
  /** Horários-aula por semana (cada um ≈ 1 h). */
  weeklySlots: number;
  workload_hours: number;
};

export type ParsedEnrollment = {
  period: { name: string; start_date: string | null; end_date: string | null } | null;
  subjects: ParsedEnrollmentSubject[];
};

type SlotTime = { start: string; end: string };

// Grade padrão do SIGAA da UnB. Usada quando o PDF não traz a tabela de horários
// (ou quando a tabela não cobre algum horário).
const DEFAULT_SLOTS: Record<SigaaShift, Record<number, SlotTime>> = {
  M: {
    1: { start: "08:00", end: "08:55" },
    2: { start: "08:55", end: "09:50" },
    3: { start: "10:00", end: "10:55" },
    4: { start: "10:55", end: "11:50" },
    5: { start: "12:00", end: "12:55" },
  },
  T: {
    1: { start: "12:55", end: "13:50" },
    2: { start: "14:00", end: "14:55" },
    3: { start: "14:55", end: "15:50" },
    4: { start: "16:00", end: "16:55" },
    5: { start: "16:55", end: "17:50" },
    6: { start: "18:00", end: "18:55" },
  },
  N: {
    1: { start: "19:00", end: "19:50" },
    2: { start: "19:50", end: "20:40" },
    3: { start: "20:50", end: "21:40" },
    4: { start: "21:40", end: "22:30" },
  },
};

/** Semestre letivo com ~15 semanas: cada horário-aula semanal vale 15 h. */
const HOURS_PER_WEEKLY_SLOT = 15;
export const DEFAULT_WORKLOAD = 60;

const BLOCK_RE = /^([1-7]+)([MTN])([1-9]+)$/;

export function parseSigaaScheduleCode(code: string): SigaaBlock[] {
  const blocks: SigaaBlock[] = [];
  for (const token of code.toUpperCase().split(/\s+/).filter(Boolean)) {
    const m = BLOCK_RE.exec(token);
    if (!m) continue;
    const digits = (s: string) => [...new Set([...s].map(Number))].sort((a, b) => a - b);
    blocks.push({ days: digits(m[1]), shift: m[2] as SigaaShift, slots: digits(m[3]) });
  }
  return blocks;
}

export const sigaaDayToWeekday = (day: number) => day - 1;

/**
 * Carga horária a partir dos horários semanais: 2 horários por semana = 30 h,
 * 4 = 60 h, 6 = 90 h. Para o caso comum (2 horários por encontro) é o mesmo
 * que 1x/2x/3x por semana, mas também acerta turmas como 7M1234 (sábado, 4 h).
 */
export function workloadFromSlots(weeklySlots: number) {
  return weeklySlots > 0 ? weeklySlots * HOURS_PER_WEEKLY_SLOT : DEFAULT_WORKLOAD;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// ---------------------------------------------------------------------------
// Tabela de Horários do PDF: linhas "HH:MM -" / códigos por dia / "HH:MM".
// ---------------------------------------------------------------------------
type TableCell = { weekday: number; start: string; end: string; code: string };

const DAY_NAMES: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, "sáb": 6 };
const CELL_TOKEN_RE = /^(?:-{2,}|[A-Z]{2,5}\d{3,5})$/;

function parseScheduleTable(rows: PdfRow[]): TableCell[] {
  const headerIdx = rows.findIndex((r) => /^Hor[áa]rios?\s+(Dom|Seg)\b/i.test(r.text));
  if (headerIdx < 0) return [];
  const columns = rows[headerIdx].text
    .split(/\s+/)
    .slice(1)
    .map((d) => DAY_NAMES[d.toLowerCase()]);
  if (!columns.length || columns.some((c) => c === undefined)) return [];

  const startOf = (r?: PdfRow) => /^(\d{2}:\d{2})\s*-$/.exec(r?.text ?? "")?.[1];
  const endOf = (r?: PdfRow) => /^(\d{2}:\d{2})$/.exec(r?.text ?? "")?.[1];

  const cells: TableCell[] = [];
  rows.forEach((row, i) => {
    const tokens = row.text.split(/\s+/);
    if (tokens.length !== columns.length || !tokens.every((t) => CELL_TOKEN_RE.test(t))) return;
    // A célula de horário tem duas linhas (início e fim), uma de cada lado da linha de códigos.
    const start = startOf(rows[i - 1]) ?? startOf(rows[i + 1]);
    const end = endOf(rows[i + 1]) ?? endOf(rows[i - 1]);
    if (!start || !end || toMinutes(end) <= toMinutes(start)) return;
    tokens.forEach((code, col) => {
      if (!code.startsWith("-")) cells.push({ weekday: columns[col], start, end, code });
    });
  });
  return cells;
}

// ---------------------------------------------------------------------------
// Montagem dos horários de cada disciplina
// ---------------------------------------------------------------------------
type SlotMap = Map<string, SlotTime>;

/** Aprende o horário real de cada posição (ex.: T2) cruzando os códigos com a tabela do PDF. */
function learnSlotTimes(subjects: { code: string; blocks: SigaaBlock[] }[], cells: TableCell[]): SlotMap {
  const learned: SlotMap = new Map();
  for (const { code, blocks } of subjects) {
    for (const block of blocks) {
      for (const day of block.days) {
        const matches = cells
          .filter((c) => c.code === code && c.weekday === sigaaDayToWeekday(day))
          .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        // Só confia quando a tabela tem exatamente os horários que o código indica.
        if (matches.length !== block.slots.length) continue;
        block.slots.forEach((slot, i) => {
          const key = `${block.shift}${slot}`;
          if (!learned.has(key)) learned.set(key, { start: matches[i].start, end: matches[i].end });
        });
      }
    }
  }
  return learned;
}

function sortSchedules(rows: SubjectSchedule[]) {
  return rows.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}

function schedulesFromBlocks(blocks: SigaaBlock[], learned: SlotMap): SubjectSchedule[] {
  const rows: SubjectSchedule[] = [];
  for (const block of blocks) {
    // Horários consecutivos (T2, T3) viram um único encontro: 14:00–15:50.
    const runs: number[][] = [];
    for (const slot of block.slots) {
      const last = runs[runs.length - 1];
      if (last && slot === last[last.length - 1] + 1) last.push(slot);
      else runs.push([slot]);
    }
    for (const day of block.days) {
      for (const run of runs) {
        const times = run
          .map((slot) => learned.get(`${block.shift}${slot}`) ?? DEFAULT_SLOTS[block.shift][slot])
          .filter((t): t is SlotTime => Boolean(t));
        if (!times.length) continue;
        rows.push({ weekday: sigaaDayToWeekday(day), start_time: times[0].start, end_time: times[times.length - 1].end });
      }
    }
  }
  return sortSchedules(rows);
}

/** Sem código de horário legível: monta os encontros direto da tabela do PDF. */
function schedulesFromTable(code: string, cells: TableCell[]): SubjectSchedule[] {
  const mine = cells
    .filter((c) => c.code === code)
    .sort((a, b) => a.weekday - b.weekday || toMinutes(a.start) - toMinutes(b.start));
  const rows: SubjectSchedule[] = [];
  for (const c of mine) {
    const last = rows[rows.length - 1];
    if (last && last.weekday === c.weekday && toMinutes(c.start) - toMinutes(last.end_time) <= 10) {
      last.end_time = c.end;
    } else {
      rows.push({ weekday: c.weekday, start_time: c.start, end_time: c.end });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Tabela "Turmas Matriculadas"
// ---------------------------------------------------------------------------
const CODE = String.raw`[A-Z]{2,5}\d{3,5}`;
const SUBJECT_ROW_RE = new RegExp(
  String.raw`^(${CODE})\s*(.+?)\s+([A-Z]?\d{1,3}[A-Z]?)\s+(\p{Lu}+(?:\s+\p{Lu}+)*(?:\s*\(\p{Lu}{1,2}\))?)` +
    String.raw`(?:\s+((?:[1-7]+[MTN][1-9]+)(?:\s+[1-7]+[MTN][1-9]+)*))?\s*(?:\(\s*\d{2}\/\d{2}\/\d{4}.*)?$`,
  "u",
);
const SUBJECTS_HEADER_RE = /^C[óo]d\.?\s*Componentes/i;
const TABLE_TITLE_RE = /^Tabela de Hor[áa]rios/i;
const DATE_TAIL_RE = /\s*\(?\s*\d{2}\/\d{2}\/\d{4}\s*\)?\s*-?\s*$/;

const LOWER_WORDS = new Set([
  "a", "à", "ao", "aos", "as", "às", "com", "da", "das", "de", "do", "dos", "e", "em",
  "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelo", "por",
]);
const ROMAN_RE = /^(?=[IVX]+$)X{0,3}(?:IX|IV|V?I{0,3})$/;

/** "INTELIGÊNCIA ARTIFICIAL" → "Inteligência Artificial"; mantém algarismos romanos. */
export function titleCase(text: string) {
  return text
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const upper = word.toLocaleUpperCase("pt-BR");
      if (ROMAN_RE.test(upper)) return upper;
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      return word.replace(/(^|[-/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

const rowSize = (row: PdfRow) => row.items[0]?.size ?? 0;

type RawSubject = {
  code: string;
  nameParts: string[];
  professors: string[];
  room: string | null;
  classGroup: string;
  status: string;
  scheduleCode: string | null;
};

function parseSubjectRows(rows: PdfRow[]): RawSubject[] {
  const subjects: RawSubject[] = [];
  let current: { raw: RawSubject; nameSize: number; extra: PdfRow[]; closed: boolean } | null = null;

  const finish = () => {
    if (!current) return;
    const { raw, nameSize, extra } = current;
    const texts = extra.map((r) => r.text.replace(DATE_TAIL_RE, "").trim());
    // Nome continua na mesma fonte do nome; docentes vêm em fonte menor.
    const sizesDiffer = extra.some((r) => rowSize(r) < nameSize * 0.95);
    texts.forEach((t, i) => {
      if (!t) return;
      const isName = sizesDiffer ? rowSize(extra[i]) >= nameSize * 0.95 : i < texts.length - 1;
      if (isName) raw.nameParts.push(t);
      else raw.professors.push(t.replace(/\s*\(\d+h\)\s*$/i, ""));
    });
    subjects.push(raw);
    current = null;
  };

  for (const row of rows) {
    if (TABLE_TITLE_RE.test(row.text)) break;
    const m = SUBJECT_ROW_RE.exec(row.text);
    if (m) {
      finish();
      current = {
        raw: {
          code: m[1],
          nameParts: [m[2].trim()],
          professors: [],
          room: null,
          classGroup: m[3],
          status: m[4].trim(),
          scheduleCode: m[5]?.trim() ?? null,
        },
        nameSize: Math.max(...row.items.map((i) => i.size)),
        extra: [],
        closed: false,
      };
      continue;
    }
    if (!current || current.closed) continue;
    const text = row.text.replace(DATE_TAIL_RE, "").trim();
    if (/\b(Tipo|Local):/i.test(text)) {
      current.raw.room = /Local:\s*(.+)$/i.exec(text)?.[1].trim() || null;
      current.closed = true; // A linha "Tipo/Local" fecha o bloco da turma.
      continue;
    }
    current.extra.push(row);
  }
  finish();
  return subjects;
}

function toIso(br: string | undefined) {
  const m = br ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parsePeriod(text: string): ParsedEnrollment["period"] {
  const m = /Per[íi]odo\s+Letivo:\s*(\d{4}\.\d)(?:\s*\((\d{2}\/\d{2}\/\d{4})\s*(?:à|a|-)\s*(\d{2}\/\d{2}\/\d{4})\))?/i.exec(text);
  if (!m) return null;
  return { name: m[1], start_date: toIso(m[2]), end_date: toIso(m[3]) };
}

/** Coloca as linhas na ordem de leitura (o SIGAA gera PDFs com o eixo y invertido). */
function readingOrder(pages: PdfRow[][]): PdfRow[] {
  let topDown = false;
  for (const rows of pages) {
    const header = rows.find((r) => SUBJECTS_HEADER_RE.test(r.text));
    const first = rows.find((r) => SUBJECT_ROW_RE.test(r.text));
    if (header && first) {
      topDown = first.y > header.y;
      break;
    }
  }
  return pages.flatMap((rows) => (topDown ? [...rows].reverse() : rows));
}

export function parseEnrollmentRows(pages: PdfRow[][]): ParsedEnrollment {
  const rows = readingOrder(pages);
  const raw = parseSubjectRows(rows);
  const cells = parseScheduleTable(rows);
  const withBlocks = raw.map((s) => ({ ...s, blocks: parseSigaaScheduleCode(s.scheduleCode ?? "") }));
  const learned = learnSlotTimes(withBlocks, cells);

  const subjects = withBlocks.map((s): ParsedEnrollmentSubject => {
    const fromCode = s.blocks.length > 0;
    const schedules = fromCode ? schedulesFromBlocks(s.blocks, learned) : schedulesFromTable(s.code, cells);
    const weeklySlots = fromCode
      ? s.blocks.reduce((acc, b) => acc + b.days.length * b.slots.length, 0)
      : cells.filter((c) => c.code === s.code).length;
    return {
      code: s.code,
      name: titleCase(s.nameParts.join(" ")),
      professor: s.professors.length ? s.professors.map(titleCase).join(", ") : null,
      room: s.room,
      classGroup: s.classGroup,
      status: s.status,
      scheduleCode: s.scheduleCode,
      schedules,
      weeklySlots,
      workload_hours: workloadFromSlots(weeklySlots),
    };
  });

  return { period: parsePeriod(rows.map((r) => r.text).join("\n")), subjects };
}

export function parseEnrollmentPdf(pdfBuffer: Buffer): ParsedEnrollment {
  return parseEnrollmentRows(extractPdfRows(pdfBuffer));
}
