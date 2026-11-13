import type { ReactNode } from "react";
import { BookIcon, CalendarIcon, HelpIcon, NotebookIcon, ProgressIcon } from "./icons";

const FEATURES = [
  {
    icon: NotebookIcon,
    title: "Disciplinas em um só lugar",
    text: "Materiais e informações organizados por matéria.",
  },
  {
    icon: CalendarIcon,
    title: "Prazos sempre à vista",
    text: "Acompanhe provas, trabalhos e próximas entregas.",
  },
  {
    icon: ProgressIcon,
    title: "Clareza sobre seu progresso",
    text: "Consulte suas notas e acompanhe cada etapa.",
  },
];

// Moldura comum das telas de autenticação: cabeçalho, apresentação à esquerda,
// cartão com o formulário à direita e rodapé.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-6 sm:px-8 lg:px-20">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white">
            <BookIcon className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Gestão acadêmica</span>
        </div>
        {/* TODO: página de ajuda */}
        <a
          href="#"
          className="flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
        >
          <HelpIcon className="h-4 w-4" />
          Precisa de ajuda?
        </a>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-16 px-4 py-10 sm:px-8 lg:grid-cols-[1fr_minmax(0,32rem)] lg:px-20 lg:py-16">
        <section className="hidden lg:block lg:pl-8">
          <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-brand dark:text-link">
            <span aria-hidden className="h-0.5 w-6 bg-current" />
            MENOS RUÍDO. MAIS FOCO.
          </p>
          <h2 className="mt-6 text-6xl leading-[1.1] font-medium tracking-tight">
            Sua vida acadêmica,
            <br />
            <span className="text-brand dark:text-link">em ordem.</span>
          </h2>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-muted">
            Reúna disciplinas, prazos, objetivos e notas em um único lugar. Mais organização
            para focar no que importa: aprender.
          </p>

          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: FeatureIcon, title: featureTitle, text }) => (
              <li key={featureTitle} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand dark:text-link">
                  <FeatureIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">{featureTitle}</p>
                  <p className="mt-0.5 text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-xs text-muted">Seu próximo semestre começa com mais clareza.</p>
        </section>

        <div className="w-full max-w-lg justify-self-center rounded-2xl border border-line bg-card p-6 shadow-xl shadow-black/[0.03] sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-8 text-xs text-muted sm:px-8 lg:px-20">
          <span>Gestão acadêmica</span>
          {/* TODO: páginas de privacidade e termos */}
          <nav className="flex gap-6">
            <a href="#" className="transition hover:text-foreground">
              Privacidade
            </a>
            <a href="#" className="transition hover:text-foreground">
              Termos de uso
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
