"use client";

import React, { useState, useEffect, useCallback, useId, useMemo } from "react";
import { authFetch } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Network,
  Copy,
  Check,
  Globe,
  Shuffle,
  Building2,
  Layers,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface ASMapping {
  asn: string;
  name: string;
  type: string;
}

const CONNECTION_TYPES = [
  "Transit",
  "Peer",
  "IX",
  "Customer",
  "Internal",
] as const;

function getTypeBadgeClass(type: string): string {
  switch ((type || "").toLowerCase()) {
    case "transit":
      return "border-primary/50 bg-primary/10 text-primary";
    case "peer":
      return "border-outline text-on-surface bg-surface-container-high";
    case "ix":
      return "border-primary/30 bg-primary/5 text-primary";
    case "customer":
      return "border-outline-variant bg-surface-container text-on-surface-variant";
    case "internal":
      return "border-outline-variant bg-surface-container-highest text-on-surface-variant";
    default:
      return "border-outline-variant bg-surface-container text-on-surface-variant";
  }
}

export default function ASMappingSettings() {
  const { user: me } = useAuth();
  const asnInputId = useId();
  const nameInputId = useId();
  const typeSelectId = useId();
  const searchInputId = useId();

  const [mappings, setMappings] = useState<ASMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [copiedAsn, setCopiedAsn] = useState<string | null>(null);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingAsn, setEditingAsn] = useState<string | null>(null);
  const [formAsn, setFormAsn] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<string>("Transit");

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/proxy/as-mapping");
      if (!res.ok) {
        throw new Error(`Failed to load AS Mappings (HTTP ${res.status})`);
      }
      const data: ASMapping[] = await res.json();
      setMappings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AS Mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const resetForm = () => {
    setIsAdding(false);
    setEditingAsn(null);
    setFormAsn("");
    setFormName("");
    setFormType("Transit");
  };

  const startEdit = (m: ASMapping) => {
    setEditingAsn(m.asn);
    setIsAdding(true);
    setFormAsn(m.asn);
    setFormName(m.name);
    setFormType(m.type || "Transit");
    setError(null);
    setNotice(null);
  };

  const copyAsn = (asn: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(asn).catch(() => {});
      setCopiedAsn(asn);
      setTimeout(() => setCopiedAsn((prev) => (prev === asn ? null : prev)), 1800);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAsn = formAsn.trim().replace(/[^0-9]/g, "");
    const cleanName = formName.trim();

    if (!cleanAsn) {
      setError("Valid numeric ASN is required");
      return;
    }
    if (!cleanName) {
      setError("Organization name is required");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await authFetch("/api/proxy/as-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asn: cleanAsn,
          name: cleanName,
          type: formType,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || d.message || "Failed to save mapping");
      }

      setNotice(
        editingAsn
          ? `AS${cleanAsn} (${cleanName}) updated successfully.`
          : `AS${cleanAsn} (${cleanName}) created successfully.`
      );
      resetForm();
      await fetchMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asn: string, name: string) => {
    if (!window.confirm(`Delete mapping for AS${asn} (${name})?`)) {
      return;
    }
    setError(null);
    setNotice(null);

    try {
      const res = await authFetch(`/api/proxy/as-mapping/${encodeURIComponent(asn)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || d.message || "Failed to delete mapping");
      }
      setNotice(`AS${asn} mapping removed.`);
      await fetchMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mapping");
    }
  };

  // KPI telemetry counts
  const stats = useMemo(() => {
    const total = mappings.length;
    let transit = 0;
    let peerIx = 0;
    let customerInternal = 0;

    for (const m of mappings) {
      const t = (m.type || "").toLowerCase();
      if (t === "transit") {
        transit++;
      } else if (t === "peer" || t === "ix") {
        peerIx++;
      } else if (t === "customer" || t === "internal") {
        customerInternal++;
      }
    }

    return { total, transit, peerIx, customerInternal };
  }, [mappings]);

  const filteredMappings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return mappings.filter((m) => {
      const matchesSearch =
        !q ||
        m.asn.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.type && m.type.toLowerCase().includes(q));

      const matchesType =
        typeFilter === "ALL" ||
        (m.type && m.type.toLowerCase() === typeFilter.toLowerCase());

      return matchesSearch && matchesType;
    });
  }, [mappings, searchQuery, typeFilter]);

  if (me && !isAdmin(me)) {
    return null; // AdminGuard in LayoutShell covers this; safety net
  }

  return (
    <main className="min-w-0 space-y-6 pb-8">
      {/* Command Center Header */}
      <header className="rounded border border-outline-variant bg-surface-container-low px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              <span className="h-px w-5 bg-primary" aria-hidden="true" />
              Routing Metadata / Directory
            </div>
            <div>
              <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-on-surface sm:text-3xl lg:text-4xl">
                <Network aria-hidden="true" className="size-7 text-primary sm:size-8 shrink-0" />
                AS Mappings
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-on-surface-variant sm:text-sm">
                Map Autonomous System numbers to canonical organization entities and interconnect topologies.
                Enriches real-time BGP telemetry, peering graphs, and looking glass route outputs.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchMappings();
                setNotice(null);
              }}
              disabled={loading}
              aria-label="Refresh AS mappings"
              className="h-8 gap-2 border-outline-variant bg-surface-container-high px-3 font-mono text-xs text-on-surface hover:border-primary/50 hover:bg-surface-container-highest"
            >
              <RefreshCw
                aria-hidden="true"
                size={13}
                className={cn(loading && "animate-spin text-primary")}
              />
              <span>Refresh</span>
            </Button>
            {!isAdding && (
              <Button
                size="sm"
                onClick={() => {
                  setIsAdding(true);
                  setEditingAsn(null);
                  setFormAsn("");
                  setFormName("");
                  setFormType("Transit");
                  setError(null);
                  setNotice(null);
                }}
                aria-expanded={isAdding}
                aria-controls="as-mapping-editor"
                className="h-8 gap-2 bg-primary px-3 text-xs font-semibold text-on-primary hover:bg-primary-hover"
              >
                <Plus aria-hidden="true" size={14} />
                <span>Add Mapping</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* KPI / Telemetry Summary */}
      <section
        aria-label="Mapping telemetry overview"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <div className="rounded border border-outline-variant bg-surface-container-low p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Total Mappings
            </p>
            <Bookmark aria-hidden="true" size={15} className="text-primary/70 shrink-0" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-on-surface">
            {stats.total}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">Configured networks</p>
        </div>

        <div className="rounded border border-outline-variant bg-surface-container-low p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Transit Upstreams
            </p>
            <Globe aria-hidden="true" size={15} className="text-primary shrink-0" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-primary">
            {stats.transit}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            {stats.total > 0 ? `${Math.round((stats.transit / stats.total) * 100)}% of directory` : "No upstream routes"}
          </p>
        </div>

        <div className="rounded border border-outline-variant bg-surface-container-low p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Peers & IX Exchanges
            </p>
            <Shuffle aria-hidden="true" size={15} className="text-secondary shrink-0" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-on-surface">
            {stats.peerIx}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">Direct interconnects</p>
        </div>

        <div className="rounded border border-outline-variant bg-surface-container-low p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Customer / Internal
            </p>
            <Building2 aria-hidden="true" size={15} className="text-on-surface-variant shrink-0" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-on-surface-variant">
            {stats.customerInternal}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">Local AS assignments</p>
        </div>
      </section>

      {/* Alert Notices */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start justify-between gap-3 rounded border border-error/40 bg-error/10 px-4 py-3 text-xs text-error sm:text-sm"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle aria-hidden="true" size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-error/70 transition-colors hover:text-error"
            aria-label="Dismiss error"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start justify-between gap-3 rounded border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-primary sm:text-sm"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 aria-hidden="true" size={16} className="shrink-0 text-primary" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-primary/70 transition-colors hover:text-primary"
            aria-label="Dismiss notification"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* In-line Editor / Command Panel */}
      {isAdding && (
        <Card
          id="as-mapping-editor"
          className="border-outline-variant bg-surface-container-low"
        >
          <CardHeader className="border-b border-outline-variant bg-surface-container px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface sm:text-sm">
                  <Network aria-hidden="true" size={16} className="text-primary" />
                  {editingAsn ? `Edit Mapping: AS${editingAsn}` : "New AS Mapping"}
                </CardTitle>
                <CardDescription className="text-xs text-on-surface-variant">
                  {editingAsn
                    ? "Update canonical name or interconnect classification for this Autonomous System."
                    : "Define an AS number with verified organization ownership and topology role."}
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  editingAsn
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-outline-variant bg-surface-container-high text-on-surface"
                )}
              >
                {editingAsn ? "Mode: Update" : "Mode: Create"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-5 py-5">
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-12">
                {/* ASN Input */}
                <div className="space-y-1.5 lg:col-span-3">
                  <label
                    htmlFor={asnInputId}
                    className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant"
                  >
                    Autonomous System <span className="text-primary">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span
                      className="pointer-events-none absolute left-3 font-mono text-xs font-bold text-primary"
                      aria-hidden="true"
                    >
                      AS
                    </span>
                    <Input
                      id={asnInputId}
                      required
                      disabled={!!editingAsn || saving}
                      value={formAsn}
                      onChange={(e) =>
                        setFormAsn(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="15169"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-describedby={`${asnInputId}-hint`}
                      className="h-9 rounded border-outline-variant bg-surface-container-lowest pl-9 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40 disabled:opacity-60"
                    />
                  </div>
                  <p
                    id={`${asnInputId}-hint`}
                    className="text-[10px] text-on-surface-variant"
                  >
                    {editingAsn ? "ASN key cannot be modified" : "Numeric digits only (1–4294967295)"}
                  </p>
                </div>

                {/* Organization Name Input */}
                <div className="space-y-1.5 sm:col-span-1 lg:col-span-6">
                  <label
                    htmlFor={nameInputId}
                    className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant"
                  >
                    Organization / Entity Name <span className="text-primary">*</span>
                  </label>
                  <Input
                    id={nameInputId}
                    required
                    disabled={saving}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Google LLC, Cloudflare, Akamai"
                    maxLength={128}
                    autoComplete="organization"
                    aria-describedby={`${nameInputId}-hint`}
                    className="h-9 rounded border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface placeholder:text-on-surface-variant/40 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40"
                  />
                  <p
                    id={`${nameInputId}-hint`}
                    className="text-[10px] text-on-surface-variant"
                  >
                    Canonical name displayed in routing tables and BGP graphs
                  </p>
                </div>

                {/* Connection Type Select */}
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <label
                    htmlFor={typeSelectId}
                    className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant"
                  >
                    Interconnect Classification
                  </label>
                  <select
                    id={typeSelectId}
                    disabled={saving}
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    aria-describedby={`${typeSelectId}-hint`}
                    className="flex h-9 w-full items-center rounded border border-outline-variant bg-surface-container-lowest px-3 text-xs text-on-surface outline-none transition-colors focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
                  >
                    {CONNECTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <p
                    id={`${typeSelectId}-hint`}
                    className="text-[10px] text-on-surface-variant"
                  >
                    Topology classification role
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/60 pt-4">
                <span className="text-[11px] text-on-surface-variant">
                  <span className="font-bold text-primary">*</span> Mandatory fields
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={resetForm}
                    className="h-8 gap-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <X aria-hidden="true" size={13} />
                    <span>Cancel</span>
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="h-8 gap-1.5 bg-primary px-3 text-xs font-semibold text-on-primary hover:bg-primary-hover"
                  >
                    {saving ? (
                      <>
                        <RefreshCw aria-hidden="true" size={13} className="animate-spin" />
                      <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <Save aria-hidden="true" size={13} />
                        <span>{editingAsn ? "Update Mapping" : "Save Mapping"}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Configured Mappings Table Card */}
      <Card className="min-w-0 border-outline-variant bg-surface-container-low">
        <CardHeader className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-bold uppercase tracking-wider text-on-surface">
                <Layers aria-hidden="true" size={16} className="text-primary shrink-0" />
                Configured Directory
              </CardTitle>
              <CardDescription className="text-xs text-on-surface-variant">
                {mappings.length === 1
                  ? "1 autonomous network mapped"
                  : `${mappings.length} autonomous networks mapped`}
              </CardDescription>
            </div>

            {mappings.length > 0 && (
              <div className="relative w-full sm:w-72">
                <label htmlFor={searchInputId} className="sr-only">
                  Filter AS mappings
                </label>
                <Search
                  aria-hidden="true"
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
                <Input
                  id={searchInputId}
                  type="search"
                  placeholder="Filter ASN, name, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded border-outline-variant bg-surface-container-lowest pl-8 pr-7 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-on-surface"
                    aria-label="Clear search"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick filter pills */}
          {mappings.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1.5 border-t border-outline-variant/60 pt-3"
              role="toolbar"
              aria-label="Filter by connection type"
            >
              <div className="mr-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <Filter aria-hidden="true" size={12} />
                <span>Type:</span>
              </div>
              <button
                type="button"
                onClick={() => setTypeFilter("ALL")}
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  typeFilter === "ALL"
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant bg-surface-container-high text-on-surface-variant hover:border-outline hover:text-on-surface"
                )}
                aria-pressed={typeFilter === "ALL"}
              >
                All ({mappings.length})
              </button>
              {CONNECTION_TYPES.map((t) => {
                const count = mappings.filter(
                  (m) => (m.type || "").toLowerCase() === t.toLowerCase()
                ).length;
                const isSelected = typeFilter.toLowerCase() === t.toLowerCase();
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(isSelected ? "ALL" : t)}
                    className={cn(
                      "rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant bg-surface-container-high text-on-surface-variant hover:border-outline hover:text-on-surface"
                    )}
                    aria-pressed={isSelected}
                  >
                    {t} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div
              role="status"
              className="flex flex-col items-center justify-center p-12 text-sm text-on-surface-variant"
            >
              <RefreshCw
                aria-hidden="true"
                size={22}
                className="mb-3 animate-spin text-primary"
              />
              <span className="font-mono text-xs uppercase tracking-wider">
                Loading AS mappings...
              </span>
            </div>
          ) : mappings.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant">
              <Bookmark
                aria-hidden="true"
                size={36}
                className="mx-auto mb-3 text-primary/60"
              />
              <p className="text-base font-semibold text-on-surface">
                No AS mappings configured
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-on-surface-variant">
                Enrich peering topologies and telemetry by associating AS numbers with recognized network entities.
              </p>
              {!isAdding && (
                <Button
                  size="sm"
                  onClick={() => {
                    setIsAdding(true);
                    setEditingAsn(null);
                    setFormAsn("");
                    setFormName("");
                    setFormType("Transit");
                  }}
                  className="mt-5 gap-1.5 bg-primary px-3 text-xs font-semibold text-on-primary hover:bg-primary-hover"
                >
                  <Plus aria-hidden="true" size={14} />
                  <span>Add First Mapping</span>
                </Button>
              )}
            </div>
          ) : filteredMappings.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center text-sm text-on-surface-variant">
              <Search aria-hidden="true" size={24} className="mb-2 text-on-surface-variant/40" />
              <p className="font-medium text-on-surface">No matching AS mappings</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                No records matched &quot;{searchQuery}&quot;
                {typeFilter !== "ALL" ? ` with classification ${typeFilter}` : ""}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("ALL");
                }}
                className="mt-4 h-7 text-xs"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40 px-4 py-3">ASN</TableHead>
                  <TableHead className="px-4 py-3">Organization Name</TableHead>
                  <TableHead className="w-44 px-4 py-3">Classification</TableHead>
                  <TableHead className="w-24 px-4 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMappings.map((m) => {
                  const isCopied = copiedAsn === m.asn;
                  return (
                    <TableRow key={m.asn} className="group">
                      <TableCell className="px-4 py-3 font-mono font-bold text-primary">
                        <div className="flex items-center gap-1.5">
                          <span>AS{m.asn}</span>
                          <button
                            type="button"
                            onClick={() => copyAsn(m.asn)}
                            className="rounded p-1 text-on-surface-variant/50 transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:text-primary focus-visible:outline-none"
                            title={isCopied ? "Copied!" : `Copy ASN ${m.asn}`}
                            aria-label={isCopied ? `Copied AS${m.asn}` : `Copy AS${m.asn}`}
                          >
                            {isCopied ? (
                              <Check size={12} className="text-primary" aria-hidden="true" />
                            ) : (
                              <Copy size={12} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-on-surface">
                        {m.name}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                            getTypeBadgeClass(m.type)
                          )}
                        >
                          {m.type || "Unspecified"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startEdit(m)}
                            aria-label={`Edit mapping for AS${m.asn}`}
                            title="Edit mapping"
                            className="rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                          >
                            <Pencil aria-hidden="true" size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(m.asn, m.name)}
                            aria-label={`Delete mapping for AS${m.asn}`}
                            title="Delete mapping"
                            className="rounded text-on-surface-variant hover:bg-error/10 hover:text-error"
                          >
                            <Trash2 aria-hidden="true" size={13} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
