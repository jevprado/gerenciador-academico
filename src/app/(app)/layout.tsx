import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/app/nav";
import { BookIcon } from "@/components/auth/icons";
import { logout } from "@/lib/auth/actions";

// Moldura das telas logadas. O proxy e cada página conferem a sessão.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href="/inicio" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
              <BookIcon className="h-5 w-5" />
            </span>
            <span className="hidden font-semibold tracking-tight sm:inline">Gestão acadêmica</span>
          </Link>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
