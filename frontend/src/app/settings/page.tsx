"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { useAuth } from "@/components/AuthProvider";
import { useTheme, PRESET_OPTIONS } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  Server,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Sliders,
  Lock,
  Cpu,
  Layers,
  Users,
  Archive,
  Bookmark,
  ArrowUpRight,
  Palette,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function SettingsPage() {
  const { user: me } = useAuth();
  const {
    themePreset,
    colorMode,
    isSaving: isThemeSaving,
    saveError: themeSaveError,
    setThemePreference,
  } = useTheme();

  const [formData, setFormData] = useState({
    host: "",
    port: "830",
    user: "",
    password: "",
  });

  const [initialData, setInitialData] = useState({
    host: "",
    port: "830",
    user: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | ""; text: string }>({
    type: "",
    text: "",
  });

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await authFetch(`/api/proxy/settings/device?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        let loaded = {
          host: "",
          port: "830",
          user: "",
          password: "",
        };

        // Handle format: { success: true, config: { host, user, port } }
        if (data.success && data.config) {
          loaded = {
            host: data.config.host || "",
            port: String(data.config.port || "830"),
            user: data.config.user || "",
            password: "", // password not returned in cleartext from backend
          };
        }
        // Handle flat format: { host, user, port }
        else if (data.host || data.user) {
          loaded = {
            host: data.host || "",
            port: String(data.port || "830"),
            user: data.user || "",
            password: "",
          };
        }

        setFormData(loaded);
        setInitialData(loaded);
      } else {
        setMessage({ type: "error", text: `Failed to load settings (HTTP ${res.status}).` });
      }
    } catch (error) {
      console.error("Failed to fetch settings", error);
      setMessage({ type: "error", text: "Failed to load device settings." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me && isAdmin(me)) {
      fetchSettings();
    } else {
      setIsLoading(false);
    }
  }, [me, fetchSettings]);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (message.type === "success" && message.text) {
      const timer = window.setTimeout(() => {
        setMessage({ type: "", text: "" });
      }, 5000);
      return () => window.clearTimeout(timer);
    }
  }, [message]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    setFormData(initialData);
    setMessage({ type: "", text: "" });
  };

  const isDirty = useMemo(() => {
    return (
      formData.host !== initialData.host ||
      formData.port !== initialData.port ||
      formData.user !== initialData.user ||
      formData.password !== ""
    );
  }, [formData, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await authFetch("/api/proxy/settings/device", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok && (data.success || data.message)) {
        setMessage({
          type: "success",
          text: data.message || "Device settings updated successfully!",
        });
        setInitialData({
          ...formData,
          password: "",
        });
        setFormData((prev) => ({
          ...prev,
          password: "",
        }));
      } else {
        // Backend returns { error: "..." } for failures with detail/message fallbacks
        const msg = data.error || data.detail || data.message || "Failed to update settings";
        setMessage({ type: "error", text: msg });
      }
    } catch (error) {
      console.error("Error saving settings", error);
      setMessage({ type: "error", text: "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="max-w-5xl space-y-6 pb-8">
      {/* Appearance Settings Card (Self-Service) */}
      <Card className="border-outline-variant bg-surface-container-low">
        <CardHeader>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <span className="h-px w-5 bg-primary" aria-hidden="true" />
            Personal Preferences
          </div>
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <Palette className="size-5 text-primary" aria-hidden="true" />
            Appearance
          </CardTitle>
          <CardDescription className="text-on-surface-variant">
            Choose your preferred color theme preset and mode. Saved to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preset Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Theme Preset
            </label>
            <div
              role="radiogroup"
              aria-label="Theme Preset Selection"
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = themePreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isThemeSaving}
                    onClick={() => setThemePreference(opt.id, colorMode)}
                    className={cn(
                      "flex min-h-[44px] flex-col justify-between rounded border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                      isSelected
                        ? "border-primary bg-surface-container-high ring-1 ring-primary"
                        : "border-outline-variant bg-surface-container hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-on-surface">{opt.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-3.5 rounded-full border border-outline-variant"
                          style={{ backgroundColor: opt.accent }}
                          title="Accent preview"
                        />
                        <span
                          className="size-3.5 rounded-full border border-outline-variant"
                          style={{ backgroundColor: opt.darkBg }}
                          title="Dark background preview"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-on-surface-variant">{opt.description}</p>
                    <span className="mt-3 text-[11px] font-mono font-medium text-primary">
                      {isSelected ? "Selected" : "Select"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Color Mode
            </label>
            <div
              role="radiogroup"
              aria-label="Color Mode Selection"
              className="mt-3 flex max-w-xs rounded border border-outline-variant bg-surface-container p-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={colorMode === "dark"}
                disabled={isThemeSaving}
                onClick={() => setThemePreference(themePreset, "dark")}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  colorMode === "dark"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Moon className="size-4" aria-hidden="true" />
                Dark
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={colorMode === "light"}
                disabled={isThemeSaving}
                onClick={() => setThemePreference(themePreset, "light")}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  colorMode === "light"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Sun className="size-4" aria-hidden="true" />
                Light
              </button>
            </div>
          </div>

          {/* Feedback & Live Status */}
          <div aria-live="polite" className="text-xs">
            {isThemeSaving && (
              <span className="text-on-surface-variant animate-pulse">Saving appearance preferences…</span>
            )}
            {themeSaveError && (
              <span className="text-error font-medium">{themeSaveError}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {me && isAdmin(me) ? (
        <>
          {/* Page Header */}
      <header className="rounded border border-outline-variant bg-surface-container-low px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <span className="h-px w-5 bg-primary" aria-hidden="true" />
              Administration / System Configuration
            </div>
            <div>
              <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
                <Sliders className="size-8 shrink-0 text-primary" aria-hidden="true" />
                Device Settings
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
                Configure the Juniper MX204 NETCONF connection used by JupeTrack monitoring
                and telemetry collection.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <Badge
              variant="outline"
              className="border-outline-variant bg-surface-container-high px-2.5 py-1 font-mono text-[11px] text-on-surface-variant"
            >
              <span className="mr-1.5 font-semibold text-primary">NETCONF</span>
              SSH / {formData.port || "830"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSettings}
              disabled={isLoading || isSaving}
              className="h-8 gap-1.5 text-xs text-on-surface-variant hover:text-on-surface"
              aria-label="Reload device settings from server"
            >
              <RefreshCw
                className={cn("size-3.5", isLoading && "animate-spin")}
                aria-hidden="true"
              />
              <span>Reload</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Notice Banner */}
      {message.text && (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded border px-4 py-3 text-sm",
            message.type === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-error/30 bg-error/10 text-error"
          )}
          role={message.type === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <div className="flex items-start gap-2.5">
            {message.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
            )}
            <span className="font-medium leading-5">{message.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage({ type: "", text: "" })}
            className="shrink-0 rounded p-0.5 text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
            aria-label="Dismiss message"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Settings Form Card */}
        <Card className="border-outline-variant bg-surface-container-low">
          <CardHeader className="border-b border-outline-variant px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3.5">
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Server className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-on-surface">
                  NETCONF Connection Parameters
                </CardTitle>
                <CardDescription className="text-xs leading-5 text-on-surface-variant">
                  Credentials and transport endpoints for the Junos NETCONF XML-RPC daemon.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6">
            {isLoading ? (
              <div
                className="space-y-6"
                aria-busy="true"
                aria-label="Loading device settings"
                role="status"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="h-3.5 w-28 rounded bg-surface-container-high animate-pulse" />
                    <div className="h-10 w-full rounded bg-surface-container-high animate-pulse" />
                    <div className="h-3 w-40 rounded bg-surface-container-high/60 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3.5 w-24 rounded bg-surface-container-high animate-pulse" />
                    <div className="h-10 w-full rounded bg-surface-container-high animate-pulse" />
                    <div className="h-3 w-44 rounded bg-surface-container-high/60 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-36 rounded bg-surface-container-high animate-pulse" />
                  <div className="h-10 w-full rounded bg-surface-container-high animate-pulse" />
                  <div className="h-3 w-52 rounded bg-surface-container-high/60 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-32 rounded bg-surface-container-high animate-pulse" />
                  <div className="h-10 w-full rounded bg-surface-container-high animate-pulse" />
                  <div className="h-3 w-64 rounded bg-surface-container-high/60 animate-pulse" />
                </div>
                <div className="border-t border-outline-variant pt-5">
                  <div className="h-10 w-32 rounded bg-surface-container-high animate-pulse" />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <fieldset className="space-y-5">
                  <legend className="sr-only">
                    Juniper MX204 NETCONF connection parameters
                  </legend>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="settings-host"
                        className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                      >
                        Target Host <span className="text-primary" aria-hidden="true">*</span>
                      </label>
                      <Input
                        id="settings-host"
                        type="text"
                        name="host"
                        value={formData.host}
                        onChange={handleChange}
                        placeholder="e.g. 192.168.1.1"
                        required
                        autoComplete="off"
                        aria-describedby="settings-host-desc"
                        className="font-mono text-sm"
                      />
                      <p id="settings-host-desc" className="text-xs text-on-surface-variant">
                        IP address or resolvable FQDN of the Juniper edge router.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="settings-port"
                        className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                      >
                        NETCONF Port <span className="text-primary" aria-hidden="true">*</span>
                      </label>
                      <Input
                        id="settings-port"
                        type="number"
                        name="port"
                        min={1}
                        max={65535}
                        value={formData.port}
                        onChange={handleChange}
                        placeholder="830"
                        required
                        inputMode="numeric"
                        aria-describedby="settings-port-desc"
                        className="font-mono text-sm"
                      />
                      <p id="settings-port-desc" className="text-xs text-on-surface-variant">
                        Standard Junos NETCONF subsystem over SSH (default: 830).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="settings-user"
                      className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                    >
                      Management Username <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <Input
                      id="settings-user"
                      type="text"
                      name="user"
                      value={formData.user}
                      onChange={handleChange}
                      placeholder="admin"
                      required
                      autoComplete="username"
                      aria-describedby="settings-user-desc"
                      className="font-mono text-sm"
                    />
                    <p id="settings-user-desc" className="text-xs text-on-surface-variant">
                      Router user account with NETCONF XML-RPC operational permissions.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="settings-password"
                      className="block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface"
                    >
                      Management Password
                    </label>
                    <div className="relative">
                      <Input
                        id="settings-password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        aria-describedby="settings-password-desc"
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-controls="settings-password"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <p id="settings-password-desc" className="text-xs text-on-surface-variant">
                      Leave unchanged if you do not want to update the password.
                    </p>
                  </div>
                </fieldset>

                <div className="flex flex-col gap-4 border-t border-outline-variant pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="text-primary" aria-hidden="true">*</span>
                    <span>Required field</span>
                    {isDirty && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-primary/40 bg-primary/10 text-[10px] text-primary"
                      >
                        Unsaved changes
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    {isDirty && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        disabled={isSaving}
                        className="h-9 px-3 text-xs text-on-surface-variant hover:text-on-surface"
                      >
                        Discard
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className="h-9 gap-2 bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-4" aria-hidden="true" />
                          <span>Save Settings</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Sidebar Info Panels */}
        <aside
          className="space-y-4"
          aria-label="Connection telemetry and configuration notes"
        >
          {/* Profile Specs Card */}
          <Card className="border-outline-variant bg-surface-container-low">
            <CardHeader className="border-b border-outline-variant px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                <Cpu className="size-3.5" aria-hidden="true" />
                Profile Specs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4 text-xs">
              <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2">
                <span className="text-on-surface-variant">Transport</span>
                <span className="font-mono font-medium text-on-surface">SSHv2</span>
              </div>
              <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2">
                <span className="text-on-surface-variant">Subsystem</span>
                <span className="font-mono font-medium text-on-surface">netconf (RFC 6242)</span>
              </div>
              <div className="flex items-center justify-between border-b border-outline-variant/50 pb-2">
                <span className="text-on-surface-variant">Target Device</span>
                <span className="font-mono font-medium text-primary">Juniper MX204</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">Session Model</span>
                <span className="font-mono font-medium text-on-surface">Mutex-Locked</span>
              </div>
            </CardContent>
          </Card>

          {/* Security & Storage Card */}
          <Card className="border-outline-variant bg-surface-container-low">
            <CardHeader className="border-b border-outline-variant px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                <Lock className="size-3.5" aria-hidden="true" />
                Security & RBAC
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4 text-xs leading-5 text-on-surface-variant">
              <p>
                Configuration access requires administrator privileges (
                <code className="font-mono text-primary">is_admin: true</code>).
              </p>
              <p>
                Credentials persist locally in{" "}
                <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-[11px] text-on-surface">
                  data/device_config.json
                </code>{" "}
                with owner-only (0600) file permissions.
              </p>
            </CardContent>
          </Card>

          {/* Related Modules Navigation */}
          <Card className="border-outline-variant bg-surface-container-low">
            <CardHeader className="border-b border-outline-variant px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-on-surface">
                <Layers className="size-3.5 text-primary" aria-hidden="true" />
                Admin Modules
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 text-xs">
              <nav className="space-y-1" aria-label="Related administration modules">
                <Link
                  href="/settings/users"
                  className="flex items-center justify-between rounded px-3 py-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="flex items-center gap-2">
                    <Users className="size-3.5 text-on-surface-variant" aria-hidden="true" />
                    User Management
                  </span>
                  <ArrowUpRight className="size-3 opacity-60" aria-hidden="true" />
                </Link>
                <Link
                  href="/settings/retention"
                  className="flex items-center justify-between rounded px-3 py-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="flex items-center gap-2">
                    <Archive className="size-3.5 text-on-surface-variant" aria-hidden="true" />
                    Data Retention
                  </span>
                  <ArrowUpRight className="size-3 opacity-60" aria-hidden="true" />
                </Link>
                <Link
                  href="/settings/as-mapping"
                  className="flex items-center justify-between rounded px-3 py-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="flex items-center gap-2">
                    <Bookmark className="size-3.5 text-on-surface-variant" aria-hidden="true" />
                    AS Mappings
                  </span>
                  <ArrowUpRight className="size-3 opacity-60" aria-hidden="true" />
                </Link>
              </nav>
            </CardContent>
          </Card>
        </aside>
      </section>
        </>
      ) : null}
    </main>
  );
}
