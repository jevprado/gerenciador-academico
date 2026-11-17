"use client";

// Erros inesperados nas telas logadas (ex.: banco fora do ar ou tabelas ausentes).
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  // Em produção o Next esconde a mensagem vinda do servidor; em dev ela ajuda a depurar.
  const detail = process.env.NODE_ENV === "development" && error instanceof Error ? error.message : null;
  return (
    <section className="rounded-2xl border border-line bg-card p-10 text-center">
      <p className="text-lg font-semibold">Não foi possível carregar esta página</p>
      <p className="mt-1 text-sm text-muted">Tente novamente em instantes.</p>
      {detail && <p className="mx-auto mt-4 max-w-xl rounded-lg bg-background p-3 text-left font-mono text-xs text-muted">{detail}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        Tentar de novo
      </button>
    </section>
  );
}
