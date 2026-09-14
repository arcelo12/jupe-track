"use client";

import React, { useEffect, useState } from 'react';
import { BGPPeerPolicy, BGPPolicy, BGPPolicyItem } from '@/lib/types';
import { PolicyNode } from '@/components/dashboard/PolicyNode';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import {
  ShieldAlert,
  Search,
  FileCode2,
  Layers,
  Network,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Loader2,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type PolicyDataResp = {
  neighbors: Record<string, BGPPeerPolicy>;
  policies: Record<string, BGPPolicy>;
};

export default function PolicyDashboard() {
  const [policyData, setPolicyData] = useState<PolicyDataResp>({ neighbors: {}, policies: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"policies" | "neighbors">("policies");
  const { refreshTrigger, logicalSystem } = useRefresh();

  useEffect(() => {
    try {
      const cachedData = localStorage.getItem(`junos-policy-data-${logicalSystem || 'global'}`);
      if (cachedData) {
        setPolicyData(JSON.parse(cachedData));
        setLoading(false);
      }
    } catch {}
  }, [logicalSystem]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await authFetch(`/api/proxy/bgp-policy/${logicalSystem}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Failed to fetch data');
        const data = await res.json();

        // Handle backwards compatibility if backend hasn't updated yet
        if (!data.policies && !data.neighbors) {
          setPolicyData({ neighbors: data, policies: {} });
        } else {
          setPolicyData(data);
          localStorage.setItem(`junos-policy-data-${logicalSystem}`, JSON.stringify(data));
        }
      } catch (err: unknown) {
        console.warn("Error loading BGP policy data:", err);
        setError(err instanceof Error ? err.message : "Failed to load policy data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [logicalSystem, refreshTrigger]);

  const policiesList = Object.values(policyData.policies || {});
  const neighborsList = Object.values(policyData.neighbors || {});

  const totalTerms = policiesList.reduce((acc, p) => acc + (p.terms?.length || 0), 0);
  const totalImports = neighborsList.reduce((acc, n) => acc + (n.import_policies?.length || 0), 0);
  const totalExports = neighborsList.reduce((acc, n) => acc + (n.export_policies?.length || 0), 0);

  const filteredPolicies = policiesList.filter(
    p => p.policy_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredNeighbors = neighborsList.filter(
    peer => peer.peer_address.includes(searchQuery.trim())
  );

  const renderTerm = (term: BGPPolicyItem, idx: number) => (
    <PolicyNode key={term.term_name || idx} term={term} index={idx} />
  );

  const renderPolicyDetail = (peerPolicy: BGPPeerPolicy, pName: string, direction: "import" | "export") => {
    const pd = policyData.policies?.[pName] || peerPolicy.policy_details?.[pName];
    const isImport = direction === "import";
    const termsCount = pd?.terms?.length || 0;

    return (
      <Card
        className={`min-w-0 rounded border border-outline-variant bg-surface-container/60 shadow-none border-l-4 ${
          isImport ? "border-l-primary" : "border-l-secondary"
        }`}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-outline-variant/50 bg-surface-container px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                isImport
                  ? "border border-primary/30 bg-primary/20 text-primary"
                  : "border border-secondary/30 bg-secondary/20 text-secondary"
              }`}
            >
              {isImport ? "IN" : "OUT"}
            </span>
            <span className="truncate font-mono text-sm font-semibold text-primary">
              {pName}
            </span>
          </div>
          <span className="shrink-0 font-mono text-xs text-on-surface-variant">
            {termsCount} {termsCount === 1 ? "term" : "terms"}
          </span>
        </CardHeader>
        <CardContent className="px-4 py-3">
          {termsCount > 0 && pd ? (
            <div className="space-y-1">
              {pd.terms.map(renderTerm)}
            </div>
          ) : (
            <div className="rounded border border-dashed border-outline-variant/50 bg-surface-container-low/40 p-3 text-xs italic text-on-surface-variant">
              No terms configured or unable to parse policy details.
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const emptyState = (title: string, hint?: string) => (
    <Card className="min-w-0 rounded border-outline-variant bg-surface-container-low shadow-none">
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2.5 px-4 py-12 text-center text-on-surface-variant">
        <ShieldAlert aria-hidden="true" size={32} className="text-on-surface-variant/40" />
        <p className="text-sm font-medium text-on-surface">{title}</p>
        {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            BGP Routing Control
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
              Routing Policy
            </h1>
            <Badge className="border border-primary/20 bg-primary/10 font-mono text-xs text-primary">
              System · {logicalSystem || 'default'}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Detailed BGP import and export policies, match conditions, and action terms for the current logical system.
          </p>
        </div>

        {/* Controls */}
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          {/* View Mode Toggle */}
          <div
            role="tablist"
            aria-label="Policy view mode"
            className="flex rounded border border-outline-variant bg-surface-container p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "policies"}
              onClick={() => setViewMode("policies")}
              className={`inline-flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "policies"
                  ? "border border-primary/30 bg-primary/20 text-primary shadow-none"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <FileCode2 aria-hidden="true" size={14} />
              All Policies
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "neighbors"}
              onClick={() => setViewMode("neighbors")}
              className={`inline-flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "neighbors"
                  ? "border border-primary/30 bg-primary/20 text-primary shadow-none"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Network aria-hidden="true" size={14} />
              By Neighbor
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <Input
              aria-label="Search policies and neighbors"
                placeholder={viewMode === "policies" ? "Search policy name…" : "Search peer IP…"}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded border-outline-variant bg-surface-container pl-9 pr-8 text-xs text-on-surface focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <X aria-hidden="true" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="rounded border-outline-variant bg-surface-container-low shadow-none">
          <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
              <FileCode2 size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Policies</p>
              <p className="truncate font-mono text-xl font-bold text-primary">{policiesList.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded border-outline-variant bg-surface-container-low shadow-none">
          <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
              <Layers size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Terms Defined</p>
              <p className="truncate font-mono text-xl font-bold text-primary">{totalTerms}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded border-outline-variant bg-surface-container-low shadow-none">
          <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
              <Network size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Configured Peers</p>
              <p className="truncate font-mono text-xl font-bold text-primary">{neighborsList.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded border-outline-variant bg-surface-container-low shadow-none">
          <CardContent className="flex items-center gap-3 p-3.5 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
              <ArrowLeftRight size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">In / Out Bindings</p>
              <p className="truncate font-mono text-xl font-bold text-primary">{totalImports} / {totalExports}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <ShieldAlert aria-hidden="true" size={18} className="shrink-0" />
          <span className="min-w-0 flex-1 font-mono text-xs">{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="space-y-6">
        {loading && policiesList.length === 0 && neighborsList.length === 0 ? (
          <Card className="min-w-0 rounded border-outline-variant bg-surface-container-low shadow-none">
            <CardContent
              role="status"
              aria-live="polite"
              className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 py-12 text-center text-sm text-on-surface-variant"
            >
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
              <p>
                Loading routing policies for <span className="font-mono font-semibold text-primary">{logicalSystem || 'default'}</span>…
              </p>
            </CardContent>
          </Card>
        ) : viewMode === "policies" ? (
          /* ALL POLICIES VIEW */
          filteredPolicies.length === 0 ? (
            emptyState(
              searchQuery
                ? `No routing policies matching "${searchQuery}".`
                : "No routing policies found for this logical system.",
              searchQuery ? "Clear search query to see all policies." : undefined
            )
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
              {filteredPolicies.map((policy) => {
                const termCount = policy.terms?.length || 0;
                return (
                  <Card
                    key={policy.policy_name}
                    className="min-w-0 overflow-hidden rounded border border-outline-variant bg-surface-container-low border-l-4 border-l-primary shadow-none"
                  >
                    <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-outline-variant bg-surface-container px-5 py-3.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">Policy</span>
                        <CardTitle className="truncate font-mono text-base font-semibold text-primary">
                          {policy.policy_name}
                        </CardTitle>
                      </div>
                      <Badge className="shrink-0 rounded border border-outline-variant bg-surface-container-high font-mono text-xs text-on-surface">
                        {termCount} {termCount === 1 ? 'term' : 'terms'}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-5">
                      {termCount > 0 ? (
                        <div className="space-y-1">
                          {policy.terms.map(renderTerm)}
                        </div>
                      ) : (
                        <div className="rounded border border-dashed border-outline-variant/60 bg-surface-container/40 p-4 text-xs italic text-on-surface-variant">
                          No terms configured or unable to parse policy details.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          /* BY NEIGHBOR VIEW */
          filteredNeighbors.length === 0 ? (
            emptyState(
              searchQuery
                ? `No BGP neighbors matching "${searchQuery}".`
                : "No BGP neighbors with configured policies found.",
              searchQuery ? "Clear search query to see all peers." : undefined
            )
          ) : (
            <div className="space-y-5">
              {filteredNeighbors.map((peerPolicy) => {
                const importCount = peerPolicy.import_policies?.length || 0;
                const exportCount = peerPolicy.export_policies?.length || 0;

                return (
                  <Card
                    key={peerPolicy.peer_address}
                    className="min-w-0 overflow-hidden rounded border border-outline-variant bg-surface-container-low shadow-none"
                  >
                    <CardHeader className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Network aria-hidden="true" size={18} className="shrink-0 text-primary" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">BGP Peer</span>
                          <CardTitle className="truncate font-mono text-base font-semibold text-primary">
                            {peerPolicy.peer_address}
                          </CardTitle>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 text-on-surface">
                          <ArrowDownLeft aria-hidden="true" size={13} className="text-primary" />
                          <span className="text-on-surface-variant">Imports</span>
                          <strong className="font-mono text-primary">{importCount}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 text-on-surface">
                          <ArrowUpRight aria-hidden="true" size={13} className="text-secondary" />
                          <span className="text-on-surface-variant">Exports</span>
                          <strong className="font-mono text-secondary">{exportCount}</strong>
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5">
                      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                        {/* Import Policies column */}
                        <div className="min-w-0 space-y-3">
                          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                              <ArrowDownLeft aria-hidden="true" size={14} className="text-primary" />
                              Import Policies ({importCount})
                            </h3>
                          </div>
                          {importCount > 0 ? (
                            <div className="space-y-3">
                              {peerPolicy.import_policies.map(pName => (
                                <div key={pName} className="min-w-0">
                                  {renderPolicyDetail(peerPolicy, pName, "import")}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded border border-dashed border-outline-variant/60 bg-surface-container/30 px-4 py-3 text-xs italic text-on-surface-variant">
                              No import policy applied to this peer.
                            </div>
                          )}
                        </div>

                        {/* Export Policies column */}
                        <div className="min-w-0 space-y-3">
                          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
                              <ArrowUpRight aria-hidden="true" size={14} className="text-secondary" />
                              Export Policies ({exportCount})
                            </h3>
                          </div>
                          {exportCount > 0 ? (
                            <div className="space-y-3">
                              {peerPolicy.export_policies.map(pName => (
                                <div key={pName} className="min-w-0">
                                  {renderPolicyDetail(peerPolicy, pName, "export")}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded border border-dashed border-outline-variant/60 bg-surface-container/30 px-4 py-3 text-xs italic text-on-surface-variant">
                              No export policy applied to this peer.
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
