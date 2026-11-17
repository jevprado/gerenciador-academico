import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionButton, ActionForm } from "@/components/app/forms";
import { fieldClass } from "@/components/app/styles";
import { Badge, Empty, Field, NoCurrentSemester, PageTitle, Panel } from "@/components/app/ui";
import { createDeadline, deleteDeadline, toggleDeadline } from "@/lib/academic/actions";
import { TYPE_LABEL } from "@/lib/academic/calc";
import { getCurrentSemester, listDeadlines, listSubjects, type DeadlineRow } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Prazos" };

const DAY = 86_400_000;
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const fmtDue = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dayOf = (d: Date) => Date.parse(ymd.format(d));
const PRIORITY: Record<DeadlineRow["priority"], { label: string; tone: "neutral" | "warn" | "danger" }> = {
  baixa: { label: "Baixa", tone: "neutral" },
  media: { label: "Média", tone: "warn" },
  alta: { label: "Alta", tone: "danger" },
};

export default function PrazosPage() {
  return (
    <Suspense fallback={<PageTitle title="Prazos" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const semester = await getCurrentSemester();
  if (!semester) {
    return (
      <>
        <PageTitle title="Prazos" />
        <NoCurrentSemester />
      </>
    );
  }
  const [deadlines, subjects] = await Promise.all([listDeadlines(semester.id), listSubjects(semester.id)]);
  const today = dayOf(new Date());

  // Classificação automática (RF37).
  const groups: Record<string, DeadlineRow[]> = { Atrasados: [], Hoje: [], "Próximos 7 dias": [], Futuros: [], Concluídos: [] };
  for (const d of deadlines) {
    const days = Math.round((dayOf(new Date(d.due_at)) - today) / DAY);
    const key = d.completed_at ? "Concluídos" : days < 0 ? "Atrasados" : days === 0 ? "Hoje" : days <= 7 ? "Próximos 7 dias" : "Futuros";
    groups[key].push(d);
  }
  groups["Concluídos"].reverse();

  return (
    <>
      <PageTitle title="Prazos" subtitle={`Provas, trabalhos e entregas do semestre ${semester.name}.`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Seus prazos">
          {deadlines.length === 0 ? (
            <Empty>Nenhum prazo cadastrado.</Empty>
          ) : (
            <div className="space-y-6">
              {Object.entries(groups).map(([title, items]) =>
                items.length ? (
                  <div key={title}>
                    <h3
                      className={`mb-2 text-xs font-semibold tracking-wider uppercase ${title === "Atrasados" ? "text-red-600 dark:text-red-400" : "text-muted"}`}
                    >
                      {title} ({items.length})
                    </h3>
                    <ul className="space-y-2">
                      {items.map((d) => (
                        <DeadlineItem key={d.id} d={d} />
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </Panel>

        <Panel title="Novo prazo" id="novo">
          <ActionForm action={createDeadline} submitLabel="Adicionar prazo" successMessage="Prazo adicionado.">
            <input type="hidden" name="semester_id" value={semester.id} />
            <Field label="Título">
              <input name="title" required maxLength={200} placeholder="Entrega do trabalho 1" autoFocus className={fieldClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data">
                <input type="date" name="date" required className={fieldClass} />
              </Field>
              <Field label="Hora">
                <input type="time" name="time" defaultValue="23:59" className={fieldClass} />
              </Field>
            </div>
            <Field label="Disciplina">
              <select name="subject_id" className={fieldClass}>
                <option value="">Nenhuma</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <select name="type" defaultValue="trabalho" className={fieldClass}>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridade">
                <select name="priority" defaultValue="media" className={fieldClass}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </Field>
            </div>
            <Field label="Descrição (opcional)">
              <textarea name="description" maxLength={2000} rows={3} className={`${fieldClass} h-auto py-2`} />
            </Field>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}

function DeadlineItem({ d }: { d: DeadlineRow }) {
  const done = Boolean(d.completed_at);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line p-3">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.subjects?.color ?? "var(--line)" }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? "text-muted line-through" : ""}`}>{d.title}</p>
        <p className="text-xs text-muted">
          {[fmtDue.format(new Date(d.due_at)), d.subjects?.name, TYPE_LABEL[d.type]].filter(Boolean).join(" · ")}
        </p>
        {d.description && <p className="mt-1 text-sm text-muted">{d.description}</p>}
      </div>
      {!done && <Badge tone={PRIORITY[d.priority].tone}>{PRIORITY[d.priority].label}</Badge>}
      <ActionButton action={toggleDeadline.bind(null, d.id, !done)}>{done ? "Desfazer" : "Concluir"}</ActionButton>
      <ActionButton action={deleteDeadline.bind(null, d.id)} variant="danger" confirm={`Excluir o prazo "${d.title}"?`} label={`Excluir ${d.title}`}>
        ✕
      </ActionButton>
    </li>
  );
}
