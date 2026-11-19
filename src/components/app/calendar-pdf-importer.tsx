"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { fieldClass } from "@/components/app/styles";
import {
  CALENDAR_CATEGORIES,
  CATEGORY_META,
  isStudentRelevantTarget,
  TARGET_OPTIONS,
  UNB_2026_1_EVENTS,
  type CalendarCategory,
  type CalendarSemesterOption,
  type ParsedCalendarEvent,
} from "@/lib/academic/calendar-types";
import { extractCalendarFromPdf, importCalendarEvents, type CalendarImportTarget } from "@/lib/academic/actions";
import { fmtIsoDate } from "@/lib/academic/calc";

const CREATE_NEW_SEMESTER = "__new__";

type PreviewItem = ParsedCalendarEvent & {
  id: string;
  selected: boolean;
  editing?: boolean;
};

function toPreviewItems(events: ParsedCalendarEvent[], onlyStudentDefault = true): PreviewItem[] {
  return events.map((ev, idx) => ({
    ...ev,
    id: `ev-${idx}-${ev.start_date}`,
    selected: onlyStudentDefault ? isStudentRelevantTarget(ev.target) : true,
  }));
}

function findMatchingSemester(
  semesters: CalendarSemesterOption[],
  detected: string,
): CalendarSemesterOption | undefined {
  const norm = detected.trim().toLowerCase();
  return (
    semesters.find((s) => s.name.trim().toLowerCase() === norm) ??
    semesters.find((s) => s.name.toLowerCase().includes(norm))
  );
}

function inferSemesterBounds(items: ParsedCalendarEvent[]): { start: string; end: string } {
  const firstLetivo = items.find((i) => /primeiro dia letivo/i.test(i.title))?.start_date;
  const lastLetivo = items.find((i) => /[uú]ltimo dia letivo/i.test(i.title))?.end_date;
  if (firstLetivo && lastLetivo && lastLetivo > firstLetivo) {
    return { start: firstLetivo, end: lastLetivo };
  }
  const starts = items.map((i) => i.start_date).filter(Boolean).sort();
  const ends = items.map((i) => i.end_date).filter(Boolean).sort();
  const start = starts[0] ?? "2026-01-01";
  let end = ends[ends.length - 1] ?? start;
  if (end <= start) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 120);
    end = d.toISOString().slice(0, 10);
  }
  return { start, end };
}

