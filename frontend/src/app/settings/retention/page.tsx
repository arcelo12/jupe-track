"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Network,
  RefreshCw,
  Save,
  Search,
  Sliders,
  XCircle,
} from "lucide-react";
import { authFetch } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

interface RetentionSettings {
  retention_days_interface: number;
  retention_days_bgp: number;
  scrape_interval_seconds: number;
  scrape_enabled: boolean;
  enable_bgp: boolean;
  enable_interfaces: boolean;
  scrape_interface_targets: string;
  scrape_bgp_targets: string;
}

interface ScraperStatus {
  enabled: boolean;
  last_scrape_interface: string | null;
  last_scrape_bgp: string | null;
  next_run: string | null;
  total_interface_records: number;
  total_bgp_records: number;
}

const DEFAULT_SETTINGS: RetentionSettings = {
  retention_days_interface: 30,
  retention_days_bgp: 30,
  scrape_interval_seconds: 60,
  scrape_enabled: true,
  enable_bgp: true,
  enable_interfaces: true,
  scrape_interface_targets: "",
  scrape_bgp_targets: "",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Never" : d.toLocaleString();
}

function parseTargets(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
  describedBy,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  describedBy: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-medium text-on-surface select-none"
        >
          {label}
        </label>
        <p id={describedBy} className="mt-0.5 text-xs text-on-surface-variant">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
          checked
            ? "border-primary bg-primary"
            : "border-outline-variant bg-surface-container-highest"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none block size-4 rounded-full transition-transform",
            checked
              ? "translate-x-5.5 bg-on-primary"
              : "translate-x-1 bg-on-surface-variant"
          )}
        />
      </button>
    </div>
  );
}

