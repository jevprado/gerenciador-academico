"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { CALENDAR_CATEGORIES, type ParsedCalendarEvent } from "@/lib/academic/calendar-types";
import {
  detectSemesterFromText,
  inferSemesterFromEvents,
  parseCalendarText,
  parsePdfCalendarBuffer,
} from "@/lib/academic/pdf-parser";
import { createClient } from "@/lib/supabase/server";

// Estado devolvido aos formulários. `ok` muda a cada sucesso para o form se limpar.
export type FormState = { error?: string; ok?: number } | undefined;

const ASSESSMENT_TYPES = ["prova", "trabalho", "lista", "seminario", "outro"] as const;
const PRIORITIES = ["baixa", "media", "alta"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

class InvalidInput extends Error {}

function text(fd: FormData, name: string, { required = false, max = 200 } = {}) {
  const raw = fd.get(name);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (required && !value) throw new InvalidInput("Preencha todos os campos obrigatórios.");
  if (value.length > max) throw new InvalidInput("Algum texto ficou longo demais.");
  return value || null;
}

// Aceita vírgula como separador decimal (RNF04).
function num(fd: FormData, name: string, { required = false, min = 0, max = Infinity, label = "valor" } = {}) {
  const raw = text(fd, name, { required, max: 20 });
  if (raw === null) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) {
    const fmt = (v: number) => v.toLocaleString("pt-BR");
    throw new InvalidInput(max === Infinity ? `Informe ${label} a partir de ${fmt(min)}.` : `Informe ${label} entre ${fmt(min)} e ${fmt(max)}.`);
  }
  return n;
}

function pick<T extends readonly string[]>(fd: FormData, name: string, options: T, fallback: T[number]): T[number] {
  const v = fd.get(name);
  return typeof v === "string" && (options as readonly string[]).includes(v) ? v : fallback;
}

function date(fd: FormData, name: string, required = true) {
  const v = text(fd, name, { required, max: 10 });
  if (v && !DATE_RE.test(v)) throw new InvalidInput("Data inválida.");
  return v;
}

// Erros do banco em linguagem não técnica (RNF06).
function dbMessage(error: { code?: string; message: string }) {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return "Tabela não encontrada no Supabase. Rode a migração mais recente em supabase/migrations no SQL Editor.";
  }
  if (error.code === "23514") return "Algum valor está fora do permitido. Confira datas e números.";
  if (error.code === "23505") return "Já existe um registro igual.";
  if (error.message.includes("inválid")) return "Registro não encontrado. Recarregue a página.";
  return "Não foi possível salvar agora. Tente novamente.";
}

// Envolve uma ação de formulário: valida, grava e atualiza a tela.
async function run(work: (fd: FormData) => Promise<{ error: { code?: string; message: string } | null } | void>, fd: FormData): Promise<FormState> {
  try {
    const res = await work(fd);
    if (res?.error) {
      // Mostra no terminal o erro real do banco; a tela recebe só a mensagem amigável.
      console.error("[academic] Erro do Supabase:", res.error);
      return { error: dbMessage(res.error) };
    }
  } catch (e) {
    if (e instanceof InvalidInput) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: Date.now() };
}

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return supabase;
}

// ---------------------------------------------------------------------------
// Semestres
// ---------------------------------------------------------------------------
function semesterFields(fd: FormData) {
  const start = date(fd, "start_date");
  const end = date(fd, "end_date");
  if (start! >= end!) throw new InvalidInput("A data de término deve ser depois do início.");
  return {
    name: text(fd, "name", { required: true, max: 40 }),
    start_date: start,
    end_date: end,
    min_average: num(fd, "min_average", { required: true, max: 10, label: "a média mínima" }),
    min_attendance: num(fd, "min_attendance", { required: true, max: 100, label: "a frequência mínima" }),
  };
}

export async function createSemester(_: FormState, fd: FormData) {
  return run(async () => {
    const fields = semesterFields(fd);
    const supabase = await db();
    const makeCurrent = fd.get("is_current") === "on";
    if (makeCurrent) {
      const { error } = await supabase.from("semesters").update({ is_current: false }).eq("is_current", true);
      if (error) return { error };
    }
    return supabase.from("semesters").insert({ ...fields, is_current: makeCurrent });
  }, fd);
}

export async function updateSemester(id: string, _: FormState, fd: FormData) {
  return run(async () => {
    const fields = semesterFields(fd);
    const supabase = await db();
    return supabase.from("semesters").update(fields).eq("id", id);
  }, fd);
}

