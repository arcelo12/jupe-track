"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/ui/Sidebar";
import HeaderRefreshButton from "@/components/ui/HeaderRefreshButton";
import AdminGuard from "@/components/ui/AdminGuard";
import { isAdminPath } from "@/lib/rbac";
import { ThemeToggle } from "@/components/ThemeToggle";

const PUBLIC_PATHS = ["/login"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();

  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);
  const [passwords, setPasswords] = React.useState({ current: "", new: "", confirm: "" });
  const [passError, setPassError] = React.useState("");
  const [passSuccess, setPassSuccess] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

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
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background)",
        flexDirection: "column",
        gap: "1rem",
      }}>
        <div style={{
          width: 40, height: 40,
          border: "2px solid color-mix(in oklab, var(--color-primary) 25%, transparent)",
          borderTop: "2px solid var(--color-primary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "var(--color-on-surface-variant)", fontSize: "0.85rem" }}>Restoring session...</p>
      </div>
    );
  }

  // Authenticated app shell
  return (
    <div className="flex w-full min-h-screen">
      <Sidebar 
        isCollapsed={isCollapsed} 
        setIsCollapsed={handleSetCollapsed} 
        isMobileOpen={isMobileOpen} 
        setIsMobileOpen={setIsMobileOpen} 
      />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 overflow-hidden h-screen ${
        isCollapsed ? 'md:pl-28' : 'md:pl-[280px]'
      } pl-0`}>
        <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-[#2A2E35] bg-transparent z-20">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="md:hidden text-on-surface-variant hover:text-on-surface p-1.5 mr-1 bg-white/5 rounded-lg"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <div className="flex items-center gap-2 md:gap-3">
            <HeaderRefreshButton />
            <ThemeToggle />
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-primary/10"
              title="Change Password"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Password
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-error transition-colors px-2 py-1.5 rounded-md hover:bg-error/10"
              title="Sign out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 md:pt-2 overflow-hidden relative">
          <div className="h-full w-full bg-surface-container-lowest/30 border border-[#2A2E35] rounded overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen transform translate-x-1/3 -translate-y-1/3" />
            <div className="h-full w-full overflow-y-auto p-4 md:p-8 relative z-10">
              {isAdminPath(pathname) ? <AdminGuard>{children}</AdminGuard> : children}
            </div>
          </div>
        </main>
      </div>

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 animate-slide-up relative">
            <button
              onClick={() => setIsPasswordModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            
            <h2 className="text-xl font-bold mb-4">Change Password</h2>
            
            {passError && <div className="p-3 mb-4 rounded-lg bg-error/10 border border-error/20 text-error text-sm">{passError}</div>}
            {passSuccess && <div className="p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm">Password updated successfully!</div>}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={e => setPasswords({...passwords, current: e.target.value})}
                  className="w-full bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">New Password</label>
                  <input
                    type="password"
                    value={passwords.new}
                    onChange={e => setPasswords({...passwords, new: e.target.value})}
                    className="w-full bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                    required
                    minLength={12}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Confirm New</label>
                  <input
                    type="password"
                    value={passwords.confirm}
                    onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                    className="w-full bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                    required
                    minLength={12}
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
          </div>
        </div>
      )}
    </div>
  );
}
