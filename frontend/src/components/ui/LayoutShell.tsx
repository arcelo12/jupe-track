"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/ui/Sidebar";
import HeaderRefreshButton from "@/components/ui/HeaderRefreshButton";

const PUBLIC_PATHS = ["/login"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();

  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);
  const [passwords, setPasswords] = React.useState({ current: "", new: "", confirm: "" });
  const [passError, setPassError] = React.useState("");
  const [passSuccess, setPassSuccess] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isPublic = PUBLIC_PATHS.some(p => pathname?.startsWith(p));

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess(false);

    if (passwords.new !== passwords.confirm) {
      setPassError("New passwords do not match");
      return;
    }
    if (passwords.new.length < 8) {
      setPassError("Password must be at least 8 characters");
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
        const data = await res.json();
        throw new Error(data.detail || "Failed to change password");
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
        background: "#060b14",
        flexDirection: "column",
        gap: "1rem",
      }}>
        <div style={{
          width: 40, height: 40,
          border: "2px solid rgba(6,182,212,0.2)",
          borderTop: "2px solid rgb(6,182,212)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "#475569", fontSize: "0.85rem" }}>Restoring session...</p>
      </div>
    );
  }

  // Authenticated app shell
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64 overflow-hidden h-screen">
        <header className="h-16 flex items-center justify-between px-8 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl z-20">
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-xs text-slate-400">
                Signed in as <span className="text-slate-200 font-medium">{user.username}</span>
                {user.is_admin && (
                  <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">ADMIN</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <HeaderRefreshButton />
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors px-2 py-1.5 rounded-md hover:bg-emerald-500/10"
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
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors px-2 py-1.5 rounded-md hover:bg-rose-500/10"
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
        <main className="flex-1 p-8 overflow-y-auto relative">
          {children}
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
            
            {passError && <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{passError}</div>}
            {passSuccess && <div className="p-3 mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">Password updated successfully!</div>}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={e => setPasswords({...passwords, current: e.target.value})}
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 text-white"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">New Password</label>
                  <input
                    type="password"
                    value={passwords.new}
                    onChange={e => setPasswords({...passwords, new: e.target.value})}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 text-white"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Confirm New</label>
                  <input
                    type="password"
                    value={passwords.confirm}
                    onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 text-white"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || passSuccess}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
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
