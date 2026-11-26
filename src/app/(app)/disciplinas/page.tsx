import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentProps } from "react";
import { Suspense } from "react";
import { Badge, Empty, NoCurrentSemester, PageTitle, Panel } from "@/components/app/ui";
import { absenceHours } from "@/lib/academic/attendance";
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PageTitle title="Disciplinas" subtitle={`Semestre ${semester.name}. Abra uma disciplina para lançar notas e faltas.`} />
        <Link
          href="/disciplinas/nova"
          className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 transition hover:border-accent hover:bg-brand-soft/30 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand dark:text-link">
            <PlusIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Adicionar disciplinas</p>
            <p className="text-xs text-muted">Manual ou importar do SIGAA</p>
          </div>
        </Link>
      </div>

      <SubjectList semester={semester} />
    </>
  );
}

async function SubjectList({ semester }: { semester: SemesterRow }) {
  const subjects = await listSubjects(semester.id);
  return (
    <Panel title={`Matérias do semestre (${subjects.length})`}>
      {!subjects.length ? (
        <Empty>
          Nenhuma disciplina cadastrada.{" "}
          <Link href="/disciplinas/nova" className="font-medium text-link hover:underline">
            Adicionar disciplinas
          </Link>
          .
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {subjects.map((s) => {
            const avg = partialAverage(s.assessments);
            const min = Number(s.min_average ?? semester.min_average);
            const abs = absenceHours(s.class_attendance);
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
                  <div className="text-right text-sm tabular-nums">
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
      )}
    </Panel>
  );
}

function PlusIcon(p: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
