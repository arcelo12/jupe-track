"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
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
  
  // Rolling history for physical interfaces only
  const [trafficHistory, setTrafficHistory] = useState<Record<string, TrafficData[]>>({});

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
      
      // Update history for physical interfaces only
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTrafficHistory(prev => {
        const next = { ...prev };
        data.filter(d => d.type === 'physical').forEach(iface => {
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

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger, logicalSystem]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Interfaces</h1>
        <p className="text-slate-400 mt-1">Real-time bandwidth utilization — physical and logical units.</p>
      </div>

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
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${up ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`}></div>
                    <h2 className="text-xl font-bold font-mono text-slate-200">{physical.name}</h2>
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
                              return (
                                <tr key={li.name} className={`border-t border-slate-700/30 ${isActive ? '' : 'opacity-40'}`}>
                                  <td className="px-3 py-1.5 text-slate-300">{li.name}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-400">{formatBps(li.bps_in)}</td>
                                  <td className="px-3 py-1.5 text-right text-orange-400">{formatBps(li.bps_out)}</td>
                                  <td className="px-3 py-1.5 text-right">
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
    </div>
  );
}
