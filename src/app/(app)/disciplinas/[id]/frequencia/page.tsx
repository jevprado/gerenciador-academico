import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AbsenceMeter, AttendanceCounts } from "@/components/app/attendance-board";
import { AttendanceList } from "@/components/app/attendance-list";
import { Empty, PageTitle, Panel } from "@/components/app/ui";
import { fmtIsoDate } from "@/lib/academic/calc";
import { getSubjectAttendance } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Frequência" };

export default function FrequenciaPage(props: PageProps<"/disciplinas/[id]/frequencia">) {
  return (
    <Suspense fallback={<PageTitle title="Carregando…" back={{ href: "/disciplinas", label: "Disciplinas" }} />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/disciplinas/[id]/frequencia">["params"] }) {
  const { id } = await params;
  const { subject, sessions, summary, today, period, hasCalendar } = await getSubjectAttendance(id);

  return (
    <>
      <PageTitle
        title={`Frequência · ${subject.name}`}
        subtitle={`Aulas de ${fmtIsoDate(period.start)} a ${fmtIsoDate(period.end)}${period.fromCalendar ? " (conforme o calendário acadêmico)" : " (datas do semestre)"}`}
        back={{ href: `/disciplinas/${subject.id}`, label: subject.name }}
      />

      <section className="grid gap-4 rounded-2xl border border-line bg-card p-6 lg:grid-cols-2 lg:items-center">
        <AbsenceMeter summary={summary} />
        <AttendanceCounts summary={summary} />
      </section>

      {!hasCalendar && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          Este semestre ainda não tem calendário acadêmico, então feriados e semana universitária não foram descontados.{" "}
          <Link href={`/calendario?semestre=${subject.semesters.id}`} className="font-medium underline">
            Importar calendário
          </Link>
        </p>
      )}

      <Panel title={`Aulas (${sessions.length})`}>
        {sessions.length === 0 ? (
          <Empty>
            Nenhuma data de aula. Confira os horários da disciplina em{" "}
            <Link href={`/disciplinas/${subject.id}`} className="font-medium text-link hover:underline">
              Dados da disciplina
            </Link>
            .
          </Empty>
        ) : (
          <AttendanceList subjectId={subject.id} sessions={sessions} today={today} />
        )}
      </Panel>
    </>
  );
}
