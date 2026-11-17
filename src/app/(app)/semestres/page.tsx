import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionButton, ActionForm } from "@/components/app/forms";
import { fieldClass } from "@/components/app/styles";
import { Badge, Empty, Field, PageTitle, Panel } from "@/components/app/ui";
import { createSemester, deleteSemester, setCurrentSemester } from "@/lib/academic/actions";
import { fmtGrade, fmtIsoDate } from "@/lib/academic/calc";
import { listSemesters } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Semestres" };

export default function SemestresPage() {
  return (
    <>
      <PageTitle title="Semestres" subtitle="O semestre marcado como atual é o que aparece no painel." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Seus semestres">
          <Suspense fallback={<p className="text-sm text-muted">Carregando…</p>}>
            <SemesterList />
          </Suspense>
        </Panel>

        <Panel title="Novo semestre" id="novo">
          <ActionForm action={createSemester} submitLabel="Cadastrar semestre" successMessage="Semestre cadastrado.">
            <Field label="Identificação">
              <input name="name" required maxLength={40} placeholder="2026.2" className={fieldClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <input type="date" name="start_date" required className={fieldClass} />
              </Field>
              <Field label="Término">
                <input type="date" name="end_date" required className={fieldClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Média mínima">
                <input name="min_average" inputMode="decimal" required defaultValue="6" className={fieldClass} />
              </Field>
              <Field label="Frequência mínima (%)">
                <input name="min_attendance" inputMode="decimal" required defaultValue="75" className={fieldClass} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_current" defaultChecked className="h-4 w-4 accent-brand" />
              Marcar como semestre atual
            </label>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}

async function SemesterList() {
  const semesters = await listSemesters();
  if (!semesters.length) return <Empty>Nenhum semestre cadastrado ainda.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {semesters.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              {s.name} {s.is_current && <Badge tone="brand">Atual</Badge>}
            </p>
            <p className="text-sm text-muted">
              {fmtIsoDate(s.start_date)} a {fmtIsoDate(s.end_date)} · {s.subjectCount} disciplina{s.subjectCount === 1 ? "" : "s"} ·
              média {fmtGrade(Number(s.min_average))} · freq. {Number(s.min_attendance)}%
            </p>
          </div>
          {!s.is_current && <ActionButton action={setCurrentSemester.bind(null, s.id)}>Tornar atual</ActionButton>}
          <ActionButton
            action={deleteSemester.bind(null, s.id)}
            variant="danger"
            confirm={`Excluir o semestre ${s.name}? Todas as disciplinas, notas, faltas e prazos dele serão apagados.`}
          >
            Excluir
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}
