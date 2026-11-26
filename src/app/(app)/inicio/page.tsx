import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Suspense } from "react";
import { BookIcon, NotebookIcon } from "@/components/auth/icons";
import { getCurrentUser } from "@/lib/auth/user";
import { getDashboardData, type Subject } from "@/lib/dashboard/data";

export const metadata: Metadata = {
  title: "Início",
};

const DAY = 86_400_000;
const fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fmtLong = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });
const fmtGrade = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Dia (meia-noite UTC) no fuso de Brasília, para comparar datas sem depender do fuso do servidor.
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const dayOf = (d: Date) => Date.parse(ymd.format(d));

function isAtRisk(s: Subject) {
  return (s.average !== null && s.average < s.minAverage) || (s.absences > 0 && s.absences >= s.maxAbsences * 0.75);
}

export default function InicioPage() {
  return (
    <Suspense fallback={<TopHeader />}>
      <Dashboard />
    </Suspense>
  );
}

// Lê o usuário e a data no servidor (por requisição).
async function Dashboard() {
  const [user, data] = await Promise.all([getCurrentUser(), getDashboardData()]);
  const firstName = user.name?.split(" ")[0];
  if (!data) {
    return (
      <>
        <TopHeader name={firstName} />
        <EmptyState />
      </>
    );
  }

  const { semester, subjects, deadlines } = data;
  const now = dayOf(new Date());
  const start = Date.parse(semester.start);
  const end = Date.parse(semester.end);
  const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY));
  const week = Math.max(1, Math.ceil((now - start + DAY) / (7 * DAY)));

  const upcoming = deadlines
    .map((d) => ({ ...d, day: dayOf(new Date(d.dueAt)), days: Math.round((dayOf(new Date(d.dueAt)) - now) / DAY) }))
    .sort((a, b) => a.days - b.days);

  return (
    <>
      <TopHeader name={firstName} />

      {/* Semestre atual (progresso) */}
      <section className="rounded-2xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-brand dark:text-link">SEMESTRE ATUAL</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{semester.name}</p>
            <p className="mt-1 text-sm text-muted">
              {fmtLong.format(start)} a {fmtLong.format(end)} · Semana {week}
            </p>
          </div>
          <p className="text-sm text-muted">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{daysLeft}</span> dias para o fim
          </p>
        </div>
        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-brand-soft"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do semestre"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs tabular-nums text-muted">{progress}% do semestre concluído</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Disciplinas */}
        <Card
          title={`Disciplinas (${subjects.length})`}
          action={<Link href="/disciplinas" className="text-sm font-medium text-link hover:underline">Ver todas</Link>}
        >
          {subjects.length === 0 && <p className="text-sm text-muted">Nenhuma disciplina cadastrada neste semestre.</p>}
          <ul className="divide-y divide-line">
            {subjects.map((s) => {
              const risk = isAtRisk(s);
              const absPct = s.maxAbsences > 0 ? Math.min(100, (s.absences / s.maxAbsences) * 100) : s.absences > 0 ? 100 : 0;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-1 items-stretch gap-3.5">
                    <span className="w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <Link href={`/disciplinas/${s.id}`} className="truncate hover:underline">{s.name}</Link>
                        {risk && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">Em risco</span>}
                      </p>
                      {s.professor ? (
                        <p className="truncate text-sm text-muted">{s.professor}</p>
                      ) : s.schedules.length === 0 ? (
                        <p className="text-sm text-muted">—</p>
                      ) : null}
                      {s.schedules.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {s.schedules.map((slot) => (
                            <span
                              key={slot}
                              className="rounded-md bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-inset ring-line"
                            >
                              {slot}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-28">
                    <p className="text-xs tabular-nums text-muted">Faltas {s.absences}/{s.maxAbsences}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-soft">
                      <div className={`h-full rounded-full ${absPct >= 75 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${absPct}%` }} />
                    </div>
                  </div>
                  <div className="w-14 text-right">
                    <p className={`text-lg font-semibold tabular-nums ${s.average !== null && s.average < s.minAverage ? "text-red-600 dark:text-red-400" : ""}`}>
                      {s.average === null ? "—" : fmtGrade(s.average)}
                    </p>
                    <p className="text-xs text-muted">média</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Próximos prazos */}
        <Card title="Próximos prazos" action={<Link href="/prazos" className="text-sm font-medium text-link hover:underline">Ver todos</Link>}>
          {upcoming.length === 0 && <p className="text-sm text-muted">Nenhum prazo pendente.</p>}
          <ul className="space-y-3">
            {upcoming.map((d) => {
              const subject = d.subjectId ? subjects.find((s) => s.id === d.subjectId) : undefined;
              return (
                <li key={d.id} className="flex gap-3 rounded-xl border border-line p-3">
                  <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-soft py-1 text-brand dark:text-link">
                    <span className="text-sm font-semibold tabular-nums">{fmtDate.format(d.day)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: subject?.color }} aria-hidden />
                      {[subject?.name, d.type].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <DueBadge days={d.days} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
      <p className="text-lg font-semibold">Nenhum semestre atual</p>
      <p className="mt-1 text-sm text-muted">Cadastre um semestre e marque-o como atual para ver o resumo aqui.</p>
      <Link href="/semestres" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">Cadastrar semestre</Link>
    </section>
  );
}

function TopHeader({ name }: { name?: string }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Olá{name ? `, ${name}` : ""}!</h1>
        <p className="mt-1 text-muted">Aqui está o resumo do seu semestre.</p>
      </div>

      <section aria-labelledby="atalhos" className="rounded-2xl border border-line bg-card px-4 py-3">
        <p id="atalhos" className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          Atalhos
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Shortcut href="/prazos#novo" icon={PlusIcon} label="Novo prazo" />
          <Shortcut href="/disciplinas" icon={NotebookIcon} label="Lançar nota" />
          <Shortcut href="/disciplinas/nova" icon={BookIcon} label="Nova disciplina" />
        </div>
      </section>
    </div>
  );
}

function Shortcut({ href, icon: Icon, label }: { href: string; icon: (p: ComponentProps<"svg">) => ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-line bg-background/60 px-3 py-2 text-sm font-medium whitespace-nowrap transition hover:border-accent hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-brand dark:text-link">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {label}
    </Link>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DueBadge({ days }: { days: number }) {
  const [text, cls] =
    days < 0
      ? [`Atrasado ${-days}d`, "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"]
      : days === 0
        ? ["Hoje", "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"]
        : days <= 3
          ? [`Em ${days}d`, "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"]
          : [`Em ${days}d`, "bg-brand-soft text-brand dark:text-link"];
  return <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

function PlusIcon(p: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
