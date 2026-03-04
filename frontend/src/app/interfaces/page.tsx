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
  admin_status: string;
  oper_status: string;
  bps_in: number;
  bps_out: number;
}

export default function InterfacesDashboard() {
  const { refreshTrigger, logicalSystem } = useRefresh();
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Keep a history window of traffic data per interface
  // Key: interface name, Value: Array of TrafficData (max 20 items)
  const [trafficHistory, setTrafficHistory] = useState<Record<string, TrafficData[]>>({});

  const fetchData = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`/api/proxy/interfaces/traffic/${logicalSystem}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error('Failed to fetch data');
      const data: InterfaceInfo[] = await res.json();
      
      setInterfaces(data);
      
      // Update history
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setTrafficHistory(prev => {
        const next = { ...prev };
        data.forEach(iface => {
          const in_mbps = Number((iface.bps_in / 1_000_000).toFixed(2));
          const out_mbps = Number((iface.bps_out / 1_000_000).toFixed(2));
          
          if (!next[iface.name]) {
            next[iface.name] = [];
          }
          
          next[iface.name] = [
            ...next[iface.name], 
            { time: now, in_mbps, out_mbps }
          ].slice(-20); // Keep last 20 data points
        });
        return next;
      });
      
    } catch (error) {
      console.warn("Error loading interface traffic:", error);
    } finally {
      setLoading(false);
    }
  }, [logicalSystem]);

  // Handle auto-refresh triggered from context
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger, logicalSystem]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Physical Interfaces</h1>
        <p className="text-slate-400 mt-1">Real-time bandwidth utilization and status.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {loading && interfaces.length === 0 ? (
          [1,2,3,4].map(i => (
            <div key={i} className="glass-panel h-80 flex items-center justify-center text-slate-500 animate-pulse">
               Loading interface metrics...
            </div>
          ))
        ) : interfaces.length === 0 ? (
          <div className="glass-panel col-span-full py-12 text-center text-slate-400">
            No physical interfaces found for {logicalSystem}.
          </div>
        ) : (
          interfaces.map(iface => {
            const history = trafficHistory[iface.name] || [];
            const up = iface.oper_status.toLowerCase() === 'up';
            
            return (
              <div key={iface.name} className="glass-panel flex flex-col h-96">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${up ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`}></div>
                    <h2 className="text-xl font-bold font-mono text-slate-200">{iface.name}</h2>
                  </div>
                  <div className="flex gap-4 text-sm font-mono">
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase">In (Rx)</div>
                      <div className="text-blue-400">{(iface.bps_in / 1_000_000).toFixed(1)} Mbps</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px] uppercase">Out (Tx)</div>
                      <div className="text-orange-400">{(iface.bps_out / 1_000_000).toFixed(1)} Mbps</div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full mt-2 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={history}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id={`colorIn-${iface.name}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id={`colorOut-${iface.name}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickMargin={10}
                        minTickGap={30}
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={10}
                        tickFormatter={(value) => `${value} M`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                        labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                      <Area 
                        type="monotone" 
                        dataKey="in_mbps" 
                        name="Ingress Mbps" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill={`url(#colorIn-${iface.name})`} 
                        isAnimationActive={false}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="out_mbps" 
                        name="Egress Mbps" 
                        stroke="#f97316" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill={`url(#colorOut-${iface.name})`} 
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
