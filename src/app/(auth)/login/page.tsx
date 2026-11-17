import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormMessage } from "@/components/auth/form-message";
import { LoginForm } from "@/components/auth/login-form";
import { linkClass } from "@/components/auth/styles";

export const metadata: Metadata = {
  title: "Entrar",
};

const NOTICES: Record<string, string> = {
  "link-invalido":
    "Não foi possível concluir a confirmação por este link. Se você já confirmou o e-mail, basta entrar abaixo. Se não, o link pode ter expirado: crie a conta novamente.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <AuthShell
      title="Acesse seu espaço"
      subtitle="Tudo pronto para organizar sua rotina?"
      footer={
        <>
          Ainda não tem uma conta?{" "}
          <Link href="/cadastro" className={linkClass}>
            Criar conta
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <Notice searchParams={props.searchParams} />
      </Suspense>
      <LoginForm />
    </AuthShell>
  );
}

// Avisos vindos de redirecionamentos (ex.: link de confirmação expirado).
async function Notice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { erro } = await searchParams;
  const message = typeof erro === "string" ? NOTICES[erro] : undefined;
  if (!message) return null;
  return (
    <div className="mb-4">
      <FormMessage kind="error">{message}</FormMessage>
    </div>
  );
}
