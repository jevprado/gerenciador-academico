"use client";

import { useMemo, useState } from "react";
import { ActionButton, ActionForm, EditableItem } from "@/components/app/forms";
import { fieldClass } from "@/components/app/styles";
import { Empty, Field, Panel } from "@/components/app/ui";
import { deleteCalendarEvent, updateCalendarEvent } from "@/lib/academic/actions";
import { fmtIsoDate } from "@/lib/academic/calc";
import {
  CALENDAR_CATEGORIES,
  CATEGORY_META,
  isStudentRelevantTarget,
  TARGET_OPTIONS,
  type CalendarCategory,
  type CalendarEventRow,
} from "@/lib/academic/calendar-types";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAY_HEADERS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAY_MS = 86_400_000;

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / DAY_MS);
}

function fmtShortRange(startIso: string, endIso: string): string {
  const s = `${startIso.slice(8, 10)}/${startIso.slice(5, 7)}`;
  if (startIso === endIso) return s;
  const e = `${endIso.slice(8, 10)}/${endIso.slice(5, 7)}`;
  return `${s} a ${e}`;
}

type YearMonth = { year: number; month: number; key: string };

function monthsInRange(startIso: string, endIso: string, maxMonths: number): string[] {
  if (!startIso || !endIso || endIso < startIso) return [];
  let y = Number(startIso.slice(0, 4));
  let m = Number(startIso.slice(5, 7)) - 1;
  const endY = Number(endIso.slice(0, 4));
  const endM = Number(endIso.slice(5, 7)) - 1;
  const keys: string[] = [];

  while ((y < endY || (y === endY && m <= endM)) && keys.length < maxMonths) {
    keys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return keys;
}

function buildSemesterMonths(semesterStart: string, semesterEnd: string, events: CalendarEventRow[]): YearMonth[] {
  const keySet = new Set<string>(monthsInRange(semesterStart, semesterEnd, 12));
  for (const ev of events) {
    const span = daysBetween(ev.start_date, ev.end_date);
    if (span <= 14) {
      for (const k of monthsInRange(ev.start_date, ev.end_date, 2)) keySet.add(k);
    } else {
      keySet.add(ev.start_date.slice(0, 7));
      keySet.add(ev.end_date.slice(0, 7));
    }
  }

  return [...keySet]
    .sort()
    .slice(0, 14)
    .map((key) => ({
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5, 7)) - 1,
      key,
    }));
}