function SliderField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hint: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-on-surface">
          {label}
        </label>
        <output
          htmlFor={id}
          className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary"
          aria-live="polite"
        >
          {value} {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={`${id}-hint`}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary) ${pct}%, var(--color-surface-container-high) ${pct}%)`,
        }}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded bg-surface-container-high accent-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-on-primary [&::-webkit-slider-thumb]:bg-primary"
      />
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between font-mono text-[11px] text-on-surface-variant"
      >
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-on-surface-variant">
        {hint}
      </p>
    </div>
  );
}

function TargetSelect({
  id,
  title,
  description,
  options,
  selected,
  emptyHint,
  onToggle,
  onClear,
}: {
  id: string;
  title: string;
  description: string;
  options: string[];
  selected: Set<string>;
  emptyHint: string;
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const selectedCount = selected.size;

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 id={`${id}-heading`} className="text-sm font-medium text-on-surface">
            {title}
          </h4>
          <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
        </div>
        <span
          role="status"
          className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-primary"
        >
          {selectedCount === 0 ? "All selected" : `${selectedCount} selected`}
        </span>
      </div>

      {options.length > 6 && (
        <div className="relative mt-2.5">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-on-surface-variant"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${title.toLowerCase()}…`}
            aria-label={`Filter ${title}`}
            className="h-8 w-full rounded border border-outline-variant bg-surface-container-lowest pr-3 pl-8 font-mono text-xs text-on-surface placeholder:text-on-surface-variant focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      )}

      <fieldset className="mt-3">
        <legend className="sr-only">{title}</legend>
        <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded border border-outline-variant bg-surface-container p-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {options.length === 0 && (
            <p className="col-span-full p-2 text-xs text-on-surface-variant">{emptyHint}</p>
          )}
          {options.length > 0 && filtered.length === 0 && (
            <p className="col-span-full p-2 text-xs text-on-surface-variant">
              No matches found for &ldquo;{query}&rdquo;.
            </p>
          )}
          {filtered.map((opt) => {
            const active = selected.has(opt);
            return (
              <label
                key={opt}
                htmlFor={`${id}-opt-${opt}`}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors focus-within:outline-2 focus-within:outline-primary",
                  active
                    ? "border-primary/40 bg-primary/10 text-on-surface"
                    : "border-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                )}
              >
                <input
                  id={`${id}-opt-${opt}`}
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(opt)}
                  className="size-3.5 shrink-0 cursor-pointer accent-primary"
                />
                <span className="truncate font-mono">{opt}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
        <span>
          {filtered.length} of {options.length} visible
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-on-surface-variant underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Clear selection (scrape all)
        </button>
      </div>
    </section>
  );
}

export default function RetentionPage() {
  const { user: me } = useAuth();
  const [settings, setSettings] = useState<RetentionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>([]);
  const [availablePeers, setAvailablePeers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const fetchData = useCallback(async () => {
    try {
      const [retRes, statusRes, ifaceRes, peerRes] = await Promise.all([
        authFetch("/api/proxy/metrics/retention"),
        authFetch("/api/proxy/metrics/status"),
        authFetch("/api/proxy/metrics/interfaces/names"),
        authFetch("/api/proxy/metrics/bgp/peers"),
      ]);
      if (retRes.ok) {
        setSettings({ ...DEFAULT_SETTINGS, ...(await retRes.json()) });
        setLoadError(null);
      } else {
        setLoadError(`Failed to load retention settings (HTTP ${retRes.status}).`);
      }
      if (statusRes.ok) setStatus(await statusRes.json());
      if (ifaceRes.ok) {
        const names: string[] = await ifaceRes.json();
        setAvailableInterfaces(names.filter((n) => !n.includes(".")));
      }
      if (peerRes.ok) setAvailablePeers(await peerRes.json());
    } catch (e) {
      console.error("Failed to fetch retention data", e);
      setLoadError("Failed to load retention settings. Check connection and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 15000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/proxy/metrics/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("success", "Settings saved and scraper rescheduled!");
      await fetchData();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [fetchData, settings, showToast]);

  const handleTargetToggle = useCallback((type: "interfaces" | "bgp", itemName: string) => {
    setSettings((s) => {
      const field = type === "interfaces" ? "scrape_interface_targets" : "scrape_bgp_targets";
      const current = parseTargets(s[field]);
      const next = current.includes(itemName)
        ? current.filter((t) => t !== itemName)
        : [...current, itemName];
      return { ...s, [field]: next.join(",") };
    });
  }, []);

  const selectedInterfaces = useMemo(
    () => new Set(parseTargets(settings.scrape_interface_targets)),
    [settings.scrape_interface_targets]
  );
  const selectedPeers = useMemo(
    () => new Set(parseTargets(settings.scrape_bgp_targets)),
    [settings.scrape_bgp_targets]
  );

  if (me && !isAdmin(me)) {
    return null; // AdminGuard in LayoutShell covers this; safety net
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading retention settings">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Admin / data lifecycle
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
            Data Retention
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Configure metric retention horizons and background poller cadence.
          </p>
        </div>
        <div className="grid animate-pulse grid-cols-2 gap-3 md:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded border border-outline-variant bg-surface-container-low"
            />
          ))}
        </div>
        <p role="status" className="text-sm text-on-surface-variant">
          Loading retention settings…
        </p>
      </div>
    );
  }

  const statusCards = status
    ? [
        {
          label: "Interface Records",
          val: status.total_interface_records.toLocaleString(),
          icon: Database,
        },
        {
          label: "BGP Records",
          val: status.total_bgp_records.toLocaleString(),
          icon: Network,
        },
        {
          label: "Next Scrape",
          val: formatDate(status.next_run),
          icon: Clock,
        },
        {
          label: "Last Interface Scrape",
          val: formatDate(status.last_scrape_interface),
          icon: Activity,
        },
        {
          label: "Last BGP Scrape",
          val: formatDate(status.last_scrape_bgp),
          icon: Activity,
        },
        {
          label: "Collector Daemon",
          val: status.enabled ? "Running" : "Paused",
          icon: HardDrive,
        },
      ]
    : [];

  return (
    <div className="min-w-0 space-y-5">
      <div aria-live="polite">
        {toast && (
          <div
            role={toast.type === "error" ? "alert" : "status"}
            className={cn(
              "flex items-center gap-2 rounded border px-4 py-3 text-sm font-medium",
              toast.type === "success"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-error/30 bg-error/10 text-error"
            )}
          >
            {toast.type === "success" ? (
              <CheckCircle2 aria-hidden="true" size={17} />
            ) : (
              <XCircle aria-hidden="true" size={17} />
            )}
            <span className="min-w-0 flex-1">{toast.msg}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="rounded p-1 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-primary"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Admin / data lifecycle
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
            Data Retention
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Configure metric retention horizons, background poller cadence, and targeted collections.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex w-fit items-center gap-2 rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RefreshCw aria-hidden="true" size={14} /> Refresh status
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <span className="flex min-w-0 items-center gap-2">
            <XCircle aria-hidden="true" size={17} />
            {loadError}
          </span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="rounded border border-error/30 px-3 py-1.5 text-xs font-semibold hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-error"
          >
            Retry
          </button>
        </div>
      )}

      {/* Scraper Telemetry Status Overview */}
      <section
        aria-labelledby="scraper-status-heading"
        className="overflow-hidden rounded border border-outline-variant bg-surface-container-low"
      >
        <div className="border-b border-outline-variant bg-surface-container px-5 py-4">
          <h2
            id="scraper-status-heading"
            className="flex items-center gap-2 text-base font-semibold text-on-surface"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                status?.enabled ? "bg-primary animate-pulse" : "bg-error"
              )}
            />
            Background Scraper Telemetry
          </h2>
        </div>
        <div className="p-5">
          {status ? (
            <dl className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-3">
              {statusCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded border border-outline-variant bg-surface-container px-4 py-3"
                >
                  <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                    <item.icon aria-hidden="true" size={13} className="text-primary" />
                    {item.label}
                  </dt>
                  <dd
                    className="mt-1 truncate font-mono text-sm font-semibold text-on-surface"
                    title={item.val}
                  >
                    {item.val}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Scraper status unavailable. It will populate once the collector daemon reports.
            </p>
          )}
        </div>
      </section>

      {/* Retention and Scraper Configuration Form */}
      <section
        aria-labelledby="retention-settings-heading"
        className="overflow-hidden rounded border border-outline-variant bg-surface-container-low"
      >
        <div className="border-b border-outline-variant bg-surface-container px-5 py-4">
          <h2
            id="retention-settings-heading"
            className="flex items-center gap-2 text-base font-semibold text-on-surface"
          >
            <Archive aria-hidden="true" size={17} className="text-primary" /> Retention &amp; Cadence Settings
          </h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Changes apply immediately on save and reschedule the background collector.
          </p>
        </div>

        <div className="space-y-6 p-5">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
              Poller Daemon Controls
            </h3>
            <Toggle
              id="toggle-background-scraping"
              label="Enable background scraping"
              description="Keep collecting telemetry even when no browser tabs are connected."
              checked={settings.scrape_enabled}
              describedBy="scrape-enabled-desc"
              onChange={(v) => setSettings((s) => ({ ...s, scrape_enabled: v }))}
            />
            <hr className="border-outline-variant" />
            <Toggle
              id="toggle-interface-scraping"
              label="Enable interface scraping"
              description="Collect and store interface traffic and operational status metrics."
              checked={settings.enable_interfaces}
              describedBy="iface-enabled-desc"
              onChange={(v) => setSettings((s) => ({ ...s, enable_interfaces: v }))}
            />
            <Toggle
              id="toggle-bgp-scraping"
              label="Enable BGP scraping"
              description="Collect and store BGP peer state, rib-in/out, and prefix telemetry."
              checked={settings.enable_bgp}
              describedBy="bgp-enabled-desc"
              onChange={(v) => setSettings((s) => ({ ...s, enable_bgp: v }))}
            />
          </div>

          <hr className="border-outline-variant" />

          <div className="space-y-5">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
              <Sliders aria-hidden="true" size={13} /> Intervals &amp; Retention Horizons
            </h3>
            <SliderField
              id="scrape-interval"
              label="Scrape interval"
              value={settings.scrape_interval_seconds}
              min={10}
              max={600}
              step={10}
              unit="seconds"
              hint="How frequently the poller queries the device. Shorter intervals increase device CPU."
              onChange={(v) => setSettings((s) => ({ ...s, scrape_interval_seconds: v }))}
            />
            <SliderField
              id="retention-iface"
              label="Interface data retention"
              value={settings.retention_days_interface}
              min={1}
              max={365}
              unit="days"
              hint="Interface metric samples older than this horizon are purged by VictoriaMetrics."
              onChange={(v) => setSettings((s) => ({ ...s, retention_days_interface: v }))}
            />
            <SliderField
              id="retention-bgp"
              label="BGP data retention"
              value={settings.retention_days_bgp}
              min={1}
              max={365}
              unit="days"
              hint="BGP metric samples older than this horizon are purged by VictoriaMetrics."
              onChange={(v) => setSettings((s) => ({ ...s, retention_days_bgp: v }))}
            />
          </div>

          <hr className="border-outline-variant" />

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
              Targeted Telemetry Collections
            </h3>
            <p className="mt-1 text-xs text-on-surface-variant">
              Select specific items to target. Leaving a category unselected polls all items by default.
            </p>
            <TargetSelect
              id="target-interfaces"
              title="Target interfaces"
              description="Physical network interfaces to collect telemetry for."
              options={availableInterfaces}
              selected={selectedInterfaces}
              emptyHint="Waiting for first scrape discovery to list interfaces…"
              onToggle={(n) => handleTargetToggle("interfaces", n)}
              onClear={() => setSettings((s) => ({ ...s, scrape_interface_targets: "" }))}
            />
            <TargetSelect
              id="target-bgp"
              title="Target BGP peers"
              description="BGP peer IP addresses to collect telemetry for."
              options={availablePeers}
              selected={selectedPeers}
              emptyHint="Waiting for first scrape discovery to list BGP peers…"
              onToggle={(n) => handleTargetToggle("bgp", n)}
              onClear={() => setSettings((s) => ({ ...s, scrape_bgp_targets: "" }))}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant bg-surface-container px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-on-surface-variant">
            Saving updates scraper intervals and reschedules background collection jobs.
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <RefreshCw aria-hidden="true" size={15} className="animate-spin" />
            ) : (
              <Save aria-hidden="true" size={15} />
            )}
            {saving ? "Saving…" : "Save & Apply Settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
