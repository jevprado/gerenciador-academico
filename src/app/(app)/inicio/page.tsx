import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Suspense } from "react";
import { BookIcon, CalendarIcon, NotebookIcon } from "@/components/auth/icons";
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
    <Suspense fallback={<Hero />}>
      <Dashboard />
    </Suspense>
  );
}

// Lê o usuário e a data no servidor (por requisição).
async function Dashboard() {
  const [user, data] = await Promise.all([getCurrentUser(), getDashboardData()]);
  if (!data) return <><Hero name={user.name?.split(" ")[0]} /><EmptyState /></>;
  const { semester, subjects, deadlines } = data;
  const now = dayOf(new Date());
  const start = Date.parse(semester.start);
  const end = Date.parse(semester.end);
  const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY));
  const week = Math.max(1, Math.ceil((now - start + DAY) / (7 * DAY)));

  const graded = subjects.filter((s) => s.average !== null);
  const overall = graded.length ? graded.reduce((a, s) => a + s.average!, 0) / graded.length : null;
  const atRisk = subjects.filter(isAtRisk);
  const upcoming = deadlines
    .map((d) => ({ ...d, day: dayOf(new Date(d.dueAt)), days: Math.round((dayOf(new Date(d.dueAt)) - now) / DAY) }))
    .sort((a, b) => a.days - b.days);
  const late = upcoming.filter((d) => d.days < 0).length;
  const thisWeek = upcoming.filter((d) => d.days >= 0 && d.days <= 7).length;

  return (
    <>
      <Hero name={user.name?.split(" ")[0]} />

      {/* Semestre atual */}
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
            <span className="text-2xl font-semibold text-foreground">{daysLeft}</span> dias para o fim
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
        <p className="mt-2 text-xs text-muted">{progress}% do semestre concluído</p>
      </section>

      {/* Indicadores */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Disciplinas" value={String(subjects.length)} hint="cursando" />
        <Stat label="Média geral" value={overall === null ? "—" : fmtGrade(overall)} hint="parcial" />
        <Stat label="Prazos na semana" value={String(thisWeek)} hint={late ? `${late} atrasado${late > 1 ? "s" : ""}` : "nenhum atrasado"} alert={late > 0} />
        <Stat label="Em risco" value={String(atRisk.length)} hint="nota ou faltas" alert={atRisk.length > 0} />
      </section>

      {/* Atalhos */}
      <section aria-labelledby="atalhos">
        <h2 id="atalhos" className="mb-3 text-lg font-semibold tracking-tight">Atalhos</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Shortcut href="/prazos#novo" icon={PlusIcon} label="Novo prazo" />
          <Shortcut href="/disciplinas" icon={NotebookIcon} label="Lançar nota" />
          <Shortcut href="/disciplinas#nova" icon={BookIcon} label="Nova disciplina" />
          <Shortcut href="/semestres" icon={CalendarIcon} label="Semestres" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Disciplinas */}
        <Card title="Matérias do semestre" action={<Link href="/disciplinas" className="text-sm font-medium text-link hover:underline">Ver todas</Link>}>
          {subjects.length === 0 && <p className="text-sm text-muted">Nenhuma disciplina cadastrada neste semestre.</p>}
          <ul className="divide-y divide-line">
            {subjects.map((s) => {
              const risk = isAtRisk(s);
              const absPct = s.maxAbsences > 0 ? Math.min(100, (s.absences / s.maxAbsences) * 100) : s.absences > 0 ? 100 : 0;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Link href={`/disciplinas/${s.id}`} className="truncate hover:underline">{s.name}</Link>
                      {risk && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">Em risco</span>}
                    </p>
                    <p className="truncate text-sm text-muted">{[s.professor, s.nextClass].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="w-28">
                    <p className="text-xs text-muted">Faltas {s.absences}/{s.maxAbsences}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-soft">
                      <div className={`h-full rounded-full ${absPct >= 75 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${absPct}%` }} />
                    </div>
                  </div>
                  <div className="w-14 text-right">
                    <p className={`text-lg font-semibold ${s.average !== null && s.average < s.minAverage ? "text-red-600 dark:text-red-400" : ""}`}>
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
                    <span className="text-sm font-semibold">{fmtDate.format(d.day)}</span>
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

function Hero({ name }: { name?: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Olá{name ? `, ${name}` : ""}!</h1>
      <p className="mt-1 text-muted">Aqui está o resumo do seu semestre.</p>
    </div>
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

function Shortcut({ href, icon: Icon, label }: { href: string; icon: (p: ComponentProps<"svg">) => ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm font-medium transition hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand dark:text-link">
        <Icon className="h-4 w-4" />
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
