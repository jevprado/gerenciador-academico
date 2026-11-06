"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { REMEMBER_COOKIE } from "@/lib/supabase/remember";
import { createClient } from "@/lib/supabase/server";
import { translateAuthError } from "./errors";

export type AuthFormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;
      success?: string;
      // Valores devolvidos para repreencher o formulário (nunca a senha).
      fields?: { name?: string; email?: string; remember?: boolean };
    }
  | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").trim().toLowerCase();
  const password = field(formData, "password");
  const remember = formData.get("remember") === "on";

  if (!email || !password) {
    return { error: "Preencha e-mail e senha.", fields: { email, remember } };
  }

  const supabase = await createClient({ persistent: remember });
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: translateAuthError(error), fields: { email, remember } };
  }

  // Guarda a preferência para que o proxy renove a sessão do mesmo jeito.
  const cookieStore = await cookies();
  if (remember) {
    cookieStore.delete(REMEMBER_COOKIE);
  } else {
    cookieStore.set(REMEMBER_COOKIE, "0", { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  }

  redirect("/inicio");
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = field(formData, "name").trim();
  const email = field(formData, "email").trim().toLowerCase();
  const password = field(formData, "password");
  const confirmPassword = field(formData, "confirmPassword");
  const fields = { name, email };

  const fieldErrors: NonNullable<AuthFormState>["fieldErrors"] = {};
  if (name.length < 2) fieldErrors.name = "Informe seu nome.";
  else if (name.length > 100) fieldErrors.name = "Nome muito longo.";
  if (!EMAIL_RE.test(email)) fieldErrors.email = "Informe um e-mail válido.";
  if (password.length < MIN_PASSWORD)
    fieldErrors.password = `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`;
  else if (password.length > 72) fieldErrors.password = "A senha deve ter no máximo 72 caracteres.";
  if (confirmPassword !== password) fieldErrors.confirmPassword = "As senhas não coincidem.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, fields };
  }

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${origin}/auth/confirm?next=/inicio`,
    },
  });

  if (error) {
    return { error: translateAuthError(error), fields };
  }

  // Se a confirmação de e-mail estiver desativada no Supabase, o usuário já sai logado.
  if (data.session) {
    redirect("/inicio");
  }

  // Com confirmação ativada, o Supabase responde igual para e-mails novos e já
  // cadastrados (proteção contra enumeração de contas) — a mensagem também é a mesma.
  return {
    success: `Conta criada! Enviamos um link de confirmação para ${email}. Abra-o para ativar sua conta.`,
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(REMEMBER_COOKIE);
  redirect("/login");
}
