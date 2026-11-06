import type { Metadata } from "next";
import { Suspense } from "react";
import { logout } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/user";

export const metadata: Metadata = {
  title: "Início",
};

// Tela provisória: será substituída pelo painel quando houver protótipo e requisitos.
export default function InicioPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <Suspense fallback={<h1 className="text-4xl font-semibold tracking-tight">Bem-vindo!</h1>}>
        <Greeting />
      </Suspense>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Sair
        </button>
      </form>
    </main>
  );
}

// O proxy já barra quem não está logado, mas a página confere de novo
// no servidor (defesa em profundidade).
async function Greeting() {
  const user = await getCurrentUser();
  return (
    <h1 className="text-4xl font-semibold tracking-tight">
      Bem-vindo{user.name ? `, ${user.name}` : ""}!
    </h1>
  );
}
