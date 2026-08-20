"use client";

import React, { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { useAuth } from "@/components/AuthProvider";
import { ShieldCheck, UserPlus, RefreshCw, Power } from "lucide-react";

interface UserRow {
  id: number;
  username: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", is_admin: false });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/proxy/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (me && !isAdmin(me)) {
    return null; // AdminGuard in LayoutShell covers this; safety net
  }

  const updateUser = async (id: number, patch: Record<string, unknown>) => {
    setError(null);
    const res = await authFetch(`/api/proxy/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Update failed");
    }
    await load();
  };

  const toggleAdmin = async (u: UserRow) => {
    try {
      await updateUser(u.id, { is_admin: !u.is_admin });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const resetPassword = async (u: UserRow) => {
    const newPass = window.prompt(`New password for ${u.username} (min 12 chars):`);
    if (!newPass) return;
    try {
      await updateUser(u.id, { password: newPass });
      setNotice(`Password updated for ${u.username}`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await authFetch("/api/proxy/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim() || undefined,
          password: form.password,
          is_admin: form.is_admin,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Create failed");
      }
      setShowCreate(false);
      setForm({ username: "", email: "", password: "", is_admin: false });
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleString() : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-surface">User Management</h1>
          <p className="text-sm text-on-surface-variant">
            RBAC: viewers see monitoring pages only; admin-only settings stay hidden.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { load(); setNotice(null); }}
            className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-primary/10"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-on-primary bg-primary hover:bg-primary-hover px-3 py-1.5 rounded transition-colors"
          >
            <UserPlus size={14} /> New User
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded bg-primary/10 border border-primary/30 text-primary text-sm">
          {notice}
        </div>
      )}

      {showCreate && (
        <form onSubmit={createUser} className="glass-panel space-y-4">
          <h2 className="text-sm font-bold text-on-surface">Create user</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Username *</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                className="w-full bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                required
                maxLength={64}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Password * (min 12)</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-on-surface"
                required
                minLength={12}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_admin}
                  onChange={e => setForm({ ...form, is_admin: e.target.checked })}
                  className="accent-primary"
                />
                Admin role
              </label>
            </div>
          </div>
          {createError && <p className="text-sm text-error">{createError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs text-on-surface-variant hover:text-on-surface px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1.5 text-xs font-semibold text-on-primary bg-primary hover:bg-primary-hover px-3 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      )}

      <div className="glass-panel overflow-x-auto">
        {loading ? (
          <p className="text-sm text-on-surface-variant p-2">Loading users...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-on-surface-variant border-b border-[#2A2E35]">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last login</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = me?.username === u.username;
                return (
                  <tr key={u.id} className="border-b border-[#2A2E35]/50 last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-on-surface">{u.username}</div>
                      <div className="text-xs text-on-surface-variant">{u.email || "—"}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {u.is_admin ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded">
                          <ShieldCheck size={12} /> Admin
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">Viewer</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${u.is_active ? "text-primary" : "text-error"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-primary" : "bg-error"}`} />
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-on-surface-variant">{fmtDate(u.last_login)}</td>
                    <td className="py-2.5 pr-3 text-xs text-on-surface-variant">{fmtDate(u.created_at)}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => toggleAdmin(u)}
                        disabled={isSelf}
                        title={isSelf ? "Cannot change your own role" : u.is_admin ? "Demote to viewer" : "Promote to admin"}
                        className="text-xs text-on-surface-variant hover:text-primary px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {u.is_admin ? "Demote" : "Promote"}
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={isSelf}
                        title={isSelf ? "Cannot disable yourself" : u.is_active ? "Disable account" : "Enable account"}
                        className="text-xs text-on-surface-variant hover:text-primary px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {u.is_active ? <Power size={13} className="inline mr-0.5" /> : "Enable"}
                      </button>
                      <button
                        onClick={() => resetPassword(u)}
                        title="Reset password"
                        className="text-xs text-on-surface-variant hover:text-primary px-2 py-1 rounded"
                      >
                        Reset pwd
                      </button>
                      {isSelf && <span className="text-[10px] text-on-surface-variant ml-1">(you)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}