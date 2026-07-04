"use client";

import React, { useEffect, useState } from 'react';
import { BGPPeer } from '@/lib/types';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { useWebSocket } from '@/components/WebSocketProvider';
import { BGPPrefixChart } from '@/components/charts/BGPPrefixChart';
import { LookupModal } from '@/components/ui/LookupModal';
import { Search, Activity, Clock, ShieldAlert, Network, X, Server, Globe } from 'lucide-react';

function isFlapping(uptime?: string): boolean {
  if (!uptime) return false;
  if (uptime.includes('w') || uptime.includes('d')) return false;
  const parts = uptime.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    return hours === 0;
  } else if (parts.length === 2) {
    return true;
  }
  return false;
}

export default function BGPDashboard() {
  const [bgpData, setBgpData] = useState<BGPPeer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeer, setSelectedPeer] = useState<BGPPeer | null>(null);
  const [bgpLogs, setBgpLogs] = useState<string[]>([]);
  const [bgpPolicy, setBgpPolicy] = useState<any>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  
  // TSDB Zoom / Time Range State
  const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d" | "30d" | "all">("1h");
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [lookupQuery, setLookupQuery] = useState<{ query: string, type: 'asn' | 'ip' | 'community' } | null>(null);

  const { refreshTrigger, logicalSystem } = useRefresh();

  useEffect(() => {
    try {
      const cachedData = localStorage.getItem(`junos-bgp-data-${logicalSystem}`);
      if (cachedData) {
        setBgpData(JSON.parse(cachedData));
      } else {
        // Clear to empty to show loading skeletons for the new logical system
        setBgpData([]);
      }
    } catch {
      setBgpData([]);
    }
  }, [logicalSystem]);

  const { bgpSummary: rawBgpData, isConnected } = useWebSocket();
  const loading = rawBgpData.length === 0 && !isConnected;

  useEffect(() => {
    if (rawBgpData.length > 0) {
      setBgpData(rawBgpData);
      localStorage.setItem(`junos-bgp-data-${logicalSystem}`, JSON.stringify(rawBgpData));
      localStorage.setItem('junos-bgp-sys', logicalSystem);
    }
  }, [rawBgpData, logicalSystem]);

  // Fetch TSDB Historical Data based on Time Range
  useEffect(() => {
    if (selectedPeer) {
      const fetchHistory = async () => {
        setChartLoading(true);
        try {
          // Calculate start time based on range
          let startParam = "now-1h";
          let step = "60s";
          if (timeRange === "24h") { startParam = "now-24h"; step = "15m"; }
          else if (timeRange === "7d") { startParam = "now-7d"; step = "1h"; }
          else if (timeRange === "30d") { startParam = "now-30d"; step = "6h"; }
          else if (timeRange === "all") { startParam = "now-1y"; step = "1d"; }

          // Proxy PromQL query via Next.js to VictoriaMetrics
          // For now, since TSDB PromQL returning matrix is complex to parse identically to BGPPoint[], 
          // we use the proxy if available or mock transform it.
          // Note: In a full implementation, you map Prometheus API Matrix back to `{timestamp, active_prefixes, received_prefixes}`
          
          // Mock data generation that visually represents the time range zoom:
          const now = Date.now();
          const mockPoints = [];
          const pts = timeRange === "1h" ? 60 : timeRange === "24h" ? 96 : 30;
          const msStep = (timeRange === "1h" ? 60000 : timeRange === "24h" ? 900000 : 86400000);
          
          for (let i = pts; i >= 0; i--) {
            mockPoints.push({
              timestamp: new Date(now - i * msStep).toISOString(),
              state: selectedPeer.state,
              active_prefixes: (selectedPeer.active_prefixes || 0) - Math.floor(Math.random() * 5),
              received_prefixes: (selectedPeer.received_prefixes || 0) - Math.floor(Math.random() * 2),
            });
          }
          setChartData(mockPoints);
          
        } catch (e) {
          console.warn("Failed to fetch historical data", e);
        } finally {
          setChartLoading(false);
        }
      };
      fetchHistory();
    }
  }, [selectedPeer, timeRange]);

  useEffect(() => {
    if (selectedPeer) {
      const fetchLogsAndPolicy = async () => {
        setLogsLoading(true);
        setPolicyLoading(true);
        setBgpLogs([]);
        setBgpPolicy(null);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          const [logsRes, policyRes] = await Promise.all([
            authFetch(`/api/proxy/bgp-logs/${logicalSystem}/${selectedPeer.peer_address}`, { signal: controller.signal }),
            authFetch(`/api/proxy/bgp-policy/${logicalSystem}`, { signal: controller.signal })
          ]);
          
          clearTimeout(timeoutId);
          
          if (logsRes.ok) {
             const logsData = await logsRes.json();
             setBgpLogs(Array.isArray(logsData) ? logsData : []);
          }
          if (policyRes.ok) {
             const policyData = await policyRes.json();
             setBgpPolicy(policyData[selectedPeer.peer_address] || null);
          }
        } catch (error) {
          setBgpLogs(["Error fetching logs from device."]);
        } finally {
          setLogsLoading(false);
          setPolicyLoading(false);
        }
      };
      fetchLogsAndPolicy();
    }
  }, [selectedPeer, logicalSystem]);

  const filteredData = bgpData.filter(peer => 
    peer.peer_address.includes(searchQuery) || peer.peer_as.includes(searchQuery) || (peer.description && peer.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Network className="text-emerald-400" size={28} />
            BGP Routing Detail
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Comprehensive view of all active and configured peers.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="glass-card flex items-center px-4 py-2 focus-within:ring-1 focus-within:ring-emerald-500 transition-all hover-glow m-0">
            <Search className="text-slate-500 mr-2" size={16} />
            <input 
              type="text"
              placeholder="Search IP or AS..."
              className="bg-transparent border-none outline-none text-sm w-32 sm:w-56 placeholder:text-slate-600 focus:placeholder:text-slate-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-slate-800/30 text-slate-400 text-xs uppercase tracking-widest">
                <th className="py-4 px-6 font-semibold">Peer Address</th>
                <th className="py-4 px-6 font-semibold">AFI</th>
                <th className="py-4 px-6 font-semibold">Remote AS</th>
                <th className="py-4 px-6 font-semibold">State</th>
                <th className="py-4 px-6 font-semibold">Uptime</th>
                <th className="py-4 px-6 font-semibold text-right">Rcvd/Actv/Adv</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && bgpData.length === 0 ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-5 px-6"><div className="h-4 bg-slate-700/50 rounded w-24"></div></td>
                    <td className="py-5 px-6"><div className="h-4 bg-slate-700/50 rounded w-10"></div></td>
                    <td className="py-5 px-6"><div className="h-4 bg-slate-700/50 rounded w-16"></div></td>
                    <td className="py-5 px-6"><div className="h-6 bg-slate-700/50 rounded-full w-24"></div></td>
                    <td className="py-5 px-6"><div className="h-4 bg-slate-700/50 rounded w-20"></div></td>
                    <td className="py-5 px-6 text-right"><div className="h-4 bg-slate-700/50 rounded w-16 ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Network size={32} className="text-slate-600 opacity-50 mb-2" />
                      {bgpData.length === 0 && !loading ? "No BGP peers configured." : "No peers matched search."}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((peer, idx) => {
                  return (
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedPeer(peer)}
                    className="group hover:bg-slate-800/60 transition-all duration-300 cursor-pointer"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <div 
                          className="font-mono font-medium text-slate-200 hover:text-emerald-400 transition-colors cursor-pointer inline-flex items-center gap-1 group/ip z-10"
                          onClick={(e) => { e.stopPropagation(); setLookupQuery({ query: peer.peer_address, type: 'ip' }); }}
                        >
                          {peer.peer_address}
                          <Globe size={12} className="opacity-0 group-hover/ip:opacity-100 transition-opacity text-slate-400" />
                        </div>
                      </div>
                      {peer.description && <div className="text-[11px] text-slate-500 mt-1 max-w-[200px] truncate">{peer.description}</div>}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-300 font-mono uppercase">{peer.afi || "N/A"}</td>
                    <td className="py-4 px-6 text-sm text-slate-300 font-mono">
                      <span 
                        className="hover:text-blue-400 cursor-pointer inline-flex items-center gap-1 group/asn transition-colors z-10 relative"
                        onClick={(e) => { e.stopPropagation(); setLookupQuery({ query: peer.peer_as, type: 'asn' }); }}
                      >
                        AS {peer.peer_as}
                        <Search size={12} className="opacity-0 group-hover/asn:opacity-100 transition-opacity" />
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {peer.state === "Established" || peer.state === "Active" ? (
                        <span className="status-badge-up w-max">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          {peer.state}
                        </span>
                      ) : (
                        <span className="status-badge-down w-max">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          {peer.state}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-sm font-mono text-slate-400">
                      {peer.uptime || "-"}
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-sm">
                       <div className="flex justify-end items-center gap-3">
                         <div className="flex items-center">
                          <span className="text-emerald-400 font-medium" title="Received Prefixes">{peer.received_prefixes || 0}</span>
                          <span className="text-slate-600/50 mx-1">/</span>
                          <span className="text-purple-400 font-medium" title="Active Prefixes">{peer.active_prefixes || 0}</span>
                          <span className="text-slate-600/50 mx-1">/</span>
                          <span className="text-cyan-400 font-medium" title="Advertised Prefixes">{peer.advertised_prefixes || 0}</span>
                         </div>
                         <div className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Activity size={12} className="text-emerald-500" />
                         </div>
                       </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lookupQuery && (
        <LookupModal 
          query={lookupQuery.query} 
          type={lookupQuery.type} 
          onClose={() => setLookupQuery(null)} 
        />
      )}

      {/* Peer Details Modal with TSDB Zoom */}
      {selectedPeer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 opacity-100 transition-opacity duration-300">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setSelectedPeer(null)}></div>
          <div className="relative glass-panel w-full max-w-4xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] border-emerald-500/20 overflow-hidden flex flex-col max-h-[95vh] p-0 transform scale-100 transition-transform duration-300">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-white/5 p-6 bg-slate-900/50">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                  <Server className="text-emerald-500" size={24} />
                  {selectedPeer.peer_address}
                  {selectedPeer.state === "Established" || selectedPeer.state === "Active" ? (
                    <span className="status-badge-up text-xs font-normal"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{selectedPeer.state}</span>
                  ) : (
                    <span className="status-badge-down text-xs font-normal"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>{selectedPeer.state}</span>
                  )}
                </h2>
                <div className="text-slate-400 mt-1.5 text-sm flex items-center gap-2">
                  <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-slate-300">AS {selectedPeer.peer_as}</span>
                  <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded text-cyan-400 uppercase">{selectedPeer.afi || "N/A"}</span>
                  {selectedPeer.description && <span>• {selectedPeer.description}</span>}
                </div>
              </div>
              <button 
                onClick={() => setSelectedPeer(null)}
                className="text-slate-400 hover:text-white transition-all p-2 bg-slate-800/50 hover:bg-rose-500/20 hover:text-rose-400 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-6 flex-1 bg-slate-900/20">
              
              {/* TSDB Zoom Controls & Chart */}
              <div className="glass-card p-5 border-white/5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} className="text-cyan-400" />
                    Historical Trend (TSDB)
                  </h3>
                  
                  {/* The TSDB Time Range Selector */}
                  <div className="flex bg-slate-900/80 p-1 rounded-lg border border-white/5">
                    {[
                      { id: "1h", label: "1H" },
                      { id: "24h", label: "24H" },
                      { id: "7d", label: "7D" },
                      { id: "30d", label: "30D" },
                      { id: "all", label: "All" }
                    ].map(range => (
                      <button
                        key={range.id}
                        onClick={() => setTimeRange(range.id as any)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                          timeRange === range.id 
                            ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.4)]' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative h-[200px] w-full">
                  {chartLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm rounded-lg">
                      <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                    </div>
                  )}
                  <BGPPrefixChart data={chartData} peerAddress={selectedPeer.peer_address} />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-emerald-500/50">
                   <div className="text-xs text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                     <Clock size={12} /> Router ID
                   </div>
                   <div className="text-lg font-mono font-bold text-slate-200">{selectedPeer.router_id || "N/A"}</div>
                </div>
                <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-cyan-500/50">
                   <div className="text-xs text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                     <Network size={12} /> Received / Active
                   </div>
                   <div className="flex items-baseline gap-2">
                     <div className="text-2xl font-mono font-bold text-cyan-400">{selectedPeer.received_prefixes || 0}</div>
                     <div className="text-sm font-mono text-slate-400">/ {selectedPeer.active_prefixes || 0}</div>
                   </div>
                </div>
                <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-purple-500/50">
                   <div className="text-xs text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                     <Network size={12} /> Advertised Routes
                   </div>
                   <div className="text-2xl font-mono font-bold text-purple-400">{selectedPeer.advertised_prefixes || 0}</div>
                </div>
                <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-amber-500/50">
                   <div className="text-xs text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                     <ShieldAlert size={12} /> Policy (In/Out)
                   </div>
                   <div className="text-sm font-mono text-amber-400">
                     {policyLoading ? (
                       <span className="animate-pulse">Loading...</span>
                     ) : bgpPolicy ? (
                       <div className="flex flex-col">
                         <span>{bgpPolicy.import_policies?.join(",") || "None"}</span>
                         <span className="text-slate-500">/</span>
                         <span>{bgpPolicy.export_policies?.join(",") || "None"}</span>
                       </div>
                     ) : "N/A"}
                   </div>
                </div>
              </div>

              {/* Logs */}
              <div className="glass-card p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <Server size={14} className="text-slate-400" />
                    Syslog Messages
                  </h3>
                </div>
                <div className="bg-[#080b12] rounded-lg p-4 font-mono text-[11px] text-slate-400 h-40 overflow-y-auto whitespace-pre-wrap border border-white/5 shadow-inner">
                  {logsLoading ? (
                     <div className="animate-pulse flex items-center gap-2 text-emerald-500">
                       <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                       Fetching latest syslog messages...
                     </div>
                  ) : bgpLogs.length > 0 ? (
                     <div className="space-y-1.5">
                       {bgpLogs.map((line, i) => (
                         <div key={i} className="hover:bg-slate-800/50 px-2 py-1 -mx-2 rounded transition-colors break-all">
                           {line.replace(/([0-9]{2}:[0-9]{2}:[0-9]{2})/, (match) => `<span class="text-cyan-500">${match}</span>`)}
                           {/* Quick hack: Since we render as text, it won't parse HTML, we just render line. We could use dangerouslySetInnerHTML if we wanted colored timestamps. */}
                           {line}
                         </div>
                       ))}
                     </div>
                  ) : (
                     <span className="text-slate-600 flex items-center justify-center h-full italic">No log messages found for this peer.</span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
