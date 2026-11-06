"use client";

import { useActionState } from "react";
import { login } from "@/lib/auth/actions";
import { FormMessage } from "./form-message";
import { ArrowRightIcon } from "./icons";
import { PasswordInput } from "./password-input";
import { SocialButtons } from "./social-buttons";
import { inputClass, linkClass, primaryButtonClass } from "./styles";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="space-y-6">
      <SocialButtons dividerLabel="ou use seu e-mail pessoal" />

      <form action={action} className="space-y-5">
        {state?.error && <FormMessage kind="error">{state.error}</FormMessage>}

        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium">
            E-mail pessoal
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@exemplo.com"
            defaultValue={state?.fields?.email}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium">
            Senha
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="Digite sua senha"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              name="remember"
              defaultChecked={state?.fields?.remember}
              className="h-4 w-4 cursor-pointer rounded border-line accent-brand"
            />
            Manter conectado
          </label>
          {/* TODO: fluxo de recuperação de senha */}
          <a href="#" className={`text-sm ${linkClass}`}>
            Esqueci minha senha
          </a>
        </div>

        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            "Entrando…"
          ) : (
            <>
              Entrar
              <ArrowRightIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
