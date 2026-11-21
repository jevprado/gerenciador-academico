"use client";

import { useOptimistic, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { fmtSessionDate } from "@/components/app/attendance-board";
import { markAttendanceBulk, setAttendance } from "@/lib/academic/actions";
import { STATUS_META, type AttendanceStatus, type ClassSession } from "@/lib/academic/attendance";

const OPTIONS: { status: AttendanceStatus; label: string; active: string }[] = [
  { status: "presente", label: "Presente", active: "bg-emerald-600 text-white dark:bg-emerald-500" },
  { status: "falta", label: "Faltei", active: "bg-red-600 text-white dark:bg-red-500" },
  { status: "cancelada", label: "Cancelada", active: "bg-amber-500 text-white" },
  { status: "sem_aula", label: "Sem aula", active: "bg-sky-600 text-white dark:bg-sky-500" },
];

const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Recalcula o status exibido depois de uma marcação otimista. */
function withMark(s: ClassSession, mark: AttendanceStatus | null, today: string): ClassSession {
  const status = mark ?? (s.blockedBy ? "sem_aula" : s.date > today ? "prevista" : "pendente");
  return { ...s, mark, status };
}

export function AttendanceList({ subjectId, sessions, today }: { subjectId: string; sessions: ClassSession[]; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(
    sessions,
    (state, change: { dates: string[]; mark: AttendanceStatus | null }) =>
      state.map((s) => (change.dates.includes(s.date) ? withMark(s, change.mark, today) : s)),
  );

  function mark(session: ClassSession, status: AttendanceStatus) {
    // Clicar no status já marcado desfaz a marcação.
    const next = session.mark === status ? null : status;
    setError(null);
    startTransition(async () => {
      applyOptimistic({ dates: [session.date], mark: next });
      const res = await setAttendance(subjectId, session.date, session.hours, next);
      if (res.error) setError(res.error);
    });
  }

  const pendingPast = optimistic.filter((s) => s.status === "pendente");
  function markPendingAsPresent() {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ dates: pendingPast.map((s) => s.date), mark: "presente" });
      const res = await markAttendanceBulk(
        subjectId,
        pendingPast.map(({ date, hours }) => ({ date, hours })),
        "presente",
      );
      if (res.error) setError(res.error);
    });
  }

  const months = new Map<string, ClassSession[]>();
  for (const s of optimistic) {
    const key = s.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), s]);
  }

  return (
    <div className="space-y-5">
      {error && <FormMessage kind="error">{error}</FormMessage>}

      {pendingPast.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            {pendingPast.length} aula{pendingPast.length === 1 ? "" : "s"} já passou sem registro.
          </span>
          <button
            type="button"
            onClick={markPendingAsPresent}
            disabled={isPending}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            Marcar todas como presença
          </button>
        </div>
      )}

      {[...months].map(([key, list]) => (
        <section key={key}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {MONTH.format(Date.parse(`${key}-01T00:00:00Z`))}
          </h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((s) => {
              const meta = STATUS_META[s.status];
              const isToday = s.date === today;
              return (
                <li
                  key={s.date}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 ${isToday ? "bg-brand-soft/50" : ""}`}
                >
                  <div className="w-16 shrink-0 text-sm font-medium text-muted">Aula {String(s.number).padStart(2, "0")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {fmtSessionDate(s)}
                      {isToday && <span className="ml-2 text-xs font-semibold text-brand dark:text-link">hoje</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {[
                        s.times.map((t) => `${t.start}–${t.end}`).join(", ") || null,
                        `${s.hours}h`,
                        s.blockedBy,
                        s.offSchedule ? "fora dos horários atuais" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className={`inline-block w-24 rounded-full px-2 py-0.5 text-center text-xs font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                  <div className="flex gap-1" role="group" aria-label={`Frequência da aula ${s.number}`}>
                    {OPTIONS.map((o) => {
                      const active = s.mark === o.status;
                      return (
                        <button
                          key={o.status}
                          type="button"
                          aria-pressed={active}
                          onClick={() => mark(s, o.status)}
                          className={`rounded-lg px-2 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-brand ${
                            active ? o.active : "text-muted hover:bg-background hover:text-foreground"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
