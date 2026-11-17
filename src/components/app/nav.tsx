"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/inicio", label: "Início" },
  { href: "/disciplinas", label: "Disciplinas" },
  { href: "/prazos", label: "Prazos" },
  { href: "/semestres", label: "Semestres" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
              active ? "bg-brand-soft text-brand dark:text-link" : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
