"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/academic/attendance";
import { CALENDAR_CATEGORIES, type ParsedCalendarEvent } from "@/lib/academic/calendar-types";
import {
  detectSemesterFromText,
  inferSemesterFromEvents,
  parseCalendarText,
  parsePdfCalendarBuffer,
} from "@/lib/academic/pdf-parser";
import { parseEnrollmentPdf, type ParsedEnrollment, type ParsedEnrollmentSubject, type SubjectSchedule } from "@/lib/academic/sigaa";
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
  if (error.code === "PGRST205" || error.code === "PGRST200" || error.code === "42P01") {
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
// Frequência (uma marcação por disciplina e data)
// ---------------------------------------------------------------------------
type AttendanceInput = { date: string; hours: number };

function validAttendance(items: AttendanceInput[]) {
  return items.every(
    (i) => DATE_RE.test(i?.date ?? "") && Number.isInteger(i.hours) && i.hours >= 1 && i.hours <= 12,
  );
}

/** Marca (ou desmarca, com status null) a frequência de um dia de aula. */
export async function setAttendance(
  subjectId: string,
  date: string,
  hours: number,
  status: AttendanceStatus | null,
): Promise<{ error?: string }> {
  if (!validAttendance([{ date, hours }])) return { error: "Data de aula inválida." };
  if (status !== null && !(ATTENDANCE_STATUSES as readonly string[]).includes(status)) return { error: "Status inválido." };
  const supabase = await db();
  const { error } =
    status === null
      ? await supabase.from("class_attendance").delete().eq("subject_id", subjectId).eq("date", date)
      : await supabase
          .from("class_attendance")
          .upsert(
            { subject_id: subjectId, date, hours, status, updated_at: new Date().toISOString() },
            { onConflict: "subject_id,date" },
          );
  if (error) {
    console.error("[frequencia] Erro ao salvar:", error);
    return { error: dbMessage(error) };
  }
  refresh();
  return {};
}

/** Marca de uma vez várias aulas (ex.: todas as passadas sem registro como presença). */
export async function markAttendanceBulk(
  subjectId: string,
  items: AttendanceInput[],
  status: AttendanceStatus,
): Promise<{ error?: string; count?: number }> {
  if (!Array.isArray(items) || !items.length || items.length > 200 || !validAttendance(items)) {
    return { error: "Nenhuma aula válida para marcar." };
  }
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) return { error: "Status inválido." };
  const supabase = await db();
  const now = new Date().toISOString();
  const { error } = await supabase.from("class_attendance").upsert(
    items.map(({ date, hours }) => ({ subject_id: subjectId, date, hours, status, updated_at: now })),
    { onConflict: "subject_id,date" },
  );
  if (error) {
    console.error("[frequencia] Erro ao salvar em lote:", error);
    return { error: dbMessage(error) };
  }
  refresh();
  return { count: items.length };
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


// ---------------------------------------------------------------------------
// Disciplinas a partir do Atestado de Matrícula (SIGAA)
// ---------------------------------------------------------------------------
export type EnrollmentPreviewSubject = ParsedEnrollmentSubject & { alreadyExists: boolean };

export type EnrollmentExtractResult = {
  error?: string;
  period?: ParsedEnrollment["period"];
  subjects?: EnrollmentPreviewSubject[];
  fileName?: string;
};

const normCode = (code: string | null | undefined) => (code ?? "").trim().toUpperCase();

async function existingSubjectCodes(supabase: Awaited<ReturnType<typeof db>>, semesterId: string) {
  const { data, error } = await supabase.from("subjects").select("code").eq("semester_id", semesterId);
  if (error) return { error, codes: new Set<string>() };
  return { error: null, codes: new Set((data ?? []).map((s) => normCode(s.code)).filter(Boolean)) };
}

export async function extractSubjectsFromPdf(fd: FormData): Promise<EnrollmentExtractResult> {
  const supabase = await db();
  const semesterId = fd.get("semester_id");
  if (typeof semesterId !== "string" || !semesterId) return { error: "Semestre inválido." };

  const file = fd.get("pdf");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo PDF válido." };
  if (file.size > 5 * 1024 * 1024) return { error: "O arquivo PDF deve ter no máximo 5 MB." };

  let parsed: ParsedEnrollment;
  try {
    parsed = parseEnrollmentPdf(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error("[disciplinas] Erro ao ler PDF:", e);
    return { error: "Não foi possível processar o arquivo PDF enviado." };
  }
  if (!parsed.subjects.length) {
    return {
      error: "Nenhuma disciplina encontrada. Envie o Atestado de Matrícula emitido pelo SIGAA (Portal Discente → Ensino → Atestado de Matrícula).",
    };
  }

  const { error, codes } = await existingSubjectCodes(supabase, semesterId);
  if (error) {
    console.error("[disciplinas] Erro ao consultar disciplinas:", error);
    return { error: dbMessage(error) };
  }
  return {
    period: parsed.period,
    fileName: file.name,
    subjects: parsed.subjects.map((s) => ({ ...s, alreadyExists: codes.has(normCode(s.code)) })),
  };
}

export type SubjectImportItem = {
  name: string;
  code: string;
  professor: string | null;
  room: string | null;
  color: string;
  workload_hours: number;
  schedules: SubjectSchedule[];
};

const clip = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function importSubjects(
  semesterId: string,
  items: SubjectImportItem[],
): Promise<{ error?: string; count?: number; skipped?: number }> {
  if (!semesterId) return { error: "Semestre inválido." };
  if (!Array.isArray(items) || !items.length) return { error: "Selecione pelo menos uma disciplina para adicionar." };

  // Os dados vêm do navegador: valida tudo de novo antes de gravar.
  const clean: (Omit<SubjectImportItem, "code"> & { code: string })[] = [];
  for (const item of items.slice(0, 30)) {
    const name = clip(item?.name, 120);
    const code = normCode(clip(item?.code, 30));
    const workload = Math.round(Number(item?.workload_hours));
    if (!name || !code) return { error: "Toda disciplina precisa de nome e código." };
    if (!Number.isFinite(workload) || workload < 1 || workload > 1000) return { error: `Carga horária inválida em ${name}.` };
    const schedules = (Array.isArray(item.schedules) ? item.schedules : []).slice(0, 14);
    for (const r of schedules) {
      if (!Number.isInteger(r?.weekday) || r.weekday < 0 || r.weekday > 6) return { error: `Dia da semana inválido em ${name}.` };
      if (!TIME_RE.test(r.start_time) || !TIME_RE.test(r.end_time) || r.end_time <= r.start_time) {
        return { error: `Confira os horários de ${name}.` };
      }
    }
    if (clean.some((c) => c.code === code)) continue;
    clean.push({
      name,
      code,
      professor: clip(item.professor, 120),
      room: clip(item.room, 60),
      color: typeof item.color === "string" && COLOR_RE.test(item.color) ? item.color : "#275e4c",
      workload_hours: workload,
      schedules: schedules.map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time })),
    });
  }

  const supabase = await db();
  const existing = await existingSubjectCodes(supabase, semesterId);
  if (existing.error) {
    console.error("[disciplinas] Erro ao consultar disciplinas:", existing.error);
    return { error: dbMessage(existing.error) };
  }
  // Não duplica disciplinas que já estão no semestre (mesmo código).
  const fresh = clean.filter((c) => !existing.codes.has(c.code));
  const skipped = items.length - fresh.length;
  if (!fresh.length) return { error: "Essas disciplinas já estão cadastradas neste semestre." };

  const { data: created, error } = await supabase
    .from("subjects")
    .insert(
      fresh.map(({ name, code, professor, room, color, workload_hours }) => ({
        name,
        code,
        professor,
        room,
        color,
        workload_hours,
        semester_id: semesterId,
      })),
    )
    .select("id, code");
  if (error || !created) {
    if (error) console.error("[disciplinas] Erro ao importar disciplinas:", error);
    return { error: error ? dbMessage(error) : "Não foi possível adicionar as disciplinas." };
  }

  const idByCode = new Map(created.map((c) => [normCode(c.code), c.id as string]));
  const scheduleRows = fresh.flatMap((s) =>
    s.schedules.map((r) => ({ ...r, subject_id: idByCode.get(s.code)! })).filter((r) => r.subject_id),
  );
  if (scheduleRows.length) {
    const res = await supabase.from("class_schedules").insert(scheduleRows);
    if (res.error) {
      console.error("[disciplinas] Erro ao gravar horários:", res.error);
      // Desfaz para não deixar disciplinas sem horário pela metade.
      await supabase.from("subjects").delete().in("id", created.map((c) => c.id));
      return { error: dbMessage(res.error) };
    }
  }

  refresh();
  return { count: created.length, skipped };
}
