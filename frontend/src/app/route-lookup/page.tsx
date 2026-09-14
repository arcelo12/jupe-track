"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import {
  Compass,
  Search,
  HelpCircle,
  Terminal,
  Play,
  Settings2,
  Network,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { RouteResultViewer, parseRoutes } from '@/components/ui/RouteResultViewer';
import { AggregateASGraph } from '@/components/ui/AggregateASGraph';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ParsedRoute {
  prefix: string;
  isActive: boolean;
  rawLines: string[];
  asPath: string;
  communities: string;
  nextHops: string[];
  protocol: string;
  preference: string;
  localpref: string;
  metric: string;
  age: string;
  peerAs: string;
  state: string;
}

export default function RouteLookup() {
  const [target, setTarget] = useState("");
  const [bgpMode, setBgpMode] = useState("standard"); // "standard", "advertising", "receive"
  const [neighborIp, setNeighborIp] = useState("");
  const [protocol, setProtocol] = useState("all");
  const [detailLevel, setDetailLevel] = useState("detail"); // "brief", "detail", "extensive"
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ logs: string[]; execution_time_ms: number } | null>(null);
  const [showTopology, setShowTopology] = useState(false);
  const [copied, setCopied] = useState(false);

  const { logicalSystem } = useRefresh();

  const parsedOutput = useMemo<ParsedRoute[]>(() => {
    if (!output) return [];
    return parseRoutes(output);
  }, [output]);

  const allAsPaths = useMemo(() => {
    return parsedOutput
      .map((r) => r.asPath)
      .filter((p: string) => p && p.trim() !== '' && p !== 'Local' && p !== 'Direct');
  }, [parsedOutput]);

  const mainPrefix = parsedOutput.length > 0 ? parsedOutput[0].prefix : '';

  // Load initial cached settings if any
  useEffect(() => {
    try {
      const cached = localStorage.getItem('junos-route-lookup-state');
      if (cached) {
        const state = JSON.parse(cached);
        if (state.target) setTarget(state.target);
        if (state.bgpMode) setBgpMode(state.bgpMode);
        if (state.neighborIp) setNeighborIp(state.neighborIp);
        if (state.protocol) setProtocol(state.protocol);
        if (state.detailLevel) setDetailLevel(state.detailLevel);
        if (state.output) setOutput(state.output);
        if (state.error) setError(state.error);
        if (state.debugInfo) setDebugInfo(state.debugInfo);
      }
    } catch {}
  }, []);

  // Save state
  useEffect(() => {
    const state = { target, bgpMode, neighborIp, protocol, detailLevel, output, error, debugInfo };
    localStorage.setItem('junos-route-lookup-state', JSON.stringify(state));
  }, [target, bgpMode, neighborIp, protocol, detailLevel, output, error, debugInfo]);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((bgpMode === "advertising" || bgpMode === "receive") && !neighborIp.trim()) {
      setError("BGP Neighbor IP is required when querying advertising/receive protocols.");
      return;
    }

    setLoading(true);
    setError(null);
    setOutput(null);

    try {
      const res = await authFetch('/api/proxy/looking-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: "route_lookup",
          target: target.trim() || null,
          logical_system: logicalSystem,
          protocol,
          detail_level: detailLevel,
          bgp_mode: bgpMode,
          neighbor_ip: neighborIp.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOutput(data.output);
        setDebugInfo(data.debug || null);
      } else {
        setError(data.error || "An error occurred during route lookup.");
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Failed to perform route lookup.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTarget("");
    setBgpMode("standard");
    setNeighborIp("");
    setProtocol("all");
    setDetailLevel("detail");
    setOutput(null);
    setError(null);
    setDebugInfo(null);
    setShowTopology(false);
  };

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // Formulate the CLI Command representation
  const getCmdStr = () => {
    const parts = ["show route"];
    if (bgpMode === "advertising") {
      parts.push(`advertising-protocol bgp ${neighborIp.trim() || '<neighbor>'}`);
    } else if (bgpMode === "receive") {
      parts.push(`receive-protocol bgp ${neighborIp.trim() || '<neighbor>'}`);
    }
    if (target.trim()) parts.push(target.trim());
    if (bgpMode === "standard") {
      if (protocol !== "all") parts.push(`protocol ${protocol}`);
      if (detailLevel !== "brief") parts.push(detailLevel);
    }
    if (logicalSystem && logicalSystem !== "global") {
      parts.push(`logical-system ${logicalSystem}`);
    }
    return parts.join(" ");
  };

  return (
    <main className="min-w-0 space-y-6">
      {/* Page Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Routing Engine / Operational Query
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl flex items-center gap-3">
            <span aria-hidden="true" className="p-2 bg-primary/10 rounded border border-primary/20">
              <Compass className="text-primary size-6" />
            </span>
            Route Lookup &amp; Propagation
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Inspect operational routing table entries and BGP propagation (advertising / receive protocols) on the MX204.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-7 bg-primary/10 text-primary border-primary/25 font-mono text-xs rounded">
            System · {logicalSystem}
          </Badge>
          {debugInfo && (
            <Badge variant="outline" className="h-7 font-mono text-xs bg-surface-container border-outline-variant text-on-surface-variant rounded">
              Latency: {debugInfo.execution_time_ms}ms
            </Badge>
          )}
          {parsedOutput.length > 0 && (
            <Badge variant="outline" className="h-7 font-mono text-xs bg-surface-container border-outline-variant text-primary rounded">
              {parsedOutput.length} {parsedOutput.length === 1 ? 'route' : 'routes'}
            </Badge>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-w-0 items-start">
        {/* Left: Query Parameters */}
        <section aria-labelledby="query-config-title" className="lg:col-span-4 min-w-0">
          <Card className="bg-surface-container-low border-outline-variant shadow-none min-w-0 rounded overflow-hidden">
            <CardHeader className="pb-3 border-b border-outline-variant bg-surface-container/60 px-5 py-4">
              <div className="flex items-center justify-between">
                <CardTitle id="query-config-title" className="text-base flex items-center gap-2 text-on-surface">
                  <Settings2 aria-hidden="true" size={17} className="text-primary" />
                  Query Configuration
                </CardTitle>
                {(target || neighborIp || output || error) && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-primary transition-colors"
                    aria-label="Reset query fields"
                  >
                    <RotateCcw aria-hidden="true" size={12} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <CardDescription className="text-xs text-on-surface-variant mt-1">
                Configure operational route lookup parameters
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 min-w-0">
              <form onSubmit={handleLookup} className="space-y-4 min-w-0" role="search" aria-label="Route lookup parameters">
                {/* Lookup Mode */}
                <div className="space-y-1.5">
                  <label id="lookup-mode-label" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    Lookup Mode
                  </label>
                  <div
                    role="tablist"
                    aria-labelledby="lookup-mode-label"
                    className="grid grid-cols-3 gap-1 p-1 bg-surface-container-high border border-outline-variant rounded"
                  >
                    {([
                      { id: 'standard', label: 'Standard' },
                      { id: 'advertising', label: 'Advertise' },
                      { id: 'receive', label: 'Receive' },
                    ] as const).map(mode => (
                      <button
                        type="button"
                        key={mode.id}
                        role="tab"
                        id={`tab-${mode.id}`}
                        aria-selected={bgpMode === mode.id}
                        aria-controls={`panel-${mode.id}`}
                        onClick={() => {
                          setBgpMode(mode.id);
                          setError(null);
                        }}
                        className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                          bgpMode === mode.id
                            ? 'bg-primary text-on-primary font-semibold shadow-none'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target IP / Prefix */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="route-lookup-target" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                      Target IP / Prefix
                    </label>
                    <span className="text-[10px] text-on-surface-variant font-mono bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant/60">
                      Optional
                    </span>
                  </div>
                  <div className="relative">
                    <Search aria-hidden="true" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                    <Input
                      id="route-lookup-target"
                      type="text"
                      value={target}
                      onChange={e => setTarget(e.target.value)}
                      placeholder="e.g. 1.1.1.1/32 or 10.0.0.0/24"
                      className="pl-9 h-10 bg-surface-container-high border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded font-mono text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  {/* Preset Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Presets:</span>
                    {[
                      { label: '0.0.0.0/0', val: '0.0.0.0/0' },
                      { label: '1.1.1.1', val: '1.1.1.1' },
                      { label: '8.8.8.8', val: '8.8.8.8' },
                    ].map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setTarget(preset.val)}
                        className="rounded border border-outline-variant bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* BGP Neighbor IP (Only shown for propagation modes) */}
                {(bgpMode === "advertising" || bgpMode === "receive") && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <label htmlFor="route-lookup-neighbor" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                        BGP Neighbor IP
                      </label>
                      <span className="text-[10px] font-semibold text-error bg-error/10 px-1.5 py-0.5 rounded border border-error/20">
                        * Required
                      </span>
                    </div>
                    <Input
                      id="route-lookup-neighbor"
                      type="text"
                      required
                      aria-required="true"
                      value={neighborIp}
                      onChange={e => setNeighborIp(e.target.value)}
                      placeholder="e.g. 192.168.1.1 or 2001:db8::1"
                      className="h-10 bg-surface-container-high border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded font-mono text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="text-[11px] text-on-surface-variant">
                      Peer address to query {bgpMode === "advertising" ? "advertised" : "received"} routes for.
                    </p>
                  </div>
                )}

                {/* Standard Mode Filters */}
                {bgpMode === "standard" && (
                  <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1.5">
                      <label htmlFor="route-lookup-protocol" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                        Protocol
                      </label>
                      <select
                        id="route-lookup-protocol"
                        value={protocol}
                        onChange={e => setProtocol(e.target.value)}
                        className="flex h-10 w-full items-center justify-between rounded border border-outline-variant bg-surface-container-high px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer"
                      >
                        <option value="all">All Protocols</option>
                        <option value="bgp">BGP</option>
                        <option value="static">Static</option>
                        <option value="direct">Direct</option>
                        <option value="ospf">OSPF</option>
                        <option value="ldp">LDP</option>
                        <option value="local">Local</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="route-lookup-detail" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                        Detail Level
                      </label>
                      <select
                        id="route-lookup-detail"
                        value={detailLevel}
                        onChange={e => setDetailLevel(e.target.value)}
                        className="flex h-10 w-full items-center justify-between rounded border border-outline-variant bg-surface-container-high px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer"
                      >
                        <option value="brief">Brief</option>
                        <option value="detail">Detailed</option>
                        <option value="extensive">Extensive</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                      className="w-full h-10 gap-2 bg-primary hover:bg-primary/90 text-on-primary font-semibold shadow-none rounded transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 aria-hidden="true" size={16} className="animate-spin" />
                        <span>Querying Router…</span>
                      </>
                    ) : (
                      <>
                        <Play aria-hidden="true" size={16} fill="currentColor" />
                        <span>Execute Route Lookup</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {/* Mode Guidance */}
              <div className="mt-5 p-3.5 bg-surface-container border border-outline-variant/60 rounded flex items-start gap-3 text-xs text-on-surface-variant">
                <HelpCircle aria-hidden="true" size={16} className="text-primary shrink-0 mt-0.5" />
                <div className="space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-on-surface">Mode Reference:</p>
                  <p><span className="text-primary font-medium">Standard:</span> Queries active routing tables on MX204.</p>
                  <p><span className="text-primary font-medium">Advertise:</span> Shows routes announced to a specific BGP neighbor.</p>
                  <p><span className="text-primary font-medium">Receive:</span> Shows routes received from a neighbor before import policy.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Right: Results / Graph / Terminal */}
        <section aria-labelledby="results-title" className="lg:col-span-8 min-w-0 space-y-4">
          <h2 id="results-title" className="sr-only">Route Lookup Results</h2>

          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="bg-error/10 border border-error/30 rounded p-4 text-error text-sm flex items-start justify-between gap-3 min-w-0"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-error mt-1.5 shrink-0" />
                <p className="break-words font-mono text-xs">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-error/70 hover:text-error text-xs shrink-0 underline"
                aria-label="Dismiss error message"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Global AS Path Topology */}
          {!loading && allAsPaths.length > 0 && (
            <div className="min-w-0">
              <Button
                type="button"
                variant="outline"
                aria-expanded={showTopology}
                aria-controls="as-topology-panel"
                onClick={() => setShowTopology(!showTopology)}
                className="w-full justify-between border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container hover:text-on-surface shadow-none rounded h-11 px-4"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Network aria-hidden="true" size={16} className="text-primary shrink-0" />
                  <span className="font-semibold text-xs tracking-wide uppercase text-on-surface">Global AS Path Topology</span>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-mono px-1.5 py-0 h-4">
                    {allAsPaths.length} {allAsPaths.length === 1 ? 'path' : 'paths'}
                  </Badge>
                </span>
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span>{showTopology ? 'Hide Topology' : 'View Graph'}</span>
                  {showTopology ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
                </span>
              </Button>

              {showTopology && (
                <div
                  id="as-topology-panel"
                  className="mt-3 animate-in slide-in-from-top-3 fade-in duration-200 min-w-0 overflow-hidden rounded border border-outline-variant bg-surface-container-low p-3"
                >
                  <AggregateASGraph paths={allAsPaths} targetPrefix={mainPrefix} />
                </div>
              )}
            </div>
          )}

          {/* Terminal Console Card */}
          {(output || loading) && (
            <Card className="p-0 overflow-hidden shadow-none border-outline-variant bg-surface-container-low min-w-0 rounded flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-2.5 bg-surface-container-high border-b border-outline-variant space-y-0 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Terminal aria-hidden="true" size={14} className="text-primary shrink-0" />
                  <span className="text-xs text-on-surface-variant font-mono truncate" title={getCmdStr()}>
                    mx204 &gt; {getCmdStr()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {debugInfo && (
                    <span className="text-[11px] text-on-surface-variant font-mono hidden sm:inline">
                      {debugInfo.execution_time_ms}ms
                    </span>
                  )}
                  {output && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyOutput}
                      aria-label="Copy raw output to clipboard"
                      className="h-7 px-2.5 text-[11px] font-mono border-outline-variant bg-surface-container hover:bg-surface-container-high text-on-surface shadow-none rounded"
                    >
                      {copied ? (
                        <>
                          <Check aria-hidden="true" size={12} className="text-primary mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy aria-hidden="true" size={12} className="mr-1" />
                          Copy Raw
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0 bg-surface-container min-h-[440px] max-h-[700px] flex flex-col min-w-0 overflow-hidden">
                {loading ? (
                  <div
                    role="status"
                    aria-live="polite"
                    aria-label="Querying router"
                    className="p-6 space-y-3 font-mono"
                  >
                    <div className="flex items-center gap-2 text-xs text-primary mb-4">
                      <Loader2 aria-hidden="true" size={14} className="animate-spin" />
                      <span>Executing operational query: {getCmdStr()}</span>
                    </div>
                    {[90, 65, 80, 45, 70, 85, 60, 75].map((widthPct, idx) => (
                      <div
                        key={idx}
                        className="h-3.5 bg-surface-container-high/60 rounded animate-pulse"
                        style={{ width: `${widthPct}%` }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
                    <RouteResultViewer rawOutput={output || ""} />
                  </div>
                )}
              </CardContent>

              {/* Collapsible NETCONF transaction logs if available */}
              {debugInfo?.logs && debugInfo.logs.length > 0 && (
                <details className="border-t border-outline-variant bg-surface-container-low px-4 py-2 text-xs font-mono text-on-surface-variant">
                  <summary className="cursor-pointer hover:text-primary transition-colors">
                    NETCONF Transaction Logs ({debugInfo.logs.length})
                  </summary>
                  <div className="mt-2 space-y-1 bg-surface-container-lowest p-2 rounded border border-outline-variant/50 max-h-36 overflow-y-auto">
                    {debugInfo.logs.map((log, i) => (
                      <div key={i} className="text-[11px] font-mono text-on-surface-variant break-all">
                        {log}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </Card>
          )}

          {/* Terminal Ready Empty State */}
          {!output && !loading && (
            <Card className="min-h-[440px] flex flex-col items-center justify-center text-center p-8 border-dashed border-outline-variant bg-surface-container-low shadow-none min-w-0 rounded">
              <div aria-hidden="true" className="flex size-16 items-center justify-center rounded border border-outline-variant bg-surface-container mb-4">
                <Terminal size={28} className="text-primary/70" />
              </div>
              <h3 className="text-lg font-bold text-on-surface font-display">Terminal Ready</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mt-1.5 leading-relaxed">
                Select query mode, specify a target IP prefix or BGP neighbor, and click <strong className="text-primary font-medium">Execute Route Lookup</strong> to query real-time Junos FIB/RIB tables.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
                {[
                  { label: 'Default Route', cmd: '0.0.0.0/0', mode: 'standard', proto: 'all' },
                  { label: 'BGP Routes Only', cmd: '', mode: 'standard', proto: 'bgp' },
                  { label: 'Cloudflare Anycast', cmd: '1.1.1.1', mode: 'standard', proto: 'all' },
                  { label: 'Google Public DNS', cmd: '8.8.8.8', mode: 'standard', proto: 'all' },
                ].map((quick, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setTarget(quick.cmd);
                      setBgpMode(quick.mode);
                      setProtocol(quick.proto);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-surface-container border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors font-mono"
                  >
                    {quick.label}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
