import Link from "next/link";
import type { ReactNode } from "react";
import { WEEKDAYS } from "@/lib/academic/calc";
import type { Schedule } from "@/lib/academic/queries";
import { fieldClass, labelClass } from "./styles";

export function PageTitle({ title, subtitle, back }: { title: string; subtitle?: string; back?: { href: string; label: string } }) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="text-sm text-muted hover:text-foreground">
          ← {back.label}
        </Link>
      )}
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
    </div>
  );
}

export function Panel({ title, children, id, action }: { title: string; children: ReactNode; id?: string; action?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-line bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</p>;
}

export function NoCurrentSemester() {
  return (
    <Empty>
      Nenhum semestre marcado como atual.{" "}
      <Link href="/semestres" className="font-medium text-link hover:underline">
        Cadastre ou escolha um semestre
      </Link>
      .
    </Empty>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      {children}
      {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

// Três linhas de horário semanal (dia, início, fim). Linhas vazias são ignoradas.
export function ScheduleFields({ initial = [] }: { initial?: Schedule[] }) {
  const rows = [...initial, ...Array(Math.max(0, 3 - initial.length)).fill(null)] as (Schedule | null)[];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Horários das aulas</legend>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2">
          <select name="weekday" defaultValue={r ? String(r.weekday) : ""} aria-label={`Dia da aula ${i + 1}`} className={fieldClass}>
            <option value="">—</option>
            {WEEKDAYS.map((d, n) => (
              <option key={d} value={n}>
                {d}
              </option>
            ))}
          </select>
          <input type="time" name="start_time" defaultValue={r?.start_time.slice(0, 5)} aria-label={`Início da aula ${i + 1}`} className={fieldClass} />
          <input type="time" name="end_time" defaultValue={r?.end_time.slice(0, 5)} aria-label={`Fim da aula ${i + 1}`} className={fieldClass} />
        </div>
      ))}
    </fieldset>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "warn" | "danger" }) {
  const cls = {
    neutral: "bg-background text-muted",
    brand: "bg-brand-soft text-brand dark:text-link",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}
