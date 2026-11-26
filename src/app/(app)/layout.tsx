import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/lib/auth/user";

async function SidebarUser() {
  const user = await getCurrentUser();
  const displayName = user.name?.trim() || user.email || "Conta";
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground" title={displayName}>
        {displayName}
      </p>
      {user.name && user.email && (
        <p className="truncate text-xs text-muted" title={user.email}>
          {user.email}
        </p>
      )}
    </div>
  );
}

// Moldura das telas logadas. O proxy e cada página conferem a sessão.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      userSlot={
        <Suspense fallback={<div className="h-5 w-28 animate-pulse rounded bg-background" />}>
          <SidebarUser />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