export function CalendarPdfImporter({
  semesters,
  selectedSemesterId,
}: {
  semesters: CalendarSemesterOption[];
  selectedSemesterId: string;
}) {
  const router = useRouter();
  const selectedSemester = semesters.find((s) => s.id === selectedSemesterId) ?? semesters[0];
  const fallbackYear = Number(selectedSemester?.start_date.slice(0, 4)) || 2026;

  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [usedFallback, setUsedFallback] = useState(false);
  const [targetValue, setTargetValue] = useState<string>(selectedSemesterId);
  const [newSemesterName, setNewSemesterName] = useState<string>("");
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [showPasteText, setShowPasteText] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [filterTarget, setFilterTarget] = useState<"todos" | "estudante" | "admin">("todos");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isExtracting, startExtract] = useTransition();
  const [isImporting, startImport] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCreatingNew = targetValue === CREATE_NEW_SEMESTER;
  const existingTarget = isCreatingNew ? undefined : semesters.find((s) => s.id === targetValue);
  const hasExistingPdfEvents = !isCreatingNew && (existingTarget?.pdfEventCount ?? 0) > 0;
  const destinationName = isCreatingNew ? newSemesterName.trim() : (existingTarget?.name ?? "");

  function configureTargetFromDetection(detected: string | null | undefined) {
    if (!detected) {
      setDetectedLabel(null);
      setTargetValue(selectedSemesterId);
      setNewSemesterName("");
      setReplaceExisting((selectedSemester?.pdfEventCount ?? 0) > 0);
      return;
    }

    setDetectedLabel(detected);
    const match = findMatchingSemester(semesters, detected);
    if (match) {
      setTargetValue(match.id);
      setNewSemesterName(detected);
      setReplaceExisting(match.pdfEventCount > 0);
    } else {
      // Semestre do PDF ainda não existe: seleciona criação automática como padrão.
      setTargetValue(CREATE_NEW_SEMESTER);
      setNewSemesterName(detected);
      setReplaceExisting(false);
    }
  }

  function handleTargetChange(nextValue: string) {
    setTargetValue(nextValue);
    if (nextValue === CREATE_NEW_SEMESTER) {
      setReplaceExisting(false);
    } else {
      const next = semesters.find((s) => s.id === nextValue);
      setReplaceExisting((next?.pdfEventCount ?? 0) > 0);
    }
  }

  function handleUploadForm(formData: FormData) {
    setError(null);
    setSuccessMsg(null);
    formData.set("fallback_year", String(fallbackYear));
    startExtract(async () => {
      const res = await extractCalendarFromPdf(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.events) {
        setItems(toPreviewItems(res.events, true));
        setSourceLabel(res.fileName ? `Arquivo: ${res.fileName}` : "Texto extraído");
        setUsedFallback(Boolean(res.usedUnbFallback));
        configureTargetFromDetection(res.detectedSemester);
      }
    });
  }

  function handleLoadUnbExample() {
    setError(null);
    setSuccessMsg(null);
    setItems(toPreviewItems(UNB_2026_1_EVENTS, true));
    setSourceLabel("Calendário Universitário de Graduação UnB — 2026.1");
    setUsedFallback(false);
    configureTargetFromDetection("2026.1");
  }

  function selectByRule(rule: "all" | "none" | "student") {
    setItems((prev) =>
      prev
        ? prev.map((item) => ({
            ...item,
            selected:
              rule === "all" ? true : rule === "none" ? false : isStudentRelevantTarget(item.target),
          }))
        : null,
    );
  }

  function updateItem(id: string, patch: Partial<PreviewItem>) {
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, ...patch } : it)) : null));
  }

  function handleConfirmImport() {
    if (!items) return;
    const selected = items.filter((i) => i.selected);
    if (!selected.length) {
      setError("Selecione pelo menos uma data para importar.");
      return;
    }

    let importTarget: CalendarImportTarget;
    if (isCreatingNew) {
      const cleanName = newSemesterName.trim();
      if (!cleanName) {
        setError("Informe o nome do semestre do calendário (ex.: 2025.2 ou 2026.1).");
        return;
      }
      const { start, end } = inferSemesterBounds(items);
      importTarget = { mode: "create", name: cleanName, startDate: start, endDate: end };
    } else {
      importTarget = { mode: "existing", semesterId: targetValue };
    }

    setError(null);
    startImport(async () => {
      const payload: ParsedCalendarEvent[] = selected.map(({ title, description, category, target, start_date, end_date }) => ({
        title,
        description,
        category,
        target,
        start_date,
        end_date,
      }));
      const res = await importCalendarEvents(importTarget, payload, replaceExisting);
      if (res.error) {
        setError(res.error);
        return;
      }
      const destId = res.semesterId ?? targetValue;
      const destName = res.semesterName || destinationName;
      setItems(null);
      setDetectedLabel(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (destId && destId !== selectedSemesterId) {
        router.push(`/calendario?semestre=${encodeURIComponent(destId)}`);
        router.refresh();
      } else {
        setSuccessMsg(`${res.count} datas foram importadas para o calendário do semestre ${destName}.`);
      }
    });
  }

  const selectedCount = items ? items.filter((i) => i.selected).length : 0;
  const visibleItems = items
    ? items.filter((i) => {
        if (filterTarget === "estudante") return isStudentRelevantTarget(i.target);
        if (filterTarget === "admin") return !isStudentRelevantTarget(i.target);
        return true;
      })
    : [];

  return (
    <div className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {successMsg && <FormMessage kind="success">{successMsg}</FormMessage>}

      {!items ? (
        <div className="space-y-4">
          <form action={handleUploadForm} className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-background/60 px-4 py-6 text-center transition hover:border-brand hover:bg-brand-soft/40">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                className="mb-2 h-7 w-7 text-brand dark:text-link"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
              </svg>
              <span className="text-sm font-medium text-foreground">Enviar PDF do calendário acadêmico</span>
              <span className="mt-0.5 text-xs text-muted">
                Identifica automaticamente o semestre do PDF (ex.: 2025.2, 2026.1) e adiciona ao seletor
              </span>
              <input
                ref={fileInputRef}
                type="file"
                name="pdf"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const fd = new FormData(e.target.form!);
                    handleUploadForm(fd);
                  }
                }}
                className="sr-only"
              />
            </label>

            {showPasteText && (
              <div className="space-y-2 rounded-xl border border-line bg-background p-3">
                <label className="block text-xs font-medium text-muted">
                  Ou cole abaixo o texto copiado do PDF do calendário:
                  <textarea
                    name="raw_text"
                    rows={5}
                    placeholder="Ex.: 23/02 a 26/02/2026 - Período para solicitação de matrícula..."
                    className={`${fieldClass} mt-1.5 h-auto py-2 text-xs`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={isExtracting}
                  className="h-9 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
                >
                  {isExtracting ? "Analisando texto…" : "Extrair datas do texto"}
                </button>
              </div>
            )}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={handleLoadUnbExample}
              disabled={isExtracting}
              className="rounded-lg bg-brand-soft px-3 py-1.5 font-medium text-brand transition hover:opacity-90 dark:text-link"
            >
              Carregar modelo UnB 2026.1
            </button>
            <button
              type="button"
              onClick={() => setShowPasteText((v) => !v)}
              className="text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              {showPasteText ? "Ocultar colagem de texto" : "Colar texto manualmente"}
            </button>
          </div>

          {isExtracting && (
            <p className="text-center text-xs text-muted">Lendo arquivo PDF e identificando datas importantes…</p>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-line bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Prévia das datas encontradas ({items.length})</p>
              <p className="text-xs text-muted">
                {sourceLabel} · <strong className="text-foreground">{selectedCount}</strong> selecionada
                {selectedCount === 1 ? "" : "s"} para importar
              </p>
              {usedFallback && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  O PDF enviado não possuía camada de texto selecionável; carregamos as datas correspondentes do calendário 2026.1 da UnB para revisão.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setItems(null);
                setDetectedLabel(null);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-card hover:text-foreground"
            >
              Trocar arquivo
            </button>
          </div>

          {/* Semestre detectado / destino do calendário */}
          <div className="space-y-2.5 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">Semestre deste calendário</span>
              {detectedLabel && (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand dark:text-link">
                  Detectado no PDF: {detectedLabel}
                </span>
              )}
            </div>

            <select
              aria-label="Escolher semestre para salvar este calendário"
              value={targetValue}
              onChange={(e) => handleTargetChange(e.target.value)}
              disabled={isImporting}
              className={`${fieldClass} h-9 text-xs font-medium`}
            >
              <option value={CREATE_NEW_SEMESTER}>
                + Criar novo semestre {newSemesterName.trim() ? `"${newSemesterName.trim()}"` : ""}{" "}
                {detectedLabel && !findMatchingSemester(semesters, detectedLabel) ? "(detectado no PDF)" : ""}
              </option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  Salvar em {s.name}
                  {s.is_current ? " (Atual)" : ""}
                  {s.eventCount > 0 ? ` · ${s.eventCount} data${s.eventCount === 1 ? "" : "s"}` : " · sem datas"}
                </option>
              ))}
            </select>

            {isCreatingNew && (
              <label className="block space-y-1 text-xs text-muted">
                <span>Identificação do novo semestre</span>
                <input
                  type="text"
                  value={newSemesterName}
                  onChange={(e) => setNewSemesterName(e.target.value)}
                  maxLength={40}
                  placeholder="Ex.: 2025.2 ou 2026.1"
                  className={`${fieldClass} h-9 text-xs`}
                />
                <span className="block text-[11px] text-muted">
                  Será criado automaticamente ao salvar (sem alterar seu semestre atual) e aparecerá no seletor acima.
                </span>
              </label>
            )}
          </div>

          {/* Controles rápidos de seleção e filtro */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-muted">Marcar:</span>
              <button
                type="button"
                onClick={() => selectByRule("student")}
                className="rounded-lg border border-line bg-card px-2.5 py-1 font-medium text-foreground transition hover:border-brand"
              >
                Interesse do estudante (Recomendado)
              </button>
              <button
                type="button"
                onClick={() => selectByRule("all")}
                className="rounded-lg border border-line bg-card px-2.5 py-1 font-medium text-muted transition hover:text-foreground"
              >
                Todas ({items.length})
              </button>
              <button
                type="button"
                onClick={() => selectByRule("none")}
                className="rounded-lg border border-line bg-card px-2.5 py-1 font-medium text-muted transition hover:text-foreground"
              >
                Nenhuma
              </button>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted">Exibir:</span>
              {(
                [
                  ["todos", "Todas"],
                  ["estudante", "Estudante/Geral"],
                  ["admin", "STI/Coord./Docente"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterTarget(key)}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    filterTarget === key ? "bg-brand-soft text-brand dark:text-link" : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de eventos extraídos com edição inline opcional */}
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {visibleItems.map((item) => {
              const meta = CATEGORY_META[item.category];
              const sameDay = item.start_date === item.end_date;
              return (
                <li
                  key={item.id}
                  className={`rounded-xl border p-3 transition ${
                    item.selected ? "border-line bg-card" : "border-line/60 bg-card/40 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => updateItem(item.id, { selected: e.target.checked })}
                      className="mt-1 h-4 w-4 shrink-0 accent-brand"
                      aria-label={`Selecionar ${item.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-brand dark:text-link">
                          {sameDay ? fmtIsoDate(item.start_date) : `${fmtIsoDate(item.start_date)} a ${fmtIsoDate(item.end_date)}`}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
                          {meta.shortLabel}
                        </span>
                        {item.target && (
                          <span className="rounded-full border border-line bg-background px-2 py-0.5 text-[11px] text-muted">
                            {item.target}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">{item.title}</p>
                      {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, { editing: !item.editing })}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground"
                    >
                      {item.editing ? "Fechar" : "Editar"}
                    </button>
                  </div>

                  {item.editing && (
                    <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-muted">
                          Título
                          <input
                            value={item.title}
                            onChange={(e) => updateItem(item.id, { title: e.target.value })}
                            className={`${fieldClass} mt-1 h-8 text-xs`}
                          />
                        </label>
                      </div>
                      <label className="block text-xs text-muted">
                        Início
                        <input
                          type="date"
                          value={item.start_date}
                          onChange={(e) =>
                            updateItem(item.id, {
                              start_date: e.target.value,
                              end_date: item.end_date < e.target.value ? e.target.value : item.end_date,
                            })
                          }
                          className={`${fieldClass} mt-1 h-8 text-xs`}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Término
                        <input
                          type="date"
                          value={item.end_date}
                          onChange={(e) => updateItem(item.id, { end_date: e.target.value })}
                          className={`${fieldClass} mt-1 h-8 text-xs`}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        Categoria
                        <select
                          value={item.category}
                          onChange={(e) => updateItem(item.id, { category: e.target.value as CalendarCategory })}
                          className={`${fieldClass} mt-1 h-8 text-xs`}
                        >
                          {CALENDAR_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {CATEGORY_META[cat].label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-muted">
                        Público
                        <input
                          list="preview-targets"
                          value={item.target ?? ""}
                          onChange={(e) => updateItem(item.id, { target: e.target.value || null })}
                          className={`${fieldClass} mt-1 h-8 text-xs`}
                        />
                      </label>
                      <datalist id="preview-targets">
                        {TARGET_OPTIONS.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {hasExistingPdfEvents && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Substituir datas importadas anteriormente por PDF em {existingTarget?.name} (mantém datas criadas manualmente)
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting || selectedCount === 0 || (isCreatingNew && !newSemesterName.trim())}
              className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              {isImporting
                ? "Importando…"
                : `Salvar ${selectedCount} data${selectedCount === 1 ? "" : "s"}${destinationName ? ` em ${destinationName}` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setItems(null);
                setDetectedLabel(null);
              }}
              disabled={isImporting}
              className="h-10 rounded-lg border border-line px-4 text-sm font-medium text-muted transition hover:bg-card hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
