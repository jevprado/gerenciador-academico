"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useTransition } from "react";
import { fieldClass } from "@/components/app/styles";
import { Badge } from "@/components/app/ui";
import { fmtIsoDate } from "@/lib/academic/calc";
import type { CalendarSemesterOption } from "@/lib/academic/calendar-types";

export function CalendarSemesterSelector({
  semesters,
  selectedSemesterId,
  actions,
}: {
  semesters: CalendarSemesterOption[];
  selectedSemesterId: string;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const selected = semesters.find((s) => s.id === selectedSemesterId) ?? semesters[0];

  function handleChange(nextId: string) {
    if (nextId === selectedSemesterId) return;
    startTransition(() => {
      router.push(`/calendario?semestre=${encodeURIComponent(nextId)}`);
    });
  }

  return (
    <section
      aria-label="Seletor de semestre do calendário"
      className="space-y-3 rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            <span className="text-muted">Semestre:</span>
            <select
              aria-label="Selecionar semestre do calendário"
              value={selectedSemesterId}
              disabled={isPending}
              onChange={(e) => handleChange(e.target.value)}
              className={`${fieldClass} h-9 w-auto min-w-52 pr-8 font-medium disabled:opacity-60`}
            >
              {semesters.map((s) => {
                const countLabel =
                  s.eventCount === 0 ? "sem datas" : `${s.eventCount} data${s.eventCount === 1 ? "" : "s"}`;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_current ? " (Atual)" : ""} · {countLabel}
                  </option>
                );
              })}
            </select>
          </label>

          {selected && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {selected.is_current && <Badge tone="brand">Atual</Badge>}
              <span>
                {fmtIsoDate(selected.start_date)} a {fmtIsoDate(selected.end_date)}
              </span>
              {isPending && <span className="text-brand dark:text-link">Carregando…</span>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/semestres#novo"
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-background hover:text-foreground"
          >
            + Novo semestre
          </Link>
          {actions}
        </div>
      </div>

      {semesters.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="mr-1 text-xs font-medium text-muted">Calendários:</span>
          {semesters.map((s) => {
            const active = s.id === selectedSemesterId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={isPending}
                onClick={() => handleChange(s.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-brand text-white"
                    : "border border-line bg-background text-muted hover:border-brand/50 hover:text-foreground"
                }`}
              >
                {s.name}
                {s.is_current ? " · Atual" : ""}
                {s.eventCount > 0 ? ` (${s.eventCount})` : ""}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