export async function setCurrentSemester(id: string) {
  const supabase = await db();
  await supabase.from("semesters").update({ is_current: false }).eq("is_current", true);
  await supabase.from("semesters").update({ is_current: true, archived: false }).eq("id", id);
  refresh();
}

export async function deleteSemester(id: string) {
  const supabase = await db();
  await supabase.from("semesters").delete().eq("id", id);
  refresh();
}

// ---------------------------------------------------------------------------
// Disciplinas
// ---------------------------------------------------------------------------
function subjectFields(fd: FormData) {
  const color = text(fd, "color", { max: 7 }) ?? "#275e4c";
  if (!COLOR_RE.test(color)) throw new InvalidInput("Cor inválida.");
  return {
    name: text(fd, "name", { required: true, max: 120 }),
    code: text(fd, "code", { max: 30 }),
    professor: text(fd, "professor", { max: 120 }),
    room: text(fd, "room", { max: 60 }),
    color,
    workload_hours: num(fd, "workload_hours", { required: true, min: 1, max: 1000, label: "a carga horária" }),
    min_average: num(fd, "min_average", { max: 10, label: "a média mínima" }),
    min_attendance: num(fd, "min_attendance", { max: 100, label: "a frequência mínima" }),
  };
}

// Horários vêm como campos repetidos: weekday[], start_time[], end_time[].
function schedules(fd: FormData) {
  const days = fd.getAll("weekday");
  const starts = fd.getAll("start_time");
  const ends = fd.getAll("end_time");
  const rows: { weekday: number; start_time: string; end_time: string }[] = [];
  days.forEach((d, i) => {
    const s = String(starts[i] ?? "");
    const e = String(ends[i] ?? "");
    if (d === "" || (!s && !e)) return;
    if (!TIME_RE.test(s) || !TIME_RE.test(e) || e <= s) throw new InvalidInput("Confira os horários: o fim deve ser depois do início.");
    const weekday = Number(d);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new InvalidInput("Dia da semana inválido.");
    rows.push({ weekday, start_time: s, end_time: e });
  });
  return rows;
}

export async function createSubject(_: FormState, fd: FormData) {
  return run(async () => {
    const fields = subjectFields(fd);
    const rows = schedules(fd);
    const supabase = await db();
    const { data, error } = await supabase
      .from("subjects")
      .insert({ ...fields, semester_id: text(fd, "semester_id", { required: true }) })
      .select("id")
      .single();
    if (error) return { error };
    if (rows.length) return supabase.from("class_schedules").insert(rows.map((r) => ({ ...r, subject_id: data.id })));
  }, fd);
}

export async function updateSubject(id: string, _: FormState, fd: FormData) {
  return run(async () => {
    const fields = subjectFields(fd);
    const rows = schedules(fd);
    const status = pick(fd, "status", ["cursando", "aprovado", "reprovado", "trancado"] as const, "cursando");
    const supabase = await db();
    const { error } = await supabase.from("subjects").update({ ...fields, status }).eq("id", id);
    if (error) return { error };
    const del = await supabase.from("class_schedules").delete().eq("subject_id", id);
    if (del.error) return del;
    if (rows.length) return supabase.from("class_schedules").insert(rows.map((r) => ({ ...r, subject_id: id })));
  }, fd);
}

export async function deleteSubject(id: string) {
  const supabase = await db();
  await supabase.from("subjects").delete().eq("id", id);
  redirect("/disciplinas");
}

// ---------------------------------------------------------------------------
// Avaliações e notas
// ---------------------------------------------------------------------------
export async function createAssessment(subjectId: string, _: FormState, fd: FormData) {
  return run(async () => {
    const maxGrade = num(fd, "max_grade", { required: true, min: 0.1, max: 1000, label: "a nota máxima" })!;
    const supabase = await db();
    return supabase.from("assessments").insert({
      subject_id: subjectId,
      name: text(fd, "name", { required: true, max: 120 }),
      type: pick(fd, "type", ASSESSMENT_TYPES, "prova"),
      date: date(fd, "date", false),
      weight: num(fd, "weight", { required: true, min: 0.01, max: 100, label: "o peso" }),
      max_grade: maxGrade,
      grade: num(fd, "grade", { max: maxGrade, label: "a nota" }),
    });
  }, fd);
}

export async function setGrade(id: string, _: FormState, fd: FormData) {
  return run(async () => {
    const supabase = await db();
    return supabase.from("assessments").update({ grade: num(fd, "grade", { max: 1000, label: "a nota" }) }).eq("id", id);
  }, fd);
}

