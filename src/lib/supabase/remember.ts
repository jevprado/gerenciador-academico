import type { CookieOptions } from "@supabase/ssr";

// "Manter conectado": quando desmarcado no login, gravamos este cookie (de sessão)
// com valor "0" e os cookies do Supabase passam a ser de sessão também — somem
// quando o navegador é fechado. Sem o cookie, a sessão é persistente (padrão).
export const REMEMBER_COOKIE = "ga-remember";

export function isPersistent(value: string | undefined) {
  return value !== "0";
}

// Remove a validade do cookie para que ele dure só enquanto o navegador estiver aberto.
// Cookies de remoção (maxAge 0) ficam como estão.
export function withPersistence(options: CookieOptions, persistent: boolean): CookieOptions {
  if (persistent || options.maxAge === 0) return options;
  return { ...options, maxAge: undefined, expires: undefined };
}
