"use client";

import React, { useState } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { Compass, Search, HelpCircle, Terminal, Play, Settings2 } from 'lucide-react';
import { RouteResultViewer } from '@/components/ui/RouteResultViewer';

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
  
  const { logicalSystem } = useRefresh();

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
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Compass className="text-emerald-400" size={32} />
          Route Lookup & Propagation
        </h1>
        <p className="text-slate-400 mt-1">
          Perform standard route lookup or inspect BGP propagation (advertising / receive protocols) on the MX204.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side Settings Form */}
        <div className="lg:col-span-1 glass-panel flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-2">
            <Settings2 size={18} className="text-emerald-400" />
            Query Settings
          </h2>

          <form onSubmit={handleLookup} className="space-y-4">
            {/* Mode Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Lookup Mode</label>
              <select
                value={bgpMode}
                onChange={e => setBgpMode(e.target.value)}
                className="bg-slate-900 border border-slate-700/50 rounded-lg text-sm p-2.5 outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
              >
                <option value="standard">Standard Route Lookup</option>
                <option value="advertising">BGP Advertising Protocol</option>
                <option value="receive">BGP Receive Protocol</option>
              </select>
            </div>

            {/* Target Route/Prefix */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Target IP / Prefix (Optional)
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type="text"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="e.g. 1.1.1.1/32 or 10.0.0.0/24"
                  className="bg-slate-900 border border-slate-700/50 rounded-lg text-sm p-2.5 pl-10 w-full outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
                />
              </div>
            </div>

            {/* BGP Neighbor IP (Only shown for propagation modes) */}
            {(bgpMode === "advertising" || bgpMode === "receive") && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  BGP Neighbor IP <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={neighborIp}
                  onChange={e => setNeighborIp(e.target.value)}
                  placeholder="e.g. 192.168.1.1"
                  className="bg-slate-900 border border-slate-700/50 rounded-lg text-sm p-2.5 w-full outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
                />
              </div>
            )}

            {/* Protocol Filter (Only shown for standard mode) */}
            {bgpMode === "standard" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Protocol Filter</label>
                <select
                  value={protocol}
                  onChange={e => setProtocol(e.target.value)}
                  className="bg-slate-900 border border-slate-700/50 rounded-lg text-sm p-2.5 outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
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
            )}

            {/* Detail Level (Only shown for standard mode) */}
            {bgpMode === "standard" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Output Format</label>
                <select
                  value={detailLevel}
                  onChange={e => setDetailLevel(e.target.value)}
                  className="bg-slate-900 border border-slate-700/50 rounded-lg text-sm p-2.5 outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
                >
                  <option value="brief">Brief</option>
                  <option value="detail">Detailed</option>
                  <option value="extensive">Extensive</option>
                </select>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-emerald-700 disabled:to-teal-800 text-slate-950 font-bold rounded-lg shadow-[0_4px_20px_rgba(16,185,129,0.15)] transition-all duration-300 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              <Play size={16} fill="currentColor" />
              {loading ? "Querying Router..." : "Execute Lookup"}
            </button>
          </form>

          {/* Quick Help */}
          <div className="mt-4 p-3 bg-slate-800/40 border border-slate-700/30 rounded-lg flex items-start gap-2.5 text-xs text-slate-400">
            <HelpCircle size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 leading-normal">
              <p className="font-semibold text-slate-300">Quick Tips:</p>
              <p>• Use <span className="font-mono bg-slate-950/40 px-1 rounded">BGP Advertising</span> to see routes you announce to a peer.</p>
              <p>• Use <span className="font-mono bg-slate-950/40 px-1 rounded">BGP Receive</span> to see prefix updates received from a peer before policies.</p>
            </div>
          </div>
        </div>

        {/* Right Side Terminal Screen */}
        <div className="lg:col-span-2 space-y-4">
          {/* Error Banner */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-rose-300 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              {error}
            </div>
          )}

          {/* Terminal Console Wrapper */}
          {(output || loading) && (
            <div className="glass-panel p-0 overflow-hidden shadow-2xl border-white/5">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
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
              </div>
              <div className="p-0 bg-black/40 min-h-[400px] max-h-[600px] flex flex-col">
                {loading ? (
                  <div className="p-4 space-y-2 animate-pulse font-mono text-emerald-500/70">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                      <div key={i} className="h-4 bg-slate-800/60 rounded" style={{ width: `${Math.random() * 50 + 40}%` }}></div>
                    ))}
                  </div>
                ) : (
                  <RouteResultViewer rawOutput={output || ""} />
                )}
              </div>
            </div>
          )}

          {!output && !loading && (
            <div className="glass-panel h-[480px] flex flex-col items-center justify-center text-center p-6 border-dashed border-white/5">
              <Terminal size={48} className="text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-400">Terminal Ready</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Configure the query filters on the left and click "Execute Lookup" to inspect operational routes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
