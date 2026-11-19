import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarPdfImporter } from "@/components/app/calendar-pdf-importer";
import { CalendarSemesterSelector } from "@/components/app/calendar-semester-selector";
import { ActionButton, ActionForm } from "@/components/app/forms";
import { CalendarEventFields, SemesterCalendarView } from "@/components/app/semester-calendar-view";
import { NoCurrentSemester, PageTitle, Panel } from "@/components/app/ui";
import { clearCalendarEvents, createCalendarEvent } from "@/lib/academic/actions";
import { listCalendarEvents, listCalendarSemesters } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Calendário" };

export default function CalendarioPage(props: PageProps<"/calendario">) {
  return (
    <Suspense fallback={<PageTitle title="Calendário" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/calendario">["searchParams"] }) {
  const [params, semesters] = await Promise.all([searchParams, listCalendarSemesters()]);
  if (!semesters.length) {
    return (
      <>
        <PageTitle title="Calendário" />
        <NoCurrentSemester />
      </>
    );
  }

  const requestedId = typeof params.semestre === "string" ? params.semestre : undefined;
  const currentSemester = semesters.find((s) => s.is_current);
  const firstWithEvents = semesters.find((s) => s.eventCount > 0);
  const semester =
    semesters.find((s) => s.id === requestedId) ??
    (currentSemester && currentSemester.eventCount > 0 ? currentSemester : undefined) ??
    firstWithEvents ??
    currentSemester ??
    semesters[0];

  const events = await listCalendarEvents(semester.id);

  return (
    <>
      <PageTitle
        title="Calendário do Semestre"
        subtitle={`Datas acadêmicas, matrículas, trancamentos e feriados do semestre ${semester.name}.`}
      />

      <CalendarSemesterSelector
        semesters={semesters}
        selectedSemesterId={semester.id}
        actions={
          events.length > 0 ? (
            <ActionButton
              action={clearCalendarEvents.bind(null, semester.id)}
              variant="danger"
              confirm={`Limpar todas as ${events.length} datas do calendário do semestre ${semester.name}?`}
            >
              Limpar calendário ({events.length})
            </ActionButton>
          ) : undefined
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SemesterCalendarView
          key={semester.id}
          semesterName={semester.name}
          semesterStart={semester.start_date}
          semesterEnd={semester.end_date}
          events={events}
        />

        <div className="space-y-6">
          <Panel title="Importar calendário de PDF" id="importar">
            <CalendarPdfImporter
              key={semester.id}
              semesters={semesters}
              selectedSemesterId={semester.id}
            />
          </Panel>

          <Panel title={`Adicionar data em ${semester.name}`} id="nova">
            <ActionForm
              key={semester.id}
              action={createCalendarEvent}
              submitLabel="Adicionar ao calendário"
              successMessage="Data adicionada ao calendário."
            >
              <input type="hidden" name="semester_id" value={semester.id} />
              <CalendarEventFields />
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