export async function deleteAssessment(id: string) {
  const supabase = await db();
  await supabase.from("assessments").delete().eq("id", id);
  refresh();
}

// ---------------------------------------------------------------------------
// Faltas
// ---------------------------------------------------------------------------
export async function createAbsence(subjectId: string, _: FormState, fd: FormData) {
  return run(async () => {
    const supabase = await db();
    return supabase.from("absences").insert({
      subject_id: subjectId,
      date: date(fd, "date"),
      quantity: num(fd, "quantity", { required: true, min: 1, max: 20, label: "a quantidade" }),
    });
  }, fd);
}

export async function deleteAbsence(id: string) {
  const supabase = await db();
  await supabase.from("absences").delete().eq("id", id);
  refresh();
}

// ---------------------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------------------
function deadlineFields(fd: FormData) {
  const day = date(fd, "date");
  const time = text(fd, "time", { max: 5 }) ?? "23:59";
  if (!TIME_RE.test(time)) throw new InvalidInput("Horário inválido.");
  return {
    subject_id: text(fd, "subject_id"),
    title: text(fd, "title", { required: true, max: 200 }),
    description: text(fd, "description", { max: 2000 }),
    type: pick(fd, "type", ASSESSMENT_TYPES, "trabalho"),
    priority: pick(fd, "priority", PRIORITIES, "media"),
    // Horário de Brasília (sem horário de verão desde 2019).
    due_at: `${day}T${time}:00-03:00`,
  };
}

export async function createDeadline(_: FormState, fd: FormData) {
  return run(async () => {
    const fields = deadlineFields(fd);
    const supabase = await db();
    return supabase.from("deadlines").insert({ ...fields, semester_id: text(fd, "semester_id", { required: true }) });
  }, fd);
}

export async function updateDeadline(id: string, _: FormState, fd: FormData) {
  return run(async () => {
    const fields = deadlineFields(fd);
    const supabase = await db();
    return supabase.from("deadlines").update(fields).eq("id", id);
  }, fd);
}

export async function toggleDeadline(id: string, done: boolean) {
  const supabase = await db();
  await supabase.from("deadlines").update({ completed_at: done ? new Date().toISOString() : null }).eq("id", id);
  refresh();
}

export async function deleteDeadline(id: string) {
  const supabase = await db();
  await supabase.from("deadlines").delete().eq("id", id);
  refresh();
}

// ---------------------------------------------------------------------------
// Calendário do Semestre (PDF + Manual)
// ---------------------------------------------------------------------------
function calendarEventFields(fd: FormData) {
  const start = date(fd, "start_date", true)!;
  const end = date(fd, "end_date", false) ?? start;
  if (end < start) throw new InvalidInput("A data de término não pode ser anterior à data de início.");
  return {
    title: text(fd, "title", { required: true, max: 200 }),
    description: text(fd, "description", { max: 2000 }),
    category: pick(fd, "category", CALENDAR_CATEGORIES, "academico"),
    target: text(fd, "target", { max: 60 }),
    start_date: start,
    end_date: end,
  };
}

export async function createCalendarEvent(_: FormState, fd: FormData) {
  return run(async () => {
    const fields = calendarEventFields(fd);
    const supabase = await db();
    return supabase.from("calendar_events").insert({
      ...fields,
      semester_id: text(fd, "semester_id", { required: true }),
      source: "manual",
    });
  }, fd);
}

export async function updateCalendarEvent(id: string, _: FormState, fd: FormData) {
  return run(async () => {
    const fields = calendarEventFields(fd);
    const supabase = await db();
    return supabase.from("calendar_events").update(fields).eq("id", id);
  }, fd);
}

export async function deleteCalendarEvent(id: string) {
  const supabase = await db();
  await supabase.from("calendar_events").delete().eq("id", id);
  refresh();
}

export async function clearCalendarEvents(semesterId: string) {
  const supabase = await db();
  await supabase.from("calendar_events").delete().eq("semester_id", semesterId);
  refresh();
}

export type PdfExtractResult = {
  error?: string;
  events?: ParsedCalendarEvent[];
  usedUnbFallback?: boolean;
  fileName?: string;
  detectedSemester?: string | null;
};

