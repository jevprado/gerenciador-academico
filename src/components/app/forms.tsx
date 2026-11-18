"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "@/components/auth/form-message";
import type { FormState } from "@/lib/academic/actions";

// Permite que um ActionForm dentro de um EditableItem feche a edição ao salvar.
const EditContext = createContext<(() => void) | null>(null);

// Linha de lista com botão "Editar": mostra o formulário (children) logo abaixo.
export function EditableItem({ summary, actions, children }: { summary: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{summary}</div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
        >
          {open ? "Cancelar" : "Editar"}
        </button>
        {actions}
      </div>
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-background p-4">
          <EditContext.Provider value={() => setOpen(false)}>{children}</EditContext.Provider>
        </div>
      )}
    </>
  );
}

// Formulário ligado a uma server action. Mostra erro e limpa os campos após salvar.
export function ActionForm({
  action,
  children,
  className,
  submitLabel = "Salvar",
  resetOnSuccess = true,
  successMessage,
  id,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const closeEdit = useContext(EditContext);

  useEffect(() => {
    if (!state?.ok) return;
    if (closeEdit) closeEdit();
    else if (resetOnSuccess) ref.current?.reset();
  }, [state?.ok, resetOnSuccess, closeEdit]);

  return (
    <form ref={ref} id={id} action={formAction} className={className ?? "space-y-4"}>
      {state?.error && <FormMessage kind="error">{state.error}</FormMessage>}
      {state?.ok && successMessage && <FormMessage kind="success">{successMessage}</FormMessage>}
      {children}
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
      >
        {pending ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}

// Botão para ações simples (concluir, excluir). `confirm` pede confirmação (RNF07).
export function ActionButton({
  action,
  children,
  confirm,
  variant = "ghost",
  label,
}: {
  action: () => Promise<void>;
  children: ReactNode;
  confirm?: string;
  variant?: "ghost" | "danger";
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <SubmitButton variant={variant} label={label}>
        {children}
      </SubmitButton>
    </form>
  );
}

function SubmitButton({ children, variant, label }: { children: ReactNode; variant: "ghost" | "danger"; label?: string }) {
  const { pending } = useFormStatus();
  const color =
    variant === "danger"
      ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
      : "text-muted hover:bg-background hover:text-foreground";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 ${color}`}
    >
      {children}
    </button>
  );
}