export function SemesterCalendarView({
  semesterName,
  semesterStart,
  semesterEnd,
  events,
}: {
  semesterName: string;
  semesterStart: string;
  semesterEnd: string;
  events: CalendarEventRow[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<CalendarCategory | "todas">("todas");
  const [selectedAudience, setSelectedAudience] = useState<"todos" | "estudante" | "admin">("todos");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (selectedCategory !== "todas" && ev.category !== selectedCategory) return false;
      if (selectedAudience === "estudante" && !isStudentRelevantTarget(ev.target)) return false;
      if (selectedAudience === "admin" && isStudentRelevantTarget(ev.target)) return false;
      if (q) {
        const hay = `${ev.title} ${ev.description ?? ""} ${ev.target ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, selectedCategory, selectedAudience, search]);

  const months = useMemo(
    () => buildSemesterMonths(semesterStart, semesterEnd, filteredEvents.length ? filteredEvents : events),
    [semesterStart, semesterEnd, filteredEvents, events],
  );

  // Mapa de dia YYYY-MM-DD -> eventos que destacam aquele dia na grade visual
  const dayHighlights = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>();
    for (const ev of filteredEvents) {
      const span = daysBetween(ev.start_date, ev.end_date);
      if (span <= 14) {
        let cur = Date.parse(`${ev.start_date}T00:00:00Z`);
        const end = Date.parse(`${ev.end_date}T00:00:00Z`);
        while (cur <= end) {
          const iso = new Date(cur).toISOString().slice(0, 10);
          const arr = map.get(iso) ?? [];
          arr.push(ev);
          map.set(iso, arr);
          cur += DAY_MS;
        }
      } else {
        for (const iso of [ev.start_date, ev.end_date]) {
          const arr = map.get(iso) ?? [];
          arr.push(ev);
          map.set(iso, arr);
        }
      }
    }
    return map;
  }, [filteredEvents]);

  const listEvents = useMemo(() => {
    if (!selectedDay) return filteredEvents;
    return filteredEvents.filter((ev) => selectedDay >= ev.start_date && selectedDay <= ev.end_date);
  }, [filteredEvents, selectedDay]);

  // Agrupa a lista detalhada por mês/ano da data de início
  const groupedByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: CalendarEventRow[] }[] = [];
    for (const ev of listEvents) {
      const y = Number(ev.start_date.slice(0, 4));
      const m = Number(ev.start_date.slice(5, 7)) - 1;
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[m] ?? ""} de ${y}`;
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.items.push(ev);
      else groups.push({ key, label, items: [ev] });
    }
    return groups;
  }, [listEvents]);

  return (
    <div className="space-y-6">
      {/* Grade Mensal Colorida */}
      <Panel
        title={`Calendário de Atividades — ${semesterName}`}
        action={
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                ["todos", "Todo o calendário"],
                ["estudante", "Foco no estudante"],
                ["admin", "Coordenação / Docente / STI"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSelectedAudience(val)}
                className={`rounded-lg px-2.5 py-1 font-medium transition ${
                  selectedAudience === val
                    ? "bg-brand text-white"
                    : "border border-line bg-background text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {events.length === 0 ? (
          <Empty>
            Nenhuma data cadastrada em {semesterName} ainda. Envie o PDF do calendário acadêmico ao lado ou adicione datas manualmente.
          </Empty>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {months.map(({ year, month, key }) => (
                <MonthCard
                  key={key}
                  year={year}
                  month={month}
                  events={filteredEvents}
                  dayHighlights={dayHighlights}
                  selectedDay={selectedDay}
                  onSelectDay={(iso) => setSelectedDay((prev) => (prev === iso ? null : iso))}
                />
              ))}
            </div>

            {/* Legenda interativa (como na página 4 do PDF da UnB) */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-background p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-semibold tracking-wider text-muted uppercase">Legenda:</span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory("todas")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    selectedCategory === "todas"
                      ? "bg-foreground text-background"
                      : "bg-card text-muted hover:text-foreground"
                  }`}
                >
                  Todas ({events.length})
                </button>
                {CALENDAR_CATEGORIES.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const count = events.filter((e) => e.category === cat).length;
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory((prev) => (prev === cat ? "todas" : cat))}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? "border-brand bg-brand-soft text-brand dark:text-link"
                          : "border-line bg-card text-foreground hover:border-brand/50"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-sm ${meta.dotClass}`} aria-hidden />
                      <span>{meta.label}</span>
                      <span className="text-muted">({count})</span>
                    </button>
                  );
                })}
              </div>

              {selectedDay && (
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="text-xs font-medium text-brand hover:underline dark:text-link"
                >
                  Limpar filtro do dia {fmtIsoDate(selectedDay)} ✕
                </button>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* Lista detalhada com busca, edição e exclusão */}
      <Panel
        title={selectedDay ? `Datas em ${fmtIsoDate(selectedDay)}` : `Datas importantes de ${semesterName}`}
        action={
          <div className="w-full sm:w-64">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por atividade ou sigla…"
              aria-label="Buscar data no calendário"
              className={`${fieldClass} h-9 text-xs`}
            />
          </div>
        }
      >
        {listEvents.length === 0 ? (
          <Empty>Nenhuma data encontrada para os filtros selecionados.</Empty>
        ) : (
          <div className="space-y-6">
            {groupedByMonth.map((group) => (
              <div key={group.key}>
                <h3 className="mb-2.5 text-xs font-semibold tracking-wider text-muted uppercase">
                  {group.label} ({group.items.length})
                </h3>
                <ul className="space-y-2">
                  {group.items.map((ev) => (
                    <CalendarEventItem key={ev.id} ev={ev} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function MonthCard({
  year,
  month,
  events,
  dayHighlights,
  selectedDay,
  onSelectDay,
}: {
  year: number;
  month: number;
  events: CalendarEventRow[];
  dayHighlights: Map<string, CalendarEventRow[]>;
  selectedDay: string | null;
  onSelectDay: (iso: string) => void;
}) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Resumo na parte inferior do cartão do mês (igual à pág. 4 do calendário da UnB)
  const monthSummary = events.filter((ev) => {
    const startsInMonth = ev.start_date.startsWith(monthPrefix);
    const endsInMonth = ev.end_date.startsWith(monthPrefix);
    const span = daysBetween(ev.start_date, ev.end_date);
    if (span <= 14) return startsInMonth || endsInMonth;
    return startsInMonth || endsInMonth;
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-card">
      <div className="bg-brand px-3 py-2 text-center text-xs font-bold tracking-wider text-white uppercase">
        {MONTH_NAMES[month]} {year}
      </div>

      <div className="grid grid-cols-7 border-b border-line bg-background/80 text-center text-[11px] font-semibold">
        {WEEKDAY_HEADERS.map((d, i) => (
          <div key={i} className={`py-1.5 ${i === 0 ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-line/60 p-px text-center text-xs">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className="h-8 bg-background/40" />;
          }
          const iso = `${monthPrefix}-${String(day).padStart(2, "0")}`;
          const dayEvs = dayHighlights.get(iso) ?? [];
          const topEvent = [...dayEvs].sort(
            (a, b) => CATEGORY_META[b.category].priority - CATEGORY_META[a.category].priority,
          )[0];
          const isSunday = idx % 7 === 0;
          const isSelected = selectedDay === iso;

          const cellStyle = topEvent
            ? CATEGORY_META[topEvent.category].cellClass
            : isSunday
              ? "bg-card text-rose-600 dark:text-rose-400 hover:bg-background"
              : "bg-card text-foreground hover:bg-background";

          const tooltip = dayEvs.map((e) => `${fmtShortRange(e.start_date, e.end_date)}: ${e.title}`).join("\n");

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDay(iso)}
              title={tooltip || undefined}
              className={`relative flex h-8 items-center justify-center transition ${cellStyle} ${
                isSelected ? "ring-2 ring-brand ring-offset-1" : ""
              }`}
            >
              <span>{day}</span>
              {dayEvs.length > 1 && (
                <span className="absolute right-1 bottom-0.5 h-1 w-1 rounded-full bg-current opacity-75" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Destaques do mês (rodapé estilo UnB pág. 4) */}
      <div className="flex-1 border-t border-line bg-background/40 p-2.5">
        {monthSummary.length === 0 ? (
          <p className="text-[11px] text-muted italic">Sem eventos demarcados neste mês.</p>
        ) : (
          <ul className="space-y-1 text-[11px] leading-snug">
            {monthSummary.slice(0, 7).map((ev) => (
              <li key={ev.id} className="flex items-start gap-1.5">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-xs ${CATEGORY_META[ev.category].dotClass}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <strong className="font-semibold text-foreground">{fmtShortRange(ev.start_date, ev.end_date)}</strong>
                  {" — "}
                  <span className="text-muted">{ev.title}</span>
                </span>
              </li>
            ))}
            {monthSummary.length > 7 && (
              <li className="text-[10px] font-medium text-muted">
                + {monthSummary.length - 7} outra{monthSummary.length - 7 === 1 ? "" : "s"} data
                {monthSummary.length - 7 === 1 ? "" : "s"} na lista abaixo
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function CalendarEventItem({ ev }: { ev: CalendarEventRow }) {
  const meta = CATEGORY_META[ev.category];
  const sameDay = ev.start_date === ev.end_date;

  return (
    <li className="rounded-xl border border-line p-3">
      <EditableItem
        summary={
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dotClass}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand dark:text-link">
                  {sameDay ? fmtIsoDate(ev.start_date) : `${fmtIsoDate(ev.start_date)} a ${fmtIsoDate(ev.end_date)}`}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}>{meta.label}</span>
                {ev.target && (
                  <span className="rounded-full border border-line bg-background px-2 py-0.5 text-xs text-muted">
                    {ev.target}
                  </span>
                )}
              </div>
              <p className="mt-1 font-medium text-foreground">{ev.title}</p>
              {ev.description && <p className="mt-0.5 text-sm text-muted">{ev.description}</p>}
            </div>
          </div>
        }
        actions={
          <ActionButton
            action={deleteCalendarEvent.bind(null, ev.id)}
            variant="danger"
            confirm={`Excluir a data "${ev.title}" do calendário?`}
            label={`Excluir ${ev.title}`}
          >
            ✕
          </ActionButton>
        }
      >
        <ActionForm action={updateCalendarEvent.bind(null, ev.id)} submitLabel="Salvar alterações">
          <CalendarEventFields initial={ev} />
        </ActionForm>
      </EditableItem>
    </li>
  );
}

export function CalendarEventFields({ initial }: { initial?: CalendarEventRow }) {
  return (
    <>
      <Field label="Título da atividade ou feriado">
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Ex.: Período de solicitação de matrícula"
          defaultValue={initial?.title}
          className={fieldClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de início">
          <input type="date" name="start_date" required defaultValue={initial?.start_date} className={fieldClass} />
        </Field>
        <Field label="Data de término (opcional)" hint="Deixe igual ou em branco se for um único dia.">
          <input type="date" name="end_date" defaultValue={initial?.end_date} className={fieldClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <select name="category" defaultValue={initial?.category ?? "academico"} className={fieldClass}>
            {CALENDAR_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_META[cat].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Público / Responsável">
          <input
            name="target"
            list="calendar-target-options"
            maxLength={60}
            placeholder="Estudante, Geral, Coordenação…"
            defaultValue={initial?.target ?? "Estudante"}
            className={fieldClass}
          />
          <datalist id="calendar-target-options">
            {TARGET_OPTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Descrição / Detalhes (opcional)">
        <textarea
          name="description"
          maxLength={2000}
          rows={3}
          placeholder="Ex.: Solicitação no SIGAA > Portal Discente > Ensino > Realizar Matrícula."
          defaultValue={initial?.description ?? ""}
          className={`${fieldClass} h-auto py-2`}
        />
      </Field>
    </>
  );
}
