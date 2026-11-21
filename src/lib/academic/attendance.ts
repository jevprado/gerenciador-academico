// Frequência: gera as datas de aula de uma disciplina cruzando os horários semanais com o
// período letivo e o calendário do semestre (feriados, semana universitária…). Só as
// marcações do estudante ficam no banco; o resto é calculado aqui.

export const ATTENDANCE_STATUSES = ["presente", "falta", "cancelada", "sem_aula"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** Status mostrado na tela: o marcado ou, sem marcação, o deduzido. */
export type SessionStatus = AttendanceStatus | "pendente" | "prevista";

export type AttendanceMark = { date: string; status: AttendanceStatus; hours: number };
type ScheduleLike = { weekday: number; start_time: string; end_time: string };
type EventLike = { title: string; category: string; start_date: string; end_date: string };

export type ClassSession = {
  number: number;
  date: string;
  weekday: number;
  times: { start: string; end: string }[];
  /** Horas-aula do dia (contam como falta se o estudante faltar). */
  hours: number;
  mark: AttendanceStatus | null;
  /** Evento do calendário que suspende a aula neste dia (feriado, semana universitária…). */
  blockedBy: string | null;
  status: SessionStatus;
  /** Marcação numa data que não bate mais com os horários / período letivo. */
  offSchedule: boolean;
};

export const STATUS_META: Record<SessionStatus, { label: string; className: string }> = {
  presente: {
    label: "Presente",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  falta: { label: "Faltei", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelada: { label: "Cancelada", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  sem_aula: { label: "Sem aula", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  pendente: { label: "Sem registro", className: "bg-background text-muted ring-1 ring-inset ring-line" },
  prevista: { label: "Prevista", className: "bg-background text-muted" },
};

// Eventos que suspendem aulas, além das categorias feriado / ponto facultativo.
const NO_CLASS_RE =
  /semana universit|recesso|feriado|sem aulas?\b|suspens[ãa]o d[ae]s? (aulas|atividades)|n[ãa]o haver[áa] aulas?/i;
const FIRST_DAY_RE = /primeiro dia letivo|in[íi]cio d[oa]s? (per[íi]odo letivo|aulas|semestre letivo)/i;
const LAST_DAY_RE = /[úu]ltimo dia letivo|t[ée]rmino d[oa]s? (per[íi]odo letivo|aulas|semestre letivo)/i;

export function suspendsClasses(e: EventLike) {
  return e.category === "feriado" || e.category === "ponto_facultativo" || NO_CLASS_RE.test(e.title);
}

/** Período de aulas: "Primeiro/Último dia letivo" do calendário ou, sem isso, as datas do semestre. */
export function teachingPeriod(semester: { start_date: string; end_date: string }, events: EventLike[]) {
  const first = events.find((e) => FIRST_DAY_RE.test(e.title))?.start_date;
  const last = events.find((e) => LAST_DAY_RE.test(e.title))?.end_date;
  const start = first ?? semester.start_date;
  const end = last && last > start ? last : semester.end_date;
  return { start, end, fromCalendar: Boolean(first || last) };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** 14:00–15:50 → 2 horas-aula (aulas de 50–55 min). */
export const classHours = (start: string, end: string) => Math.max(1, Math.round((toMinutes(end) - toMinutes(start)) / 55));

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Data de hoje no horário de Brasília (YYYY-MM-DD). */
export function todayInBrasilia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function buildClassSessions({
  schedules,
  marks,
  events,
  semester,
  today,
}: {
  schedules: ScheduleLike[];
  marks: AttendanceMark[];
  events: EventLike[];
  semester: { start_date: string; end_date: string };
  today: string;
}): ClassSession[] {
  const byWeekday = new Map<number, { start: string; end: string }[]>();
  for (const s of schedules) {
    const list = byWeekday.get(s.weekday) ?? [];
    list.push({ start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) });
    byWeekday.set(s.weekday, list.sort((a, b) => a.start.localeCompare(b.start)));
  }
  const markByDate = new Map(marks.map((m) => [m.date, m]));
  const blockers = events.filter(suspendsClasses);
  const { start, end } = teachingPeriod(semester, events);

  const sessions: Omit<ClassSession, "number">[] = [];
  const make = (date: string, times: ClassSession["times"], hours: number, offSchedule: boolean) => {
    const mark = markByDate.get(date) ?? null;
    const blockedBy = blockers.find((e) => e.start_date <= date && date <= e.end_date)?.title ?? null;
    const status: SessionStatus = mark?.status ?? (blockedBy ? "sem_aula" : date > today ? "prevista" : "pendente");
    sessions.push({ date, weekday: weekdayOf(date), times, hours, mark: mark?.status ?? null, blockedBy, status, offSchedule });
  };

  if (byWeekday.size && start <= end) {
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const times = byWeekday.get(weekdayOf(date));
      if (!times) continue;
      make(date, times, times.reduce((acc, t) => acc + classHours(t.start, t.end), 0), false);
    }
  }

  // Marcações que não caem mais numa data de aula continuam visíveis (e contando).
  const generated = new Set(sessions.map((s) => s.date));
  for (const m of marks) {
    if (!generated.has(m.date)) make(m.date, [], m.hours, true);
  }

  return sessions.sort((a, b) => a.date.localeCompare(b.date)).map((s, i) => ({ ...s, number: i + 1 }));
}

/** Horas de falta registradas. */
export const absenceHours = (marks: { status: string; hours: number }[]) =>
  marks.reduce((acc, m) => acc + (m.status === "falta" ? m.hours : 0), 0);

export function summarizeAttendance(sessions: ClassSession[], maxAbsenceHours: number, today: string) {
  const count = (status: SessionStatus) => sessions.filter((s) => s.status === status).length;
  const absent = absenceHours(sessions.map((s) => ({ status: s.status, hours: s.hours })));
  const regular = sessions.filter((s) => !s.offSchedule).map((s) => s.hours).sort((a, b) => a - b);
  const typicalHours = regular[Math.floor(regular.length / 2)] ?? 2;
  const remainingHours = Math.max(0, maxAbsenceHours - absent);
  return {
    total: sessions.filter((s) => s.status !== "sem_aula" && s.status !== "cancelada").length,
    present: count("presente"),
    absences: count("falta"),
    cancelled: count("cancelada"),
    noClass: count("sem_aula"),
    pending: count("pendente"),
    upcoming: count("prevista"),
    absentHours: absent,
    maxAbsenceHours,
    remainingHours,
    /** Quantas aulas (do tamanho mais comum) ainda dá para faltar. */
    remainingClasses: Math.floor(remainingHours / typicalHours),
    exceeded: absent > maxAbsenceHours,
    next: sessions.find((s) => s.date >= today && !s.offSchedule && s.status !== "sem_aula" && s.status !== "cancelada") ?? null,
  };
}
