import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
};

// Data Access Layer: único ponto que lê a sessão e devolve um usuário "enxuto".
// Redireciona para /login se não houver sessão válida.
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  // getClaims valida o JWT (não confie em getSession no servidor).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    redirect("/login");
  }

  const metadata = claims.user_metadata as { full_name?: unknown } | undefined;

  return {
    id: claims.sub,
    name: typeof metadata?.full_name === "string" ? metadata.full_name : null,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
