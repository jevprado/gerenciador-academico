"use client";

import { useActionState } from "react";
import { signup } from "@/lib/auth/actions";
import { FieldError, FormMessage } from "./form-message";
import { PasswordInput } from "./password-input";
import { inputClass, primaryButtonClass } from "./styles";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const errors = state?.fieldErrors ?? {};

  if (state?.success) {
    return <FormMessage kind="success">{state.success}</FormMessage>;
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.error && <FormMessage kind="error">{state.error}</FormMessage>}

      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          Nome
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          placeholder="Seu nome"
          defaultValue={state?.fields?.name}
          aria-invalid={Boolean(errors.name)}
          aria-describedby="name-error"
          className={inputClass}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">
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
          aria-invalid={Boolean(errors.email)}
          aria-describedby="email-error"
          className={inputClass}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          Senha
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Mínimo de 8 caracteres"
          aria-invalid={Boolean(errors.password)}
          aria-describedby="password-error"
        />
        <FieldError id="password-error" message={errors.password} />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="block text-sm font-medium">
          Confirmar senha
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          placeholder="Repita a senha"
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby="confirmPassword-error"
        />
        <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
      </div>

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
