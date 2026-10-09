"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/ui/Sidebar";
import HeaderRefreshButton from "@/components/ui/HeaderRefreshButton";
import AdminGuard from "@/components/ui/AdminGuard";
import { isAdminPath } from "@/lib/rbac";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UiVersionSwitcher, useUiVersion } from "@/components/UiVersionProvider";
import LayoutShellV2 from "@/components/ui/LayoutShellV2";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PUBLIC_PATHS = ["/login"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const { uiVersion } = useUiVersion();

  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);
  const [passwords, setPasswords] = React.useState({ current: "", new: "", confirm: "" });
  const [passError, setPassError] = React.useState("");
  const [passSuccess, setPassSuccess] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const passwordButtonRef = React.useRef<HTMLButtonElement>(null);
  const currentPasswordRef = React.useRef<HTMLInputElement>(null);

  const isPublic = PUBLIC_PATHS.some(p => pathname === p);

  // Load sidebar collapsed state from localStorage if preset
  React.useEffect(() => {
    try {
      const val = localStorage.getItem("junos-sidebar-collapsed");
      if (val) setIsCollapsed(JSON.parse(val));
    } catch {}
  }, []);

  const handleSetCollapsed = (val: boolean) => {
    setIsCollapsed(val);
    try {
      localStorage.setItem("junos-sidebar-collapsed", JSON.stringify(val));
    } catch {}
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess(false);

    if (passwords.new !== passwords.confirm) {
      setPassError("New passwords do not match");
      return;
    }
    if (passwords.new.length < 12) {
      setPassError("Password must be at least 12 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const { authFetch } = await import("@/lib/auth");
      const res = await authFetch("/api/proxy/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: passwords.current,
          new_password: passwords.new,
        }),
      });

      if (!res.ok) {
        let errMessage = "Failed to change password";
        try {
          const data = await res.json();
          errMessage = data.error || data.detail || errMessage;
        } catch {
          errMessage = await res.text();
        }
        throw new Error(errMessage);
      }

      setPassSuccess(true);
      setPasswords({ current: "", new: "", confirm: "" });
      setTimeout(() => setIsPasswordModalOpen(false), 2000);
    } catch (err) {
      setPassError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // For public routes (login page), render without shell
  if (isPublic) {
    return <>{children}</>;
  }

  // While restoring session, show a minimal loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background" role="status" aria-label="Restoring session">
        <div className="size-10 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
        <p className="text-sm text-on-surface-variant">Restoring session...</p>
      </div>
    );
  }

  // v2: full layout replacement (top nav). v1 path below is unchanged.
  if (uiVersion === "v2") {
    return <LayoutShellV2>{children}</LayoutShellV2>;
  }

  // Authenticated app shell
  return (
    <div
      className="flex w-full min-h-screen"
      style={{
        "--sidebar-width": isCollapsed ? "5rem" : "16rem",
        "--shell-main-padding": "1rem",
      } as React.CSSProperties}
    >
      <Sidebar 
        isCollapsed={isCollapsed} 
        setIsCollapsed={handleSetCollapsed} 
        isMobileOpen={isMobileOpen} 
        setIsMobileOpen={setIsMobileOpen} 
        menuButtonRef={menuButtonRef}
      />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 overflow-hidden h-screen ${
        'md:pl-[calc(var(--sidebar-width)+var(--shell-main-padding))]'
      } pl-0`}>
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-y-2 border-b border-outline-variant bg-background px-4 py-2 md:px-8 xl:h-16 xl:flex-nowrap xl:py-0 z-20">
          <div className="order-1 flex items-center gap-2">
            <button 
              ref={menuButtonRef}
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={isMobileOpen}
              aria-controls="primary-navigation-drawer"
              className="mr-1 flex size-11 items-center justify-center rounded border border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface md:hidden"
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            {user && (
              <span className="text-xs text-on-surface-variant hidden sm:inline">
                Signed in as <span className="text-on-surface font-medium">{user.username}</span>
                {user.is_admin && (
                  <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">ADMIN</span>
                )}
              </span>
            )}
          </div>
          <HeaderRefreshButton />
          <div className="order-2 ml-auto flex items-center gap-2 md:gap-3 xl:order-3 xl:ml-3">
            <UiVersionSwitcher />
            <ThemeToggle />
            <button
              ref={passwordButtonRef}
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded px-2 text-xs text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="Change Password"
              title="Change Password"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="hidden lg:inline">Password</span>
            </button>
            <button
              onClick={logout}
              className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded px-2 text-xs text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
              aria-label="Sign out"
              title="Sign out"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 p-4 md:p-[var(--shell-main-padding)] md:pt-2 overflow-hidden relative">
          <div className="h-full w-full bg-surface-container-lowest border border-outline-variant rounded overflow-hidden relative">
            <div className="h-full w-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 md:p-8 relative z-10">
              {isAdminPath(pathname) ? <AdminGuard>{children}</AdminGuard> : children}
            </div>
          </div>
        </main>
      </div>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto p-6"
          initialFocus={currentPasswordRef}
          finalFocus={passwordButtonRef}
        >
          <DialogHeader className="pr-12">
            <DialogTitle id="password-dialog-title" className="text-xl font-bold">
              Change Password
            </DialogTitle>
            <DialogDescription>
              Use at least 12 characters for the new password.
            </DialogDescription>
          </DialogHeader>

          {passError && <div id="password-error" role="alert" className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">{passError}</div>}
          {passSuccess && <div role="status" className="rounded border border-primary/20 bg-primary/10 p-3 text-sm text-primary">Password updated successfully!</div>}

          <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-xs font-medium text-on-surface-variant mb-1">Current Password</label>
                <input
                  ref={currentPasswordRef}
                  id="current-password"
                  type="password"
                  value={passwords.current}
                  onChange={e => setPasswords({...passwords, current: e.target.value})}
                  className="w-full bg-surface-container-high border border-outline-variant rounded px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                  required
                  aria-invalid={!!passError}
                  aria-describedby={passError ? "password-error" : undefined}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="new-password" className="block text-xs font-medium text-on-surface-variant mb-1">New Password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={passwords.new}
                    onChange={e => setPasswords({...passwords, new: e.target.value})}
                    className="w-full bg-surface-container-high border border-outline-variant rounded px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                    required
                    minLength={12}
                    aria-invalid={!!passError}
                    aria-describedby={passError ? "password-error" : undefined}
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-medium text-on-surface-variant mb-1">Confirm New</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={passwords.confirm}
                    onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                    className="w-full bg-surface-container-high border border-outline-variant rounded px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                    required
                    minLength={12}
                    aria-invalid={!!passError}
                    aria-describedby={passError ? "password-error" : undefined}
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || passSuccess}
                  className="bg-primary hover:bg-primary-hover text-on-primary px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Updating..." : "Update Password"}
                </button>
              </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
