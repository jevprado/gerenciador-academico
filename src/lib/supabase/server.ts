import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";
import { REMEMBER_COOKIE, isPersistent, withPersistence } from "./remember";

// Cliente Supabase para Server Components, Server Actions e Route Handlers.
// Crie um novo a cada requisição — nunca reutilize entre usuários.
// `persistent` sobrescreve a preferência "Manter conectado" salva em cookie.
export async function createClient({ persistent }: { persistent?: boolean } = {}) {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  const keep = persistent ?? isPersistent(cookieStore.get(REMEMBER_COOKIE)?.value);

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withPersistence(options, keep)),
          );
        } catch {
          // Chamado a partir de um Server Component, onde não dá para gravar cookies.
          // Tudo bem: o proxy já renova a sessão a cada requisição.
        }
      },
    },
  });
}
