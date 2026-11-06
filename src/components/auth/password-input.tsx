"use client";

import { useState, type ComponentProps } from "react";
import { inputClass } from "./styles";

// Campo de senha com botão de mostrar/ocultar.
export function PasswordInput(props: Omit<ComponentProps<"input">, "type" | "className">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-16`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
