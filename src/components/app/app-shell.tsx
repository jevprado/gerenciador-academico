"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { logout } from "@/lib/auth/actions";
import { Logo } from "./logo";
import { Nav } from "./nav";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({ userSlot, children }: { userSlot: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      {/* Barra superior apenas no mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu de navegação"
            aria-expanded={open}
            aria-controls="app-sidebar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link href="/inicio" className="flex items-center gap-2" aria-label="Gestão acadêmica — início">
            <Logo className="h-8 w-auto text-brand dark:text-link" />
            <span className="text-sm font-semibold tracking-tight">Gestão acadêmica</span>
          </Link>
        </div>
        <ThemeToggle />
      </header>

      {/* Overlay do menu mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Menu lateral (fixo no desktop, drawer no mobile) */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-card transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <Link
            href="/inicio"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-brand rounded-lg"
            aria-label="Gestão acadêmica — início"
          >
            <Logo className="h-10 w-auto shrink-0 text-brand dark:text-link" />
            <span className="text-sm font-semibold leading-tight tracking-tight">
              Gestão
              <br />
              acadêmica
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu de navegação"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand lg:hidden"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Suspense fallback={null}>
            <Nav onNavigate={() => setOpen(false)} />
          </Suspense>
        </div>

        <div className="space-y-3 border-t border-line p-4">
          {userSlot}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={logout} className="flex-1">
              <button
                type="submit"
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
              >
                <LogoutIcon className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {children}
      </main>
    </div>
  );
}

function MenuIcon(p: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon(p: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function LogoutIcon(p: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}
