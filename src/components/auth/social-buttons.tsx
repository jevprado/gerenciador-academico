// Login social ainda não está ligado ao Supabase (precisa configurar OAuth
// no Google Cloud / Azure). Por enquanto os botões ficam desativados.
// TODO: supabase.auth.signInWithOAuth({ provider: "google" | "azure" })

import { secondaryButtonClass } from "./styles";

const providers = {
  google: {
    label: "Continuar com Google",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor">
        <path d="M21.35 11.1H12v3.83h5.35c-.23 1.24-.93 2.29-1.98 3l3.2 2.48c1.87-1.72 2.95-4.26 2.95-7.28 0-.69-.06-1.36-.17-2.03Z" />
        <path d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.2-2.48c-.9.6-2.04.95-3.42.95-2.6 0-4.81-1.76-5.6-4.12l-3.3 2.56A10 10 0 0 0 12 22Z" />
        <path d="M6.4 13.92a6 6 0 0 1 0-3.84L3.1 7.52a10 10 0 0 0 0 8.96l3.3-2.56Z" />
        <path d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.1 7.52l3.3 2.56C7.19 7.72 9.4 5.96 12 5.96Z" />
      </svg>
    ),
  },
  microsoft: {
    label: "Continuar com Microsoft",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor">
        <path d="M3 3h8.5v8.5H3zM12.5 3H21v8.5h-8.5zM3 12.5h8.5V21H3zM12.5 12.5H21V21h-8.5z" />
      </svg>
    ),
  },
} as const;

function SocialButton({ provider }: { provider: keyof typeof providers }) {
  const { label, icon } = providers[provider];

  return (
    <button type="button" disabled title="Em breve" className={secondaryButtonClass}>
      {icon}
      {label}
    </button>
  );
}

export function SocialButtons({ dividerLabel = "ou" }: { dividerLabel?: string }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3">
        <SocialButton provider="google" />
        <SocialButton provider="microsoft" />
      </div>
      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        {dividerLabel}
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
