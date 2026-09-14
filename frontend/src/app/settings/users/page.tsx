"use client";

import React, { useEffect, useState, useCallback, useMemo, useId } from "react";
import { authFetch } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Shield,
  UserPlus,
  RefreshCw,
  Power,
  KeyRound,
  Users,
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  User,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  const newUsernameId = useId();
  const newEmailId = useId();
  const newPasswordId = useId();
  const newAdminId = useId();
  const searchInputId = useId();
  const resetPasswordInputId = useId();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "VIEWER">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", is_admin: false });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset password dialog state
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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

  // Notice auto-dismiss
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
      setNotice(`${u.username} role updated to ${!u.is_admin ? "Administrator" : "Viewer"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      setNotice(`${u.username} account ${!u.is_active ? "enabled" : "disabled"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const resetPassword = async (u: UserRow, directPassword?: string) => {
    if (typeof directPassword === "string") {
      try {
        await updateUser(u.id, { password: directPassword });
        setNotice(`Password updated for ${u.username}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      }
      return;
    }
    setResetTarget(u);
    setResetPass("");
    setResetError(null);
    setShowResetPassword(false);
  };
  const openResetPasswordModal = resetPassword;

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPass.length < 12) {
      setResetError("Password must be at least 12 characters long");
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      await updateUser(resetTarget.id, { password: resetPass });
      setNotice(`Password updated for ${resetTarget.username}`);
      setResetTarget(null);
      setResetPass("");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setResetting(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (form.password.length < 12) {
      setCreateError("Password must be at least 12 characters long");
      return;
    }
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
      setNotice("User created successfully");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  // Metrics summary
  const summary = useMemo(() => {
    let admins = 0;
    let active = 0;
    let disabled = 0;

    users.forEach((u) => {
      if (u.is_admin) admins++;
      if (u.is_active) active++;
      else disabled++;
    });

    return {
      total: users.length,
      admins,
      viewers: users.length - admins,
      active,
      disabled,
    };
  }, [users]);

  // Filtered list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q));

      const matchesRole =
        roleFilter === "ALL" ||
        (roleFilter === "ADMIN" && u.is_admin) ||
        (roleFilter === "VIEWER" && !u.is_admin);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && u.is_active) ||
        (statusFilter === "DISABLED" && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  if (me && !isAdmin(me)) {
    return null; // AdminGuard in LayoutShell covers this; safety net
  }

  const hasActiveFilters = searchQuery.trim() !== "" || roleFilter !== "ALL" || statusFilter !== "ALL";

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  };

  const fmtDate = (s: string | null) => {
    if (!s) return "Never";
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  return (
    <div className="relative min-w-0 space-y-6 pb-8">
      {/* Command Center Header */}
      <header className="relative overflow-hidden rounded border border-outline-variant bg-surface-container-low px-5 py-6 sm:px-8 sm:py-8">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <span className="h-px w-5 bg-primary" aria-hidden="true" />
              Administration / Access Control
            </div>
            <div>
              <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
                <Users className="text-primary" size={30} aria-hidden="true" />
                User Management
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
                Role-based access control. Viewers have read-only telemetry access; administrators
                configure credentials, system settings, and manage operator accounts.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                load();
                setNotice(null);
              }}
              disabled={loading}
              aria-label="Refresh user accounts"
              className="gap-1.5 text-on-surface-variant hover:text-primary"
            >
              <RefreshCw
                aria-hidden="true"
                size={14}
                className={cn(loading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowCreate((v) => !v);
                setCreateError(null);
              }}
              aria-expanded={showCreate}
              aria-controls="create-user-form"
              className="gap-1.5 font-semibold"
            >
              <UserPlus aria-hidden="true" size={14} />
              {showCreate ? "Close Form" : "New User"}
            </Button>
          </div>
        </div>
      </header>

      {/* Global Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <div className="flex items-center gap-2">
            <AlertCircle aria-hidden="true" size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="text-error hover:bg-error/20"
          >
            <X aria-hidden="true" size={12} />
          </Button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" size={16} className="shrink-0" />
            <span>{notice}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className="text-primary hover:bg-primary/20"
          >
            <X aria-hidden="true" size={12} />
          </Button>
        </div>
      )}

      {/* Stats Summary Strip (KPIs) */}
      <section
        aria-label="User account summary statistics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <button
          type="button"
          onClick={clearFilters}
          className={cn(
            "flex flex-col items-start rounded border p-3.5 text-left transition-colors",
            !hasActiveFilters
              ? "border-primary/50 bg-primary/10"
              : "border-outline-variant bg-surface-container-low hover:bg-surface-container"
          )}
        >
          <div className="flex w-full items-center justify-between text-xs text-on-surface-variant">
            <span className="font-semibold uppercase tracking-wider">Total Accounts</span>
            <Users size={14} className="text-primary" aria-hidden="true" />
          </div>
          <span className="mt-1 font-mono text-2xl font-bold text-on-surface">
            {summary.total}
          </span>
          <span className="mt-0.5 text-[11px] text-on-surface-variant">
            Registered operators
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setRoleFilter(roleFilter === "ADMIN" ? "ALL" : "ADMIN")
          }
          className={cn(
            "flex flex-col items-start rounded border p-3.5 text-left transition-colors",
            roleFilter === "ADMIN"
              ? "border-primary/50 bg-primary/10"
              : "border-outline-variant bg-surface-container-low hover:bg-surface-container"
          )}
        >
          <div className="flex w-full items-center justify-between text-xs text-on-surface-variant">
            <span className="font-semibold uppercase tracking-wider">Admins</span>
            <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
          </div>
          <span className="mt-1 font-mono text-2xl font-bold text-primary">
            {summary.admins}
          </span>
          <span className="mt-0.5 text-[11px] text-on-surface-variant">
            Full administrative access
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "ACTIVE" ? "ALL" : "ACTIVE")
          }
          className={cn(
            "flex flex-col items-start rounded border p-3.5 text-left transition-colors",
            statusFilter === "ACTIVE"
              ? "border-primary/50 bg-primary/10"
              : "border-outline-variant bg-surface-container-low hover:bg-surface-container"
          )}
        >
          <div className="flex w-full items-center justify-between text-xs text-on-surface-variant">
            <span className="font-semibold uppercase tracking-wider">Active</span>
            <CheckCircle2 size={14} className="text-primary" aria-hidden="true" />
          </div>
          <span className="mt-1 font-mono text-2xl font-bold text-on-surface">
            {summary.active}
          </span>
          <span className="mt-0.5 text-[11px] text-on-surface-variant">
            Authorized sign-ins
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === "DISABLED" ? "ALL" : "DISABLED")
          }
          className={cn(
            "flex flex-col items-start rounded border p-3.5 text-left transition-colors",
            statusFilter === "DISABLED"
              ? "border-primary/50 bg-primary/10"
              : "border-outline-variant bg-surface-container-low hover:bg-surface-container"
          )}
        >
          <div className="flex w-full items-center justify-between text-xs text-on-surface-variant">
            <span className="font-semibold uppercase tracking-wider">Disabled</span>
            <Power size={14} className="text-error" aria-hidden="true" />
          </div>
          <span className="mt-1 font-mono text-2xl font-bold text-error">
            {summary.disabled}
          </span>
          <span className="mt-0.5 text-[11px] text-on-surface-variant">
            Blocked from login
          </span>
        </button>
      </section>

      {/* Create User Card */}
      {showCreate && (
        <Card
          id="create-user-form"
          className="min-w-0 rounded border-outline-variant bg-surface-container-low shadow-none"
        >
          <CardHeader className="border-b border-outline-variant bg-surface-container px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-on-surface">
                  <UserPlus aria-hidden="true" size={16} className="text-primary" />
                  Create Operator Account
                </CardTitle>
                <CardDescription className="text-xs text-on-surface-variant">
                  Provision login credentials and administrative privileges for a new operator.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowCreate(false)}
                aria-label="Close user form"
                className="text-on-surface-variant hover:text-on-surface"
              >
                <X aria-hidden="true" size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 py-5">
            <form onSubmit={createUser} className="space-y-5">
              <fieldset
                disabled={creating}
                className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <legend className="sr-only">Account Credentials and Details</legend>

                {/* Username */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={newUsernameId}
                    className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                  >
                    Username <span className="text-primary">*</span>
                  </label>
                  <Input
                    id={newUsernameId}
                    type="text"
                    value={form.username}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, username: e.target.value })
                    }
                    required
                    maxLength={64}
                    placeholder="e.g. operator1"
                    autoComplete="off"
                    aria-describedby={`${newUsernameId}-hint`}
                  />
                  <p id={`${newUsernameId}-hint`} className="text-[11px] text-on-surface-variant">
                    1-64 characters, unique login identifier
                  </p>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={newEmailId}
                    className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                  >
                    Email <span className="text-xs font-normal text-on-surface-variant">(Optional)</span>
                  </label>
                  <Input
                    id={newEmailId}
                    type="email"
                    value={form.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="e.g. op@example.com"
                    autoComplete="off"
                    aria-describedby={`${newEmailId}-hint`}
                  />
                  <p id={`${newEmailId}-hint`} className="text-[11px] text-on-surface-variant">
                    Used for audit alerts and notifications
                  </p>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label
                    htmlFor={newPasswordId}
                    className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                  >
                    Password <span className="text-primary">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id={newPasswordId}
                      type={showCreatePassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      required
                      minLength={12}
                      placeholder="Minimum 12 characters"
                      autoComplete="new-password"
                      aria-describedby={`${newPasswordId}-hint`}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword((v) => !v)}
                      aria-label={showCreatePassword ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                    >
                      {showCreatePassword ? (
                        <EyeOff aria-hidden="true" size={15} />
                      ) : (
                        <Eye aria-hidden="true" size={15} />
                      )}
                    </button>
                  </div>
                  <p id={`${newPasswordId}-hint`} className="text-[11px] text-on-surface-variant">
                    {form.password.length > 0 ? (
                      <span className={cn(form.password.length >= 12 ? "text-primary font-medium" : "text-error")}>
                        {form.password.length}/12 characters minimum
                      </span>
                    ) : (
                      "Minimum 12 characters required"
                    )}
                  </p>
                </div>
              </fieldset>

              {/* Role Toggle Card */}
              <div className="rounded border border-outline-variant bg-surface-container p-3.5">
                <label
                  htmlFor={newAdminId}
                  className="flex cursor-pointer items-start gap-3 select-none"
                >
                  <input
                    id={newAdminId}
                    type="checkbox"
                    checked={form.is_admin}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, is_admin: e.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-outline-variant accent-primary cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-on-surface">
                      <ShieldCheck aria-hidden="true" size={14} className="text-primary" />
                      Grant Administrator Privileges
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Admins can modify device settings, AS mappings, scraper retention, and manage all operator credentials. Viewers have read-only telemetry visibility.
                    </p>
                  </div>
                </label>
              </div>

              {createError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error"
                >
                  <AlertCircle aria-hidden="true" size={15} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={creating}
                  onClick={() => setShowCreate(false)}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creating}
                  className="gap-1.5 font-semibold"
                >
                  {creating ? (
                    <>
                      <span
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-primary/20 border-t-on-primary"
                        aria-hidden="true"
                      />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <UserPlus aria-hidden="true" size={14} />
                      Create User
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Main Catalog Card with Search & Filters */}
      <Card className="min-w-0 rounded border-outline-variant bg-surface-container-low shadow-none py-0">
        <CardHeader className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-bold uppercase tracking-wider text-on-surface">
              Configured Accounts
            </CardTitle>
            <CardDescription className="text-xs text-on-surface-variant">
              {filteredUsers.length === users.length
                ? `${users.length} registered account${users.length === 1 ? "" : "s"}`
                : `Showing ${filteredUsers.length} of ${users.length} accounts`}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:w-60 sm:flex-initial">
              <label htmlFor={searchInputId} className="sr-only">
                Search user accounts
              </label>
              <Search
                aria-hidden="true"
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <Input
                id={searchInputId}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username or email..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container-high p-0.5 text-xs">
              <Filter aria-hidden="true" size={12} className="ml-1.5 mr-0.5 text-on-surface-variant" />
              <button
                type="button"
                onClick={() => setRoleFilter("ALL")}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  roleFilter === "ALL"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("ADMIN")}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  roleFilter === "ADMIN"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("VIEWER")}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  roleFilter === "VIEWER"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                Viewer
              </button>
            </div>

            {/* Clear filters button if filtered */}
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={clearFilters}
                className="text-xs text-on-surface-variant hover:text-on-surface"
              >
                Reset
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-on-surface-variant"
            >
              <RefreshCw
                aria-hidden="true"
                size={20}
                className="animate-spin text-primary"
              />
              <span>Loading user accounts...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-12 text-center text-on-surface-variant">
              <Users
                aria-hidden="true"
                size={36}
                className="mb-3 text-primary/40"
              />
              <p className="font-semibold text-on-surface">No user accounts found</p>
              <p className="mt-1 max-w-sm text-xs text-on-surface-variant">
                No users are currently registered in the database.
              </p>
              {!showCreate && (
                <Button
                  size="sm"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 gap-1.5"
                >
                  <UserPlus aria-hidden="true" size={14} /> Add First User
                </Button>
              )}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center text-on-surface-variant">
              <Search aria-hidden="true" size={28} className="mb-2 opacity-50" />
              <p className="text-sm font-medium text-on-surface">No matching accounts</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                No users matched your search criteria or role filters.
              </p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={clearFilters}
                className="mt-3 text-xs"
              >
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[760px]">
                <caption className="sr-only">
                  Registered JupeTrack operator accounts with roles, statuses, login records, and administrative actions
                </caption>
                <TableHeader className="bg-surface-container-high">
                  <TableRow className="border-outline-variant hover:bg-transparent">
                    <TableHead className="py-3 pl-5 pr-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Operator Account
                    </TableHead>
                    <TableHead className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Role
                    </TableHead>
                    <TableHead className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Status
                    </TableHead>
                    <TableHead className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Last Login
                    </TableHead>
                    <TableHead className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Account Created
                    </TableHead>
                    <TableHead className="py-3 pl-3 pr-5 text-right text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Administrative Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const isSelf = me?.username === u.username;
                    return (
                      <TableRow
                        key={u.id}
                        className="border-outline-variant hover:bg-surface-container-high/60 transition-colors"
                      >
                        {/* User identity */}
                        <TableCell className="py-3.5 pl-5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded bg-surface-container-highest text-primary">
                              <User aria-hidden="true" size={14} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-on-surface">
                                  {u.username}
                                </span>
                                {isSelf && (
                                  <Badge
                                    variant="outline"
                                    className="rounded border-primary/40 bg-primary/10 text-[10px] font-bold uppercase tracking-wider text-primary"
                                  >
                                    You
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-on-surface-variant truncate">
                                {u.email || "No email assigned"}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Role badge */}
                        <TableCell className="px-3 py-3.5">
                          {u.is_admin ? (
                            <Badge
                              variant="outline"
                              className="gap-1.5 rounded border-primary/40 bg-primary/10 font-semibold text-primary"
                            >
                              <ShieldCheck aria-hidden="true" size={12} />
                              Admin
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="gap-1.5 rounded border-outline-variant bg-surface-container text-on-surface-variant"
                            >
                              <Shield aria-hidden="true" size={12} />
                              Viewer
                            </Badge>
                          )}
                        </TableCell>

                        {/* Status indicator */}
                        <TableCell className="px-3 py-3.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1.5 rounded font-medium",
                              u.is_active
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-error/30 bg-error/10 text-error"
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                u.is_active ? "bg-primary" : "bg-error"
                              )}
                            />
                            {u.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>

                        {/* Last Login */}
                        <TableCell className="px-3 py-3.5 text-xs text-on-surface-variant">
                          <div className="flex items-center gap-1.5 font-mono">
                            <Clock aria-hidden="true" size={12} className="text-on-surface-variant/70 shrink-0" />
                            <span>{fmtDate(u.last_login)}</span>
                          </div>
                        </TableCell>

                        {/* Created At */}
                        <TableCell className="px-3 py-3.5 text-xs font-mono text-on-surface-variant">
                          {fmtDate(u.created_at)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3.5 pl-3 pr-5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {/* Role Toggle Button */}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => toggleAdmin(u)}
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? "Cannot change your own administrative role"
                                  : u.is_admin
                                  ? "Demote to viewer"
                                  : "Promote to administrator"
                              }
                              aria-label={
                                u.is_admin
                                  ? `Demote ${u.username} to viewer`
                                  : `Promote ${u.username} to administrator`
                              }
                              className={cn(
                                "text-on-surface-variant hover:text-primary hover:bg-primary/10 disabled:opacity-40",
                                u.is_admin && "hover:text-error hover:bg-error/10"
                              )}
                            >
                              <Shield aria-hidden="true" size={12} />
                              {u.is_admin ? "Demote" : "Promote"}
                            </Button>

                            {/* Status Toggle Button */}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => toggleActive(u)}
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? "Cannot disable your own account"
                                  : u.is_active
                                  ? "Disable account access"
                                  : "Enable account access"
                              }
                              aria-label={
                                u.is_active
                                  ? `Disable account ${u.username}`
                                  : `Enable account ${u.username}`
                              }
                              className={cn(
                                "text-on-surface-variant hover:text-primary hover:bg-primary/10 disabled:opacity-40",
                                u.is_active && "hover:text-error hover:bg-error/10"
                              )}
                            >
                              <Power aria-hidden="true" size={12} />
                              {u.is_active ? "Disable" : "Enable"}
                            </Button>

                            {/* Password Reset Button */}
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => openResetPasswordModal(u)}
                              title={`Reset password for ${u.username}`}
                              aria-label={`Reset password for ${u.username}`}
                              className="text-on-surface-variant hover:text-primary hover:bg-primary/10"
                            >
                              <KeyRound aria-hidden="true" size={12} />
                              Reset pwd
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accessible Reset Password Dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetPass("");
            setResetError(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded border-outline-variant bg-surface-container-low p-6 text-on-surface shadow-none">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold text-on-surface">
              <KeyRound aria-hidden="true" size={18} className="text-primary" />
              Reset Account Password
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Set a new security password for operator{" "}
              <strong className="text-on-surface">{resetTarget?.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPasswordSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor={resetPasswordInputId}
                className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
              >
                New Password <span className="text-primary">*</span>
              </label>
              <div className="relative">
                <Input
                  id={resetPasswordInputId}
                  type={showResetPassword ? "text" : "password"}
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                  required
                  minLength={12}
                  placeholder="Minimum 12 characters"
                  autoComplete="new-password"
                  aria-describedby={`${resetPasswordInputId}-hint`}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((v) => !v)}
                  aria-label={showResetPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  {showResetPassword ? (
                    <EyeOff aria-hidden="true" size={15} />
                  ) : (
                    <Eye aria-hidden="true" size={15} />
                  )}
                </button>
              </div>
              <p
                id={`${resetPasswordInputId}-hint`}
                className="text-[11px] text-on-surface-variant"
              >
                {resetPass.length > 0 ? (
                  <span
                    className={cn(
                      resetPass.length >= 12
                        ? "text-primary font-medium"
                        : "text-error"
                    )}
                  >
                    {resetPass.length}/12 characters minimum
                  </span>
                ) : (
                  "Minimum 12 characters required"
                )}
              </p>
            </div>

            {resetError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded border border-error/30 bg-error/10 px-3.5 py-2.5 text-xs text-error"
              >
                <AlertCircle aria-hidden="true" size={14} className="shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={resetting}
                onClick={() => {
                  setResetTarget(null);
                  setResetPass("");
                  setResetError(null);
                }}
                className="text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={resetting || resetPass.length < 12}
                className="gap-1.5 font-semibold"
              >
                {resetting ? (
                  <>
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-primary/20 border-t-on-primary"
                      aria-hidden="true"
                    />
                    Updating...
                  </>
                ) : (
                  <>
                    <KeyRound aria-hidden="true" size={14} />
                    Update Password
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
