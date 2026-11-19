"use client";

import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Badge } from "@/components/app/ui";
import { fieldClass } from "@/components/app/styles";
import {
  extractSubjectsFromPdf,
  importSubjects,
  type EnrollmentExtractResult,
  type EnrollmentPreviewSubject,
} from "@/lib/academic/actions";
import { WEEKDAYS } from "@/lib/academic/calc";
import type { SubjectSchedule } from "@/lib/academic/sigaa";

// Cores distintas para cada disciplina importada (todas legíveis no tema claro e escuro).
const PALETTE = ["#275e4c", "#2563eb", "#c2410c", "#7c3aed", "#be185d", "#0e7490", "#a16207", "#4d7c0f", "#b91c1c", "#475569"];
const WORKLOADS = [15, 30, 45, 60, 75, 90, 120];

type Item = EnrollmentPreviewSubject & { selected: boolean; color: string };

const isEnrolled = (status: string) => /^MATRICULAD/i.test(status);

// [Seg 14:00–15:50, Qua 14:00–15:50] → "Seg e Qua · 14:00–15:50"
function formatSchedules(rows: SubjectSchedule[]) {
  if (!rows.length) return "Sem horário definido";
  const byTime = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.start_time}–${r.end_time}`;
    byTime.set(key, [...(byTime.get(key) ?? []), r.weekday]);
  }
  return [...byTime]
    .map(([time, days]) => {
      const names = days.map((d) => WEEKDAYS[d]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0];
      return `${list} · ${time}`;
    })
    .join("; ");
}

function toItems(subjects: EnrollmentPreviewSubject[]): Item[] {
  return subjects.map((s, i) => ({
    ...s,
    selected: !s.alreadyExists && isEnrolled(s.status),
    color: PALETTE[i % PALETTE.length],
  }));
}

export function SubjectPdfImporter({ semesterId, semesterName }: { semesterId: string; semesterName: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [meta, setMeta] = useState<Pick<EnrollmentExtractResult, "period" | "fileName">>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isExtracting, startExtract] = useTransition();
  const [isImporting, startImport] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setItems(null);
    setMeta({});
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(file: File) {
    const fd = new FormData();
    fd.set("pdf", file);
    fd.set("semester_id", semesterId);
    setError(null);
    setSuccess(null);
    startExtract(async () => {
      const res = await extractSubjectsFromPdf(fd);
      if (res.error || !res.subjects) {
        setError(res.error ?? "Não foi possível ler o PDF.");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setItems(toItems(res.subjects));
      setMeta({ period: res.period, fileName: res.fileName });
    });
  }

  function update(code: string, patch: Partial<Item>) {
    setItems((prev) => prev?.map((it) => (it.code === code ? { ...it, ...patch } : it)) ?? null);
  }

  function handleImport() {
    const chosen = items?.filter((i) => i.selected && !i.alreadyExists) ?? [];
    if (!chosen.length) {
      setError("Selecione pelo menos uma disciplina para adicionar.");
      return;
    }
    if (chosen.some((i) => !i.name.trim())) {
      setError("Toda disciplina precisa de um nome.");
      return;
    }
    setError(null);
    startImport(async () => {
      const res = await importSubjects(
        semesterId,
        chosen.map(({ name, code, professor, room, color, workload_hours, schedules }) => ({
          name,
          code,
          professor,
          room,
          color,
          workload_hours,
          schedules,
        })),
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      reset();
      const n = res.count ?? 0;
      setSuccess(`${n} disciplina${n === 1 ? "" : "s"} adicionada${n === 1 ? "" : "s"} ao semestre ${semesterName}.`);
    });
  }

  const periodMismatch =
    meta.period?.name && !semesterName.toLowerCase().includes(meta.period.name.toLowerCase()) ? meta.period.name : null;
  const selectedCount = items?.filter((i) => i.selected && !i.alreadyExists).length ?? 0;

  return (
    <div className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {success && <FormMessage kind="success">{success}</FormMessage>}

      {!items ? (
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-background/60 px-4 py-6 text-center transition hover:border-brand hover:bg-brand-soft/40 ${isExtracting ? "pointer-events-none opacity-60" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="mb-2 h-7 w-7 text-brand dark:text-link" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
          <span className="text-sm font-medium text-foreground">
            {isExtracting ? "Lendo atestado…" : "Enviar Atestado de Matrícula (PDF)"}
          </span>
          <span className="mt-0.5 text-xs text-muted">
            Emitido pelo SIGAA. Nome, professor, sala, horários e carga horária são preenchidos automaticamente.
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={isExtracting}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="sr-only"
          />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {items.length} disciplina{items.length === 1 ? "" : "s"} encontrada{items.length === 1 ? "" : "s"}
                {meta.period?.name && <span className="font-normal text-muted"> · período {meta.period.name}</span>}
              </p>
              {meta.fileName && <p className="truncate text-xs text-muted">{meta.fileName}</p>}
            </div>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-background hover:text-foreground"
            >
              Trocar arquivo
            </button>
          </div>

          {periodMismatch && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              O atestado é do período {periodMismatch}, mas o semestre atual é {semesterName}. As disciplinas serão
              adicionadas ao semestre atual.
            </p>
          )}

          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.code}
                className={`rounded-xl border border-line p-3 transition ${it.selected && !it.alreadyExists ? "bg-background" : "opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={it.selected && !it.alreadyExists}
                    disabled={it.alreadyExists}
                    onChange={(e) => update(it.code, { selected: e.target.checked })}
                    aria-label={`Adicionar ${it.name}`}
                    className="mt-2.5 h-4 w-4 shrink-0 accent-brand"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={it.color}
                        onChange={(e) => update(it.code, { color: e.target.value })}
                        aria-label={`Cor de ${it.name}`}
                        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line bg-card p-0.5"
                      />
                      <input
                        value={it.name}
                        maxLength={120}
                        onChange={(e) => update(it.code, { name: e.target.value })}
                        aria-label="Nome da disciplina"
                        className={`${fieldClass} h-8 font-medium`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="font-medium text-foreground">{it.code}</span>
                      {it.classGroup && <span>· turma {it.classGroup}</span>}
                      {it.alreadyExists && <Badge>já cadastrada</Badge>}
                      {!isEnrolled(it.status) && <Badge tone="warn">{it.status.toLowerCase()}</Badge>}
                    </div>
                    <p className="text-xs text-muted">
                      {[it.professor ?? "Sem docente", it.room].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs">
                        {formatSchedules(it.schedules)}
                        {it.scheduleCode && <span className="text-muted"> ({it.scheduleCode})</span>}
                      </p>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        Carga
                        <select
                          value={it.workload_hours}
                          onChange={(e) => update(it.code, { workload_hours: Number(e.target.value) })}
                          className="h-7 rounded-md border border-line bg-card px-1.5 text-xs text-foreground"
                        >
                          {[...new Set([...WORKLOADS, it.workload_hours])]
                            .sort((a, b) => a - b)
                            .map((h) => (
                              <option key={h} value={h}>
                                {h} h
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted">
            Carga horária estimada pelos horários semanais: 2 aulas por semana = 30 h, 4 = 60 h, 6 = 90 h.
          </p>

          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || selectedCount === 0}
            className="h-10 w-full rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {isImporting
              ? "Adicionando…"
              : `Adicionar ${selectedCount} disciplina${selectedCount === 1 ? "" : "s"} ao semestre ${semesterName}`}
          </button>
        </div>
      )}
    </div>
  );
}
