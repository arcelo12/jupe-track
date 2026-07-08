"use client";

import React, { useState } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { Compass, Search, HelpCircle, Terminal, Play, Settings2, Network, ChevronDown, ChevronUp } from 'lucide-react';
import { RouteResultViewer, parseRoutes } from '@/components/ui/RouteResultViewer';
import { AggregateASGraph } from '@/components/ui/AggregateASGraph';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

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
  const [showDebug, setShowDebug] = useState(false);
  const [showTopology, setShowTopology] = useState(false);
  
  const { logicalSystem } = useRefresh();

  const parsedOutput = React.useMemo(() => {
    if (!output) return [];
    return parseRoutes(output);
  }, [output]);

  const allAsPaths = React.useMemo(() => {
    return parsedOutput
      .map((r: any) => r.asPath)
      .filter((p: string) => p && p.trim() !== '' && p !== 'Local' && p !== 'Direct');
  }, [parsedOutput]);

  const mainPrefix = parsedOutput.length > 0 ? parsedOutput[0].prefix : '';

  // Load initial cached settings if any
  React.useEffect(() => {
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
  React.useEffect(() => {
    const state = { target, bgpMode, neighborIp, protocol, detailLevel, output, error, debugInfo };
    localStorage.setItem('junos-route-lookup-state', JSON.stringify(state));
  }, [target, bgpMode, neighborIp, protocol, detailLevel, output, error, debugInfo]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((bgpMode === "advertising" || bgpMode === "receive") && !neighborIp) {
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
          target: target || null,
          logical_system: logicalSystem,
          protocol,
          detail_level: detailLevel,
          bgp_mode: bgpMode,
          neighbor_ip: neighborIp || null
        })
      });

      const data = await res.json();
      if (data.success) {
        setOutput(data.output);
        setDebugInfo(data.debug || null);
      } else {
        setError(data.error || "An error occurred during route lookup.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to perform route lookup.");
    } finally {
      setLoading(false);
    }
  };

  // Formulate the CLI Command representation
  const getCmdStr = () => {
    const parts = ["show route"];
    if (bgpMode === "advertising") {
      parts.push(`advertising-protocol bgp ${neighborIp || '<neighbor>'}`);
    } else if (bgpMode === "receive") {
      parts.push(`receive-protocol bgp ${neighborIp || '<neighbor>'}`);
    }
    if (target) parts.push(target);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Compass className="text-emerald-400" size={28} />
          </div>
          Route Lookup & Propagation
        </h1>
        <p className="text-slate-400 mt-2">
          Perform standard route lookup or inspect BGP propagation (advertising / receive protocols) on the MX204.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side Settings Form */}
        <Card className="lg:col-span-1 bg-slate-950/50 border-white/5 backdrop-blur-xl shadow-xl h-fit">
          <CardHeader className="pb-4 border-b border-white/5 bg-slate-900/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings2 size={18} className="text-emerald-400" />
              Query Settings
            </CardTitle>
            <CardDescription>Configure parameters for route querying</CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleLookup} className="space-y-5">
              
              {/* Mode Tabs */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Lookup Mode</label>
                <Tabs value={bgpMode} onValueChange={setBgpMode} className="w-full">
                  <TabsList className="w-full grid grid-cols-3 bg-slate-900/80 border border-slate-800">
                    <TabsTrigger value="standard" className="text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">Standard</TabsTrigger>
                    <TabsTrigger value="advertising" className="text-xs data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">Advertise</TabsTrigger>
                    <TabsTrigger value="receive" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Receive</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Target Route/Prefix */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                  Target IP / Prefix
                  <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-slate-700 text-slate-500">Optional</Badge>
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-slate-500" />
                  <Input
                    type="text"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder="1.1.1.1/32 or 10.0.0.0/24"
                    className="pl-9 bg-slate-900/50 border-slate-800 focus-visible:ring-emerald-500/50"
                  />
                </div>
              </div>

              {/* BGP Neighbor IP (Only shown for propagation modes) */}
              {(bgpMode === "advertising" || bgpMode === "receive") && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex justify-between">
                    <span>BGP Neighbor IP</span>
                    <span className="text-rose-500">* Required</span>
                  </label>
                  <Input
                    type="text"
                    required
                    value={neighborIp}
                    onChange={e => setNeighborIp(e.target.value)}
                    placeholder="e.g. 192.168.1.1"
                    className="bg-slate-900/50 border-slate-800 focus-visible:ring-emerald-500/50"
                  />
                </div>
              )}

              {/* Standard Mode Filters */}
              {bgpMode === "standard" && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Protocol</label>
                    <select
                      value={protocol}
                      onChange={e => setProtocol(e.target.value)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 ring-offset-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 transition-colors cursor-pointer"
                    >
                      <option value="all">All</option>
                      <option value="bgp">BGP</option>
                      <option value="static">Static</option>
                      <option value="direct">Direct</option>
                      <option value="ospf">OSPF</option>
                      <option value="ldp">LDP</option>
                      <option value="local">Local</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Detail</label>
                    <select
                      value={detailLevel}
                      onChange={e => setDetailLevel(e.target.value)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 ring-offset-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 transition-colors cursor-pointer"
                    >
                      <option value="brief">Brief</option>
                      <option value="detail">Detailed</option>
                      <option value="extensive">Extensive</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all"
              >
                <Play size={16} fill="currentColor" />
                {loading ? "Querying Router..." : "Execute Lookup"}
              </Button>
            </form>

            {/* Quick Help */}
            <div className="mt-6 p-3 bg-slate-900/50 border border-slate-800 rounded-lg flex items-start gap-3 text-xs text-slate-400">
              <HelpCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1.5 leading-relaxed">
                <p className="font-semibold text-slate-300">Quick Tips:</p>
                <p>• Use <Badge variant="secondary" className="px-1 text-[9px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">Advertise</Badge> to see routes you announce to a peer.</p>
                <p>• Use <Badge variant="secondary" className="px-1 text-[9px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">Receive</Badge> to see prefix updates received from a peer before policies.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Side Terminal Screen */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Error Banner */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-rose-300 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              {error}
            </div>
          )}

          {/* Aggregate AS Graph Outside Terminal */}
          {!loading && allAsPaths.length > 0 && (
             <div className="mb-2">
               <Button
                 variant="outline"
                 onClick={() => setShowTopology(!showTopology)}
                 className="w-full justify-between border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 hover:text-slate-100 shadow-sm"
               >
                 <div className="flex items-center gap-2">
                   <Network size={16} className="text-emerald-400" />
                   <span>Global AS Path Topology Available ({allAsPaths.length} paths)</span>
                 </div>
                 {showTopology ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
               </Button>

               {showTopology && (
                 <div className="mt-4 animate-in slide-in-from-top-4 fade-in duration-300">
                   <AggregateASGraph paths={allAsPaths} targetPrefix={mainPrefix} />
                 </div>
               )}
             </div>
          )}

          {/* Terminal Console Wrapper */}
          {(output || loading) && (
            <Card className="p-0 overflow-hidden shadow-2xl border-white/5 bg-slate-950/80 backdrop-blur-md">
              <CardHeader className="flex flex-row items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-white/10 space-y-0">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                  </div>
                  <Terminal size={14} className="text-slate-400 ml-2" />
                  <span className="text-xs text-slate-400 font-mono">
                    mx204 &gt; {getCmdStr()}
                  </span>
                </div>
                {debugInfo && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {debugInfo.execution_time_ms}ms
                  </span>
                )}
              </CardHeader>
              <CardContent className="p-0 bg-black/60 min-h-[400px] max-h-[650px] flex flex-col">
                {loading ? (
                  <div className="p-4 space-y-2 animate-pulse font-mono text-emerald-500/70">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                      <div key={i} className="h-4 bg-slate-800/60 rounded" style={{ width: `${Math.random() * 50 + 40}%` }}></div>
                    ))}
                  </div>
                ) : (
                  <RouteResultViewer rawOutput={output || ""} />
                )}
              </CardContent>
            </Card>
          )}

          {!output && !loading && (
            <Card className="h-[500px] flex flex-col items-center justify-center text-center p-8 border-dashed border-slate-700 bg-slate-950/30 shadow-none">
              <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-inner">
                <Terminal size={32} className="text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-300">Terminal Ready</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-2 leading-relaxed">
                Configure the query filters on the left and click <strong className="text-emerald-500/70 font-medium">Execute Lookup</strong> to inspect operational routes.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
