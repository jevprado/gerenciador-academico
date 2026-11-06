"use client";

import { useActionState } from "react";
import { login } from "@/lib/auth/actions";
import { FormMessage } from "./form-message";
import { PasswordInput } from "./password-input";
import { SocialButtons } from "./social-buttons";
import { inputClass, linkClass, primaryButtonClass } from "./styles";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="space-y-6">
      <SocialButtons />

      <form action={action} className="space-y-4">
        {state?.error && <FormMessage kind="error">{state.error}</FormMessage>}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            {/* TODO: fluxo de recuperação de senha */}
            <a href="#" className={`text-sm ${linkClass}`}>
              Esqueci minha senha
            </a>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>

        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
