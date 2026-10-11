"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { canAccessPath, isAdminPath } from "@/lib/rbac";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UiVersionSwitcher } from "@/components/UiVersionProvider";
import { useWebSocket } from "@/components/WebSocketProvider";
import AdminGuard from "@/components/ui/AdminGuard";
import HeaderRefreshButton from "@/components/ui/HeaderRefreshButton";
import { LayoutDashboard, Network, Handshake, ShieldAlert, Search, Settings, Archive, Compass, Globe, Bookmark, Users } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  "/": LayoutDashboard, "/interfaces": Network, "/bgp": Handshake, "/policy": ShieldAlert,
  "/lg": Search, "/route-lookup": Compass, "/lookup": Globe, "/settings": Settings,
  "/settings/users": Users, "/settings/retention": Archive, "/settings/as-mapping": Bookmark,
};

const GROUPS = [
  { title: "Monitoring", items: [
    { name: "Dashboard", path: "/" },
    { name: "Interfaces", path: "/interfaces" },
    { name: "BGP Neighbors", path: "/bgp" },
  ]},
  { title: "Tools", items: [
    { name: "Routing Policy", path: "/policy" },
    { name: "Looking Glass", path: "/lg" },
    { name: "Route Lookup", path: "/route-lookup" },
    { name: "Global Lookup", path: "/lookup" },
  ]},
  { title: "Configuration", items: [
    { name: "Settings", path: "/settings" },
    { name: "User Management", path: "/settings/users" },
    { name: "Data Retention", path: "/settings/retention" },
    { name: "AS Mappings", path: "/settings/as-mapping" },
  ]},
];

/** Layout v2: left sidebar navigation, top bar for controls. Scoped to data-ui-version="v2". */
export default function LayoutShellV2({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();
  const [open, setOpen] = React.useState(false);

  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessPath(user, i.path)) }))
    .filter((g) => g.items.length > 0);

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1.5 text-xs font-medium text-[var(--ui-muted)]">{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = pathname === item.path;
              const Icon = ICONS[item.path];
              return (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-10 items-center rounded px-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--ui-muted-bg)] text-[var(--ui-foreground)]"
                        : "text-[var(--ui-muted)] hover:bg-[var(--ui-muted-bg)] hover:text-[var(--ui-foreground)]"
                    }`}
                  >
                    <Icon aria-hidden={true} size={16} />
                    <span className="ml-3">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="v2-shell flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--ui-border)] bg-[var(--ui-background)] lg:flex">
        <Link href="/" className="flex h-14 items-center gap-2 px-5 font-semibold tracking-tight text-[var(--ui-foreground)]">
          <span className="flex size-7 items-center justify-center rounded bg-[var(--ui-foreground)] text-xs text-[var(--ui-background)]">J</span>
          JupeTrack
        </Link>
        {nav}
        <div className="mt-auto flex items-center gap-2 border-t border-[var(--ui-border)] px-5 py-3 text-xs text-[var(--ui-muted)]">
          <span className={`size-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
          {isConnected ? "Online" : "Disconnected"}
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-[var(--ui-border)] bg-[var(--ui-background)] transition-transform lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between px-5">
          <span className="font-semibold text-[var(--ui-foreground)]">JupeTrack</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="flex size-11 items-center justify-center text-[var(--ui-muted)]">
            ✕
          </button>
        </div>
        {nav}
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-background)] px-4 md:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex size-11 items-center justify-center rounded border border-[var(--ui-border)] text-[var(--ui-foreground)] lg:hidden"
          >
            ☰
          </button>
          {user && <span className="hidden text-sm text-[var(--ui-muted)] sm:inline">{user.username}</span>}
          <div className="ml-auto flex items-center gap-2">
            <HeaderRefreshButton />
            <UiVersionSwitcher />
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="min-h-11 rounded px-3 text-sm text-[var(--ui-muted)] hover:bg-[var(--ui-muted-bg)] hover:text-[var(--ui-foreground)]"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-[90rem] min-w-0">
            {isAdminPath(pathname) ? <AdminGuard>{children}</AdminGuard> : children}
          </div>
        </main>
      </div>
    </div>
  );
}
