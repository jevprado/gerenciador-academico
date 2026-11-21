import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionButton, ActionForm } from "@/components/app/forms";
import { fieldClass } from "@/components/app/styles";
import { Badge, Empty, Field, PageTitle, Panel, ScheduleFields } from "@/components/app/ui";
import { AttendanceBoard } from "@/components/app/attendance-board";
import {
  createAssessment,
  deleteAssessment,
  deleteSubject,
  setGrade,
  updateSubject,
} from "@/lib/academic/actions";
import { TYPE_LABEL, fmtGrade, fmtIsoDate, partialAverage } from "@/lib/academic/calc";
import { getSubjectAttendance, type SubjectDetail } from "@/lib/academic/queries";

export const metadata: Metadata = { title: "Disciplina" };

export default function DisciplinaPage(props: PageProps<"/disciplinas/[id]">) {
  return (
    <Suspense fallback={<PageTitle title="Carregando…" back={{ href: "/disciplinas", label: "Disciplinas" }} />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/disciplinas/[id]">["params"] }) {
  const { id } = await params;
  const { subject: s, summary } = await getSubjectAttendance(id);
  const minAvg = Number(s.min_average ?? s.semesters.min_average);
  const avg = partialAverage(s.assessments);
  const { absentHours: abs, maxAbsenceHours: maxAbs } = summary;
  const totalWeight = s.assessments.reduce((a, x) => a + Number(x.weight), 0);
  const pending = s.assessments.filter((a) => a.grade === null);
  // Média que falta nas avaliações sem nota para fechar com a mínima (RF26).
  const pendingWeight = pending.reduce((a, x) => a + Number(x.weight), 0);
  const earned = s.assessments
    .filter((a) => a.grade !== null)
    .reduce((acc, a) => acc + (Number(a.grade) / Number(a.max_grade)) * 10 * Number(a.weight), 0);
  const needed = pendingWeight ? (minAvg * totalWeight - earned) / pendingWeight : null;

  return (
    <>
      <PageTitle
        title={s.name}
        subtitle={[s.code, s.professor, s.room, `Semestre ${s.semesters.name}`].filter(Boolean).join(" · ")}
        back={{ href: "/disciplinas", label: "Disciplinas" }}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Média parcial" value={avg === null ? "—" : fmtGrade(avg)} hint={`mínima ${fmtGrade(minAvg)}`} alert={avg !== null && avg < minAvg} />
        <Stat
          label="Precisa tirar"
          value={needed === null ? "—" : needed <= 0 ? "0,0" : needed > 10 ? ">10" : fmtGrade(needed)}
          hint={needed === null ? "sem avaliações pendentes" : "média nas pendentes"}
          alert={needed !== null && needed > 10}
        />
        <Stat label="Faltas" value={`${abs}/${maxAbs}`} hint={`restam ${Math.max(0, maxAbs - abs)}h`} alert={abs > 0 && abs >= maxAbs * 0.75} />
        <Stat label="Avaliações" value={String(s.assessments.length)} hint={`${pending.length} sem nota`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Avaliações e notas">
          <AssessmentList subject={s} />
          <h3 className="mt-6 mb-3 text-sm font-semibold">Nova avaliação</h3>
          <ActionForm action={createAssessment.bind(null, s.id)} submitLabel="Adicionar avaliação">
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Field label="Nome">
                <input name="name" required maxLength={120} placeholder="P1" className={fieldClass} />
              </Field>
              <Field label="Tipo">
                <select name="type" className={fieldClass}>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Data">
                <input type="date" name="date" className={fieldClass} />
              </Field>
              <Field label="Peso">
                <input name="weight" inputMode="decimal" required defaultValue="1" className={fieldClass} />
              </Field>
              <Field label="Nota máx.">
                <input name="max_grade" inputMode="decimal" required defaultValue="10" className={fieldClass} />
              </Field>
              <Field label="Nota">
                <input name="grade" inputMode="decimal" placeholder="—" className={fieldClass} />
              </Field>
            </div>
          </ActionForm>
        </Panel>

        <div className="space-y-6">
          <AttendanceBoard subjectId={s.id} summary={summary} hasSchedule={s.class_schedules.length > 0} />

          <Panel title="Dados da disciplina">
            <ActionForm action={updateSubject.bind(null, s.id)} resetOnSuccess={false} successMessage="Alterações salvas.">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Field label="Nome">
                  <input name="name" required maxLength={120} defaultValue={s.name} className={fieldClass} />
                </Field>
                <Field label="Cor">
                  <input type="color" name="color" defaultValue={s.color} className="h-10 w-16 cursor-pointer rounded-lg border border-line bg-card p-1" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Código">
                  <input name="code" maxLength={30} defaultValue={s.code ?? ""} className={fieldClass} />
                </Field>
                <Field label="Sala">
                  <input name="room" maxLength={60} defaultValue={s.room ?? ""} className={fieldClass} />
                </Field>
                <Field label="Professor(a)">
                  <input name="professor" maxLength={120} defaultValue={s.professor ?? ""} className={fieldClass} />
                </Field>
                <Field label="Carga horária (h)">
                  <input name="workload_hours" inputMode="numeric" required defaultValue={s.workload_hours} className={fieldClass} />
                </Field>
                <Field label="Média mínima" hint="Vazio = do semestre">
                  <input name="min_average" inputMode="decimal" defaultValue={s.min_average ?? ""} className={fieldClass} />
                </Field>
                <Field label="Frequência mín. (%)" hint="Vazio = do semestre">
                  <input name="min_attendance" inputMode="decimal" defaultValue={s.min_attendance ?? ""} className={fieldClass} />
                </Field>
              </div>
              <Field label="Situação">
                <select name="status" defaultValue={s.status} className={fieldClass}>
                  <option value="cursando">Cursando</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                  <option value="trancado">Trancado</option>
                </select>
              </Field>
              <ScheduleFields initial={s.class_schedules} />
            </ActionForm>
            <div className="mt-6 border-t border-line pt-4">
              <ActionButton
                action={deleteSubject.bind(null, s.id)}
                variant="danger"
                confirm={`Excluir ${s.name}? Notas, faltas e horários serão apagados.`}
              >
                Excluir disciplina
              </ActionButton>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function AssessmentList({ subject }: { subject: SubjectDetail }) {
  if (!subject.assessments.length) return <Empty>Nenhuma avaliação cadastrada.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {subject.assessments.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              {a.name} <Badge>{TYPE_LABEL[a.type] ?? a.type}</Badge>
            </p>
            <p className="text-xs text-muted">
              {[a.date && fmtIsoDate(a.date), `peso ${Number(a.weight).toLocaleString("pt-BR")}`, `máx. ${Number(a.max_grade).toLocaleString("pt-BR")}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ActionForm action={setGrade.bind(null, a.id)} resetOnSuccess={false} submitLabel="OK" className="flex items-center gap-2">
            <input
              name="grade"
              inputMode="decimal"
              aria-label={`Nota de ${a.name}`}
              placeholder="—"
              defaultValue={a.grade === null ? "" : String(a.grade).replace(".", ",")}
              className={`${fieldClass} w-20 text-right`}
            />
          </ActionForm>
          <ActionButton action={deleteAssessment.bind(null, a.id)} variant="danger" confirm={`Excluir a avaliação ${a.name}?`} label={`Excluir ${a.name}`}>
            ✕
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, hint, alert }: { label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className={`mt-1 text-xs ${alert ? "font-medium text-red-600 dark:text-red-400" : "text-muted"}`}>{hint}</p>
    </div>
  );
}
