import Link from "next/link";
import type { ClassSession, summarizeAttendance } from "@/lib/academic/attendance";
import { WEEKDAYS, fmtIsoDate } from "@/lib/academic/calc";

type Summary = ReturnType<typeof summarizeAttendance>;

export const fmtSessionDate = (s: Pick<ClassSession, "date" | "weekday">) => `${WEEKDAYS[s.weekday]}, ${fmtIsoDate(s.date).slice(0, 5)}`;

export function AbsenceMeter({ summary }: { summary: Summary }) {
  const { absentHours, maxAbsenceHours, exceeded } = summary;
  const pct = maxAbsenceHours > 0 ? Math.min(100, (absentHours / maxAbsenceHours) * 100) : absentHours > 0 ? 100 : 0;
  const tone = exceeded || pct >= 100 ? "bg-red-600 dark:bg-red-400" : pct >= 75 ? "bg-amber-500" : "bg-brand dark:bg-link";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-3xl font-semibold tracking-tight">
          {absentHours}
          <span className="text-lg font-normal text-muted">/{maxAbsenceHours}h</span>
        </p>
        <p className={`text-sm ${exceeded ? "font-medium text-red-600 dark:text-red-400" : "text-muted"}`}>
          {exceeded
            ? `Limite ultrapassado em ${absentHours - maxAbsenceHours}h`
            : summary.remainingHours === 0
              ? "Nenhuma falta restante"
              : `Pode faltar mais ${summary.remainingClasses} aula${summary.remainingClasses === 1 ? "" : "s"} (${summary.remainingHours}h)`}
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-background"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={maxAbsenceHours}
        aria-valuenow={absentHours}
        aria-label="Horas de falta usadas"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AttendanceCounts({ summary }: { summary: Summary }) {
  const items = [
    ["Presenças", summary.present],
    ["Faltas", summary.absences],
    ["Canceladas", summary.cancelled],
    ["Sem aula", summary.noClass],
    ["Restantes", summary.upcoming],
  ] as const;
  return (
    <dl className="grid grid-cols-5 gap-2 text-center">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-background px-1 py-2">
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className="text-lg font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Resumo de frequência da disciplina; o card inteiro leva à lista de aulas. */
export function AttendanceBoard({ subjectId, summary, hasSchedule }: { subjectId: string; summary: Summary; hasSchedule: boolean }) {
  return (
    <Link
      href={`/disciplinas/${subjectId}/frequencia`}
      className="group block rounded-2xl border border-line bg-card p-6 transition hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Frequência</h2>
        <span className="text-sm font-medium text-link group-hover:underline">Ver todas as aulas →</span>
      </div>
      {!hasSchedule ? (
        <p className="text-sm text-muted">Cadastre os horários da disciplina para gerar as datas das aulas.</p>
      ) : (
        <div className="space-y-4">
          <AbsenceMeter summary={summary} />
          <AttendanceCounts summary={summary} />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              {summary.next
                ? `Próxima aula: ${fmtSessionDate(summary.next)}${summary.next.times[0] ? ` · ${summary.next.times[0].start}` : ""}`
                : "Sem aulas futuras"}
            </span>
            {summary.pending > 0 && (
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {summary.pending} aula{summary.pending === 1 ? "" : "s"} sem registro
              </span>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
