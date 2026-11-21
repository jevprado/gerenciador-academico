import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/app/forms";
import { fieldClass } from "@/components/app/styles";
import { SubjectPdfImporter } from "@/components/app/subject-pdf-importer";
import { Badge, Empty, Field, NoCurrentSemester, PageTitle, Panel, ScheduleFields } from "@/components/app/ui";
import { createSubject } from "@/lib/academic/actions";
import { WEEKDAYS, fmtGrade, maxAbsences, partialAverage } from "@/lib/academic/calc";
import { getCurrentSemester, listSubjects, type SemesterRow } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Disciplinas" };

export default function DisciplinasPage() {
  return (
    <Suspense fallback={<PageTitle title="Disciplinas" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const semester = await getCurrentSemester();
  if (!semester) {
    return (
      <>
        <PageTitle title="Disciplinas" />
        <NoCurrentSemester />
      </>
    );
  }
  return (
    <>
      <PageTitle title="Disciplinas" subtitle={`Semestre ${semester.name}. Abra uma disciplina para lançar notas e faltas.`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Matérias do semestre">
          <SubjectList semester={semester} />
        </Panel>
        <div className="space-y-6">
          <Panel title="Importar do SIGAA" id="importar">
            <SubjectPdfImporter semesterId={semester.id} semesterName={semester.name} />
          </Panel>
          <Panel title="Nova disciplina" id="nova">
            <SubjectForm semesterId={semester.id} />
          </Panel>
        </div>
      </div>
    </>
  );
}

async function SubjectList({ semester }: { semester: SemesterRow }) {
  const subjects = await listSubjects(semester.id);
  if (!subjects.length) return <Empty>Nenhuma disciplina cadastrada. Importe o atestado do SIGAA ou use o formulário ao lado.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {subjects.map((s) => {
        const avg = partialAverage(s.assessments);
        const min = Number(s.min_average ?? semester.min_average);
        const abs = s.absences.reduce((a, x) => a + x.quantity, 0);
        const maxAbs = maxAbsences(s.workload_hours, Number(s.min_attendance ?? semester.min_attendance));
        const days = [...new Set(s.class_schedules.map((c) => c.weekday))].sort().map((d) => WEEKDAYS[d]).join(", ");
        return (
          <li key={s.id}>
            <Link href={`/disciplinas/${s.id}`} className="-mx-2 flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-background">
              <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{s.name}</span>
                  {s.status !== "cursando" && <Badge>{s.status}</Badge>}
                </p>
                <p className="truncate text-sm text-muted">
                  {[s.code, s.professor, days].filter(Boolean).join(" · ") || "Sem detalhes"}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className={`font-semibold ${avg !== null && avg < min ? "text-red-600 dark:text-red-400" : ""}`}>
                  {avg === null ? "—" : fmtGrade(avg)}
                </p>
                <p className="text-xs text-muted">
                  faltas {abs}/{maxAbs}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SubjectForm({ semesterId }: { semesterId: string }) {
  return (
    <ActionForm action={createSubject} submitLabel="Cadastrar disciplina" successMessage="Disciplina cadastrada.">
      <input type="hidden" name="semester_id" value={semesterId} />
      <Field label="Nome">
        <input name="name" required maxLength={120} placeholder="Cálculo II" className={fieldClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código (opcional)">
          <input name="code" maxLength={30} className={fieldClass} />
        </Field>
        <Field label="Sala (opcional)">
          <input name="room" maxLength={60} className={fieldClass} />
        </Field>
      </div>
      <Field label="Professor(a)">
        <input name="professor" maxLength={120} className={fieldClass} />
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Carga horária (h)">
          <input name="workload_hours" inputMode="numeric" required defaultValue="60" className={fieldClass} />
        </Field>
        <Field label="Cor">
          <input type="color" name="color" defaultValue="#275e4c" className="h-10 w-16 cursor-pointer rounded-lg border border-line bg-card p-1" />
        </Field>
      </div>
      <ScheduleFields />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Critério de aprovação diferente do semestre</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Média mínima">
            <input name="min_average" inputMode="decimal" className={fieldClass} />
          </Field>
          <Field label="Frequência mínima (%)">
            <input name="min_attendance" inputMode="decimal" className={fieldClass} />
          </Field>
        </div>
      </details>
    </ActionForm>
  );
}
