import type { ReactNode } from "react";

// Moldura comum das telas de autenticação (logo, título, cartão e rodapé).
export function AuthShell({
  subtitle,
  children,
  footer,
}: {
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            aria-hidden
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
              <path d="M22 10 12 5 2 10l10 5 10-5Z" />
              <path d="M6 12v5c3 2 9 2 12 0v-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Gerenciador Acadêmico</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {children}
        </div>

        {footer && (
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</p>
        )}
      </div>
    </main>
  );
}