export async function extractCalendarFromPdf(fd: FormData): Promise<PdfExtractResult> {
  await db();
  const yearRaw = fd.get("fallback_year");
  const fallbackYear = typeof yearRaw === "string" && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : 2026;

  const rawText = fd.get("raw_text");
  if (typeof rawText === "string" && rawText.trim().length > 0) {
    const events = parseCalendarText(rawText, fallbackYear);
    if (!events.length) {
      return { error: "Nenhuma data no formato DD/MM/AAAA ou DD/MM foi identificada no texto informado." };
    }
    return {
      events,
      usedUnbFallback: false,
      detectedSemester: detectSemesterFromText(rawText) ?? inferSemesterFromEvents(events),
    };
  }

  const file = fd.get("pdf");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo PDF válido." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { error: "O arquivo PDF deve ter no máximo 15 MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { events, usedUnbFallback, detectedSemester } = parsePdfCalendarBuffer(buffer, file.name, fallbackYear);
    if (!events.length) {
      return {
        error:
          "Não foi possível identificar datas neste PDF (ele pode estar digitalizado como imagem). Use a opção de colar o texto manualmente.",
      };
    }
    return { events, usedUnbFallback, fileName: file.name, detectedSemester };
  } catch (e) {
    console.error("[calendar] Erro ao ler PDF:", e);
    return { error: "Não foi possível processar o arquivo PDF enviado." };
  }
}

export type CalendarImportTarget =
  | { mode: "existing"; semesterId: string }
  | { mode: "create"; name: string; startDate: string; endDate: string };

export async function importCalendarEvents(
  target: CalendarImportTarget,
  events: ParsedCalendarEvent[],
  replaceExistingPdf = false,
): Promise<{ error?: string; count?: number; semesterId?: string; semesterName?: string }> {
  if (!Array.isArray(events) || events.length === 0) {
    return { error: "Selecione pelo menos uma data para importar." };
  }

  const normalized: Omit<ParsedCalendarEvent, never>[] = [];
  for (const ev of events) {
    const title = (ev.title ?? "").trim().slice(0, 200);
    const start = (ev.start_date ?? "").trim();
    const end = (ev.end_date ?? start).trim();
    if (!title || !DATE_RE.test(start) || !DATE_RE.test(end) || end < start) continue;
    const category = (CALENDAR_CATEGORIES as readonly string[]).includes(ev.category) ? ev.category : "academico";
    normalized.push({
      title,
      description: ev.description ? ev.description.trim().slice(0, 2000) : null,
      category,
      target: ev.target ? ev.target.trim().slice(0, 60) : null,
      start_date: start,
      end_date: end,
    });
  }

  if (!normalized.length) {
    return { error: "Nenhum evento válido para importar." };
  }

  const supabase = await db();
  let semesterId = "";
  let semesterName = "";

  if (target.mode === "create") {
    const cleanName = target.name.trim().slice(0, 40);
    if (!cleanName) return { error: "Informe o nome do semestre do calendário (ex.: 2025.2)." };
    if (!DATE_RE.test(target.startDate) || !DATE_RE.test(target.endDate) || target.endDate <= target.startDate) {
      return { error: "Não foi possível definir as datas de início e término do semestre." };
    }

    // Reaproveita se já existir um semestre com exatamente esse nome.
    const { data: existingList } = await supabase.from("semesters").select("id, name");
    const existing = (existingList ?? []).find((s) => s.name.trim().toLowerCase() === cleanName.toLowerCase());

    if (existing) {
      semesterId = existing.id;
      semesterName = existing.name;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("semesters")
        .insert({
          name: cleanName,
          start_date: target.startDate,
          end_date: target.endDate,
          is_current: false,
          min_average: 6,
          min_attendance: 75,
        })
        .select("id, name")
        .single();
      if (createErr || !created) {
        if (createErr) console.error("[calendar] Erro ao criar semestre:", createErr);
        return { error: createErr ? dbMessage(createErr) : "Não foi possível criar o semestre do calendário." };
      }
      semesterId = created.id;
      semesterName = created.name;
    }
  } else {
    if (!target.semesterId) return { error: "Semestre inválido." };
    semesterId = target.semesterId;
  }

  if (replaceExistingPdf) {
    const del = await supabase.from("calendar_events").delete().eq("semester_id", semesterId).eq("source", "pdf");
    if (del.error) {
      console.error("[calendar] Erro ao substituir eventos anteriores:", del.error);
      return { error: dbMessage(del.error) };
    }
  }

  const rows = normalized.map((ev) => ({
    ...ev,
    semester_id: semesterId,
    source: "pdf" as const,
  }));

  const { error } = await supabase.from("calendar_events").insert(rows);
  if (error) {
    console.error("[calendar] Erro ao importar eventos do PDF:", error);
    return { error: dbMessage(error) };
  }

  refresh();
  return { count: rows.length, semesterId, semesterName };
}

