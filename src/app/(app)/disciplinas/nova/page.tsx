import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/app/forms";
import { fieldClass } from "@/components/app/styles";
import { SubjectPdfImporter } from "@/components/app/subject-pdf-importer";
import { Field, NoCurrentSemester, PageTitle, Panel, ScheduleFields } from "@/components/app/ui";
import { createSubject } from "@/lib/academic/actions";
import { getCurrentSemester } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Adicionar disciplinas" };

export default function NovaDisciplinaPage() {
  return (
    <Suspense fallback={<PageTitle title="Adicionar disciplinas" back={{ href: "/disciplinas", label: "Disciplinas" }} />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const semester = await getCurrentSemester();
  if (!semester) {
    return (
      <>
        <PageTitle title="Adicionar disciplinas" back={{ href: "/disciplinas", label: "Disciplinas" }} />
        <NoCurrentSemester />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Adicionar disciplinas"
        subtitle={`Semestre ${semester.name}. Importe o atestado do SIGAA ou cadastre manualmente.`}
        back={{ href: "/disciplinas", label: "Disciplinas" }}
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel title="Importar do SIGAA" id="importar">
          <SubjectPdfImporter semesterId={semester.id} semesterName={semester.name} />
        </Panel>
        <Panel title="Nova disciplina" id="nova">
          <SubjectForm semesterId={semester.id} />
        </Panel>
      </div>
    </>
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
          <input type="color" name="color" defaultValue="#285c47" className="block h-10 w-16 cursor-pointer rounded-lg border border-line bg-card p-1" />
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
