"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { InterfaceTrafficChart } from '@/components/charts/InterfaceTrafficChart';
import { authFetch } from '@/lib/auth';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';



interface TrafficData {
  time: string;
  in_mbps: number;
  out_mbps: number;
}

interface InterfaceInfo {
  name: string;
  description: string;
  type: 'physical' | 'logical';
  admin_status: string;
  oper_status: string;
  bps_in: number;
  bps_out: number;
}

interface PhysicalGroup {
  physical: InterfaceInfo;
  logicals: InterfaceInfo[];
}

function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

export default function InterfacesDashboard() {
  const { refreshTrigger, logicalSystem } = useRefresh();
  const [groups, setGroups] = useState<PhysicalGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [hoveredIface, setHoveredIface] = useState<string | null>(null);
  const [modalIface, setModalIface] = useState<string | null>(null);

  // Rolling history for all interfaces (live mode)
  const [trafficHistory, setTrafficHistory] = useState<Record<string, TrafficData[]>>({});

  // Historical data from DB
  const [historyData, setHistoryData] = useState<Array<{interface_name: string; interface_type: string; points: Array<{timestamp: string; bps_in: number; bps_out: number}>}>>([]);
  const [historyHours, setHistoryHours] = useState(24);
  const [selectedIface, setSelectedIface] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`/api/proxy/interfaces/traffic/${logicalSystem}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error('Failed to fetch data');
      const data: InterfaceInfo[] = await res.json();
      
      // Group logicals under their physical parent
      const grouped: PhysicalGroup[] = [];
      let currentGroup: PhysicalGroup | null = null;
      
      for (const iface of data) {
        if (iface.type === 'physical') {
          currentGroup = { physical: iface, logicals: [] };
          grouped.push(currentGroup);
        } else if (currentGroup) {
          currentGroup.logicals.push(iface);
        }
      }
      
      setGroups(grouped);
      
      // Update history for all interfaces
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTrafficHistory(prev => {
        const next = { ...prev };
        data.forEach(iface => {
          const in_mbps = Number((iface.bps_in / 1_000_000).toFixed(2));
          const out_mbps = Number((iface.bps_out / 1_000_000).toFixed(2));
          if (!next[iface.name]) next[iface.name] = [];
          next[iface.name] = [...next[iface.name], { time: now, in_mbps, out_mbps }].slice(-20);
        });
        return next;
      });
      
    } catch (error) {
      console.warn("Error loading interface traffic:", error);
    } finally {
      setLoading(false);
    }
  }, [logicalSystem]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ hours: String(historyHours), limit: '300' });
      if (selectedIface) params.set('interface_name', selectedIface);
      const res = await authFetch(`/api/proxy/metrics/interfaces/history?${params}`);
      if (res.ok) setHistoryData(await res.json());
    } catch (e) {
      console.warn("Failed to fetch interface history", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyHours, selectedIface]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger, logicalSystem]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const interfaceNames = groups.map(g => g.physical.name);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interfaces</h1>
          <p className="text-slate-400 mt-1">Bandwidth utilization — physical and logical units.</p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: "flex", gap: 4,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10, padding: 4,
        }}>
          {(['live', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "0.375rem 1rem",
                borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: "0.8rem", fontWeight: 600,
                transition: "all 0.2s",
                background: activeTab === tab
                  ? "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.2))"
                  : "transparent",
                color: activeTab === tab ? "#06b6d4" : "#64748b",
                borderBottom: activeTab === tab ? "1px solid rgba(6,182,212,0.4)" : "1px solid transparent",
              }}
            >
              {tab === 'live' ? '⚡ Live' : '📈 Historical'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Historical View ─────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="glass-panel">
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <select
                value={selectedIface}
                onChange={e => setSelectedIface(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "0.5rem 0.875rem", color: "#e2e8f0",
                  fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                <option value="">All interfaces</option>
                {interfaceNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>

              {([1, 6, 24, 48, 168] as const).map(h => (
                <button
                  key={h}
                  onClick={() => setHistoryHours(h)}
                  style={{
                    padding: "0.375rem 0.75rem", borderRadius: 6, border: "none",
                    cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                    background: historyHours === h
                      ? "rgba(6,182,212,0.2)" : "rgba(255,255,255,0.05)",
                    color: historyHours === h ? "#06b6d4" : "#64748b",
                    transition: "all 0.15s",
                  }}
                >
                  {h < 24 ? `${h}h` : h === 168 ? '7d' : `${h/24}d`}
                </button>
              ))}
              <button onClick={fetchHistory} style={{
                padding: "0.375rem 0.875rem", borderRadius: 6, border: "none",
                cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                background: "rgba(6,182,212,0.15)", color: "#06b6d4",
              }}>
                Refresh
              </button>
            </div>

            {historyLoading ? (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                Loading historical data...
              </div>
            ) : historyData.length === 0 ? (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: "1.5rem" }}>📊</span>
                <span style={{ fontSize: "0.85rem" }}>No historical data yet. Data will appear after the background scraper has run.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {historyData.map(iface => (
                  <div key={iface.interface_name} style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "1rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#e2e8f0", fontSize: "0.9rem" }}>
                        {iface.interface_name}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "#475569", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                        {iface.interface_type}
                      </span>
                    </div>
                    <InterfaceTrafficChart data={iface.points} interfaceName={iface.interface_name} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Live View ───────────────────────────────────────────────────────── */}
      {activeTab === 'live' && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {loading && groups.length === 0 ? (
          [1,2,3,4].map(i => (
            <div key={i} className="glass-panel h-80 flex items-center justify-center text-slate-500 animate-pulse">
               Loading interface metrics...
            </div>
          ))
        ) : groups.length === 0 ? (
          <div className="glass-panel col-span-full py-12 text-center text-slate-400">
            No physical interfaces found for {logicalSystem}.
          </div>
        ) : (
          groups.map(group => {
            const { physical, logicals } = group;
            const history = trafficHistory[physical.name] || [];
            const up = physical.oper_status.toLowerCase() === 'up';
            const expanded = expandedGroups.has(physical.name);
            const hasLogicals = logicals.length > 0;
            const safeName = physical.name.replace(/[/\.]/g, '-');
            
            return (
              <div key={physical.name} className="glass-panel flex flex-col gap-3">
                {/* Physical Interface Header */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${up ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`}></div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold font-mono text-slate-200">{physical.name}</h2>
                      {physical.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{physical.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm font-mono">
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase">In (Rx)</div>
                      <div className="text-blue-400">{formatBps(physical.bps_in)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase">Out (Tx)</div>
                      <div className="text-orange-400">{formatBps(physical.bps_out)}</div>
                    </div>
                  </div>
                </div>

                {/* Traffic Chart */}
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`colorIn-${safeName}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id={`colorOut-${safeName}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickMargin={8} minTickGap={30} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v}M`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                        labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }}/>
                      <Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill={`url(#colorIn-${safeName})`} isAnimationActive={false} />
                      <Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill={`url(#colorOut-${safeName})`} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Logical Sub-interfaces (collapsible) */}
                {hasLogicals && (
                  <div>
                    <button
                      onClick={() => toggleGroup(physical.name)}
                      className="w-full text-left text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5 transition-colors py-1"
                    >
                      <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
                      {logicals.length} Logical Units
                    </button>
                    {expanded && (
                      <div className="mt-1 rounded-lg overflow-hidden border border-slate-700/50">
                        <table className="w-full text-xs font-mono">
                          <thead>
                            <tr className="bg-slate-800/50 text-slate-400">
                              <th className="text-left px-3 py-2">Unit</th>
                              <th className="text-right px-3 py-2">In (Rx)</th>
                              <th className="text-right px-3 py-2">Out (Tx)</th>
                              <th className="text-right px-3 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logicals.map(li => {
                              const liUp = li.oper_status.toLowerCase() === 'up';
                              const isActive = li.bps_in > 0 || li.bps_out > 0;
                              const safeLiName = li.name.replace(/[/\.]/g, '-');
                              const liHistory = trafficHistory[li.name] || [];
                              const isHovered = hoveredIface === li.name;

                              return (
                                <tr 
                                  key={li.name} 
                                  className={`border-t border-slate-700/30 transition-colors cursor-pointer hover:bg-slate-800/40 ${isActive ? '' : 'opacity-40'}`}
                                  onMouseEnter={() => setHoveredIface(li.name)}
                                  onMouseLeave={() => setHoveredIface(null)}
                                  onClick={() => setModalIface(li.name)}
                                >
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <div>
                                        <div className="text-slate-300 font-mono">{li.name}</div>
                                        {li.description && <div className="text-[10px] text-slate-500 mt-0.5">{li.description}</div>}
                                      </div>
                                    </div>
                                  </td>
                                  
                                  <td className="px-3 py-2 text-right relative">
                                    <div className="flex flex-col items-end">
                                      <span className="text-blue-400">{formatBps(li.bps_in)}</span>
                                      {/* Tiny Sparkline on hover */}
                                      {isHovered && liHistory.length > 1 && (
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-[110%] w-24 h-8 bg-slate-900/90 rounded border border-slate-700/50 overflow-hidden shadow-xl z-10 hidden md:block">
                                          <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={liHistory}>
                                              <Area type="monotone" dataKey="in_mbps" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={1} isAnimationActive={false} />
                                              <Area type="monotone" dataKey="out_mbps" stroke="#f97316" fill="#f97316" fillOpacity={0.2} strokeWidth={1} isAnimationActive={false} />
                                            </AreaChart>
                                          </ResponsiveContainer>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right text-orange-400">{formatBps(li.bps_out)}</td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${liUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                      {li.oper_status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* ── Modal Chart for Logical Units ─────────────────────────────────────── */}
      {modalIface && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="glass-panel w-full max-w-4xl animate-slide-up relative">
            <button
              onClick={() => setModalIface(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white z-10 bg-slate-800/50 rounded-full w-8 h-8 flex items-center justify-center border border-slate-700"
            >
              ✕
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl font-mono font-bold text-white">{modalIface}</span>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">Live Traffic</span>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficHistory[modalIface] || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="modalColorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="modalColorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickMargin={8} minTickGap={30} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v}M`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }}/>
                  <Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill={`url(#modalColorIn)`} isAnimationActive={false} />
                  <Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill={`url(#modalColorOut)`} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 text-center text-xs text-slate-500">
              Click the 'Historical' tab to view long-term storage data for this interface.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

