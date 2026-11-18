import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarPdfImporter } from "@/components/app/calendar-pdf-importer";
import { ActionButton, ActionForm } from "@/components/app/forms";
import { CalendarEventFields, SemesterCalendarView } from "@/components/app/semester-calendar-view";
import { NoCurrentSemester, PageTitle, Panel } from "@/components/app/ui";
import { clearCalendarEvents, createCalendarEvent } from "@/lib/academic/actions";
import { getCurrentSemester, listCalendarEvents } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Calendário" };

export default function CalendarioPage() {
  return (
    <Suspense fallback={<PageTitle title="Calendário" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const semester = await getCurrentSemester();
  if (!semester) {
    return (
      <>
        <PageTitle title="Calendário" />
        <NoCurrentSemester />
      </>
    );
  }

  const events = await listCalendarEvents(semester.id);
  const fallbackYear = Number(semester.start_date.slice(0, 4)) || 2026;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Calendário do Semestre"
          subtitle={`Datas acadêmicas, matrículas, trancamentos e feriados do semestre ${semester.name}.`}
        />
        {events.length > 0 && (
          <ActionButton
            action={clearCalendarEvents.bind(null, semester.id)}
            variant="danger"
            confirm={`Limpar todas as ${events.length} datas do calendário do semestre ${semester.name}?`}
          >
            Limpar calendário ({events.length})
          </ActionButton>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SemesterCalendarView
          semesterStart={semester.start_date}
          semesterEnd={semester.end_date}
          events={events}
        />

        <div className="space-y-6">
          <Panel title="Importar calendário de PDF" id="importar">
            <CalendarPdfImporter
              semesterId={semester.id}
              semesterName={semester.name}
              fallbackYear={fallbackYear}
              hasExistingEvents={events.some((e) => e.source === "pdf")}
            />
          </Panel>

          <Panel title="Adicionar data manualmente" id="nova">
            <ActionForm
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
