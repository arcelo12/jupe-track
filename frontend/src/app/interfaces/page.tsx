"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { InterfaceTrafficChart } from '@/components/charts/InterfaceTrafficChart';
import { authFetch } from '@/lib/auth';
import { DeviceStatusWidget } from '@/components/ui/DeviceStatusWidget';
import { useWebSocket } from '@/components/WebSocketProvider';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Network, Activity, Clock, ChevronRight, X } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const { interfaces: rawInterfaces, isConnected } = useWebSocket();
  
  const [groups, setGroups] = useState<PhysicalGroup[]>([]);
  const loading = rawInterfaces.length === 0;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hoveredIface, setHoveredIface] = useState<string | null>(null);
  const [modalIface, setModalIface] = useState<string | null>(null);

  const [trafficHistory, setTrafficHistory] = useState<Record<string, TrafficData[]>>({});

  const [historyData, setHistoryData] = useState<Array<{interface_name: string; interface_type: string; points: Array<{timestamp: string; bps_in: number; bps_out: number}>}>>([]);
  const [historyHours, setHistoryHours] = useState(24);
  const [selectedIface, setSelectedIface] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [activeTab, setActiveTab] = useState('live');

  useEffect(() => {
    if (rawInterfaces.length === 0) return;
    
    const grouped: PhysicalGroup[] = [];
    let currentGroup: PhysicalGroup | null = null;
    
    for (const iface of rawInterfaces) {
      if (iface.type === 'physical') {
        currentGroup = { physical: iface, logicals: [] };
        grouped.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.logicals.push(iface);
      }
    }
    
    setGroups(grouped);
    
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTrafficHistory(prev => {
      const next = { ...prev };
      rawInterfaces.forEach(iface => {
        const in_mbps = Number((iface.bps_in / 1_000_000).toFixed(2));
        const out_mbps = Number((iface.bps_out / 1_000_000).toFixed(2));
        if (!next[iface.name]) next[iface.name] = [];
        next[iface.name] = [...next[iface.name], { time: now, in_mbps, out_mbps }].slice(-20);
      });
      return next;
    });
  }, [rawInterfaces]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (isCustomRange && customStart && customEnd) {
        params.set('start', new Date(customStart).toISOString());
        params.set('end', new Date(customEnd).toISOString());
      } else {
        params.set('hours', String(historyHours));
      }
      
      if (selectedIface) params.set('interface_name', selectedIface);
      const res = await authFetch(`/api/proxy/metrics/interfaces/history?${params}`);
      if (res.ok) setHistoryData(await res.json());
    } catch (e) {
      console.warn("Failed to fetch interface history", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyHours, selectedIface, isCustomRange, customStart, customEnd]);

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
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Interfaces</h1>
          <p className="text-slate-400 mt-1 mb-4 text-sm">Bandwidth utilization — physical and logical units.</p>
          <DeviceStatusWidget />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-[250px]">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/80 border border-white/10">
            <TabsTrigger value="live" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400">⚡ Live</TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400">📈 Historical</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="border-white/10 bg-[#0f172a]/60 backdrop-blur-md">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <select
                  value={selectedIface}
                  onChange={e => setSelectedIface(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">All interfaces</option>
                  {interfaceNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>

                <div className="flex bg-slate-900/80 p-1 rounded-md border border-white/5">
                  {([1, 6, 24, 48, 168] as const).map(h => (
                    <Button
                      key={h}
                      variant={!isCustomRange && historyHours === h ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => { setIsCustomRange(false); setHistoryHours(h); }}
                      className={`h-8 px-3 text-xs ${!isCustomRange && historyHours === h ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {h < 24 ? `${h}h` : h === 168 ? '7d' : h === 48 ? '2d' : `${h/24}d`}
                    </Button>
                  ))}
                  <Button
                    variant={isCustomRange ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setIsCustomRange(true)}
                    className={`h-8 px-3 text-xs ${isCustomRange ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Custom
                  </Button>
                </div>

                {isCustomRange && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="datetime-local"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="h-9 bg-slate-900 border-white/10 text-xs"
                    />
                    <span className="text-slate-500 text-xs">to</span>
                    <Input
                      type="datetime-local"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="h-9 bg-slate-900 border-white/10 text-xs"
                    />
                  </div>
                )}

                <Button onClick={fetchHistory} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9">
                  Apply
                </Button>
              </div>

              {historyLoading ? (
                <div className="h-[200px] flex items-center justify-center text-slate-500 animate-pulse">
                  Loading historical data...
                </div>
              ) : historyData.length === 0 ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Activity size={32} className="opacity-50 mb-2" />
                  <span className="text-sm">No historical data yet. Data will appear after the background scraper has run.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {historyData.map(iface => (
                    <Card key={iface.interface_name} className="bg-slate-900/40 border-white/5">
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-mono text-slate-200">{iface.interface_name}</CardTitle>
                        <Badge variant="outline" className="text-[10px] uppercase border-white/10 text-slate-400">
                          {iface.interface_type}
                        </Badge>
                      </CardHeader>
                      <CardContent>
                        <InterfaceTrafficChart data={iface.points} interfaceName={iface.interface_name} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'live' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {loading && groups.length === 0 ? (
            [1,2,3,4].map(i => (
              <Card key={i} className="h-80 flex items-center justify-center text-slate-500 animate-pulse bg-[#0f172a]/60 border-white/5">
                 Loading interface metrics...
              </Card>
            ))
          ) : groups.length === 0 ? (
            <Card className="col-span-full py-12 text-center text-slate-400 bg-[#0f172a]/60 border-white/5">
              No physical interfaces found for {logicalSystem}.
            </Card>
          ) : (
            groups.map(group => {
              const { physical, logicals } = group;
              const history = trafficHistory[physical.name] || [];
              const up = physical.oper_status.toLowerCase() === 'up';
              const expanded = expandedGroups.has(physical.name);
              const hasLogicals = logicals.length > 0;
              const safeName = physical.name.replace(/[/\.]/g, '-');
              
              return (
                <Card key={physical.name} className="bg-[#0f172a]/60 backdrop-blur-md border-white/10 overflow-hidden flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${up ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`}></div>
                        <div className="min-w-0">
                          <CardTitle className="text-xl font-bold font-mono text-slate-200">{physical.name}</CardTitle>
                          {physical.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{physical.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-mono">
                        <div className="text-right">
                          <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-0.5">In (Rx)</div>
                          <div className="text-blue-400 font-bold">{formatBps(physical.bps_in)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-[10px] uppercase tracking-widest mb-0.5">Out (Tx)</div>
                          <div className="text-orange-400 font-bold">{formatBps(physical.bps_out)}</div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="h-52 w-full mt-2">
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickMargin={8} minTickGap={30} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `${v}M`} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                            labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }}/>
                          <Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill={`url(#colorIn-${safeName})`} isAnimationActive={false} />
                          <Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill={`url(#colorOut-${safeName})`} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {hasLogicals && (
                      <div className="mt-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleGroup(physical.name)}
                          className="w-full justify-start text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 h-8"
                        >
                          <ChevronRight size={14} className={`mr-2 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                          {logicals.length} Logical Units
                        </Button>
                        
                        <div className={`grid transition-all duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}>
                          <div className="overflow-hidden">
                            <div className="rounded-md border border-white/5 bg-slate-900/30 overflow-hidden">
                              <Table>
                                <TableHeader className="bg-slate-900/50">
                                  <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="py-2 px-3 h-8 text-xs">Unit</TableHead>
                                    <TableHead className="py-2 px-3 h-8 text-xs text-right">In (Rx)</TableHead>
                                    <TableHead className="py-2 px-3 h-8 text-xs text-right">Out (Tx)</TableHead>
                                    <TableHead className="py-2 px-3 h-8 text-xs text-right">Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {logicals.map(li => {
                                    const liUp = li.oper_status.toLowerCase() === 'up';
                                    const isActive = li.bps_in > 0 || li.bps_out > 0;
                                    const liHistory = trafficHistory[li.name] || [];
                                    const isHovered = hoveredIface === li.name;

                                    return (
                                      <TableRow 
                                        key={li.name} 
                                        className={`border-white/5 cursor-pointer hover:bg-slate-800/60 transition-colors ${isActive ? '' : 'opacity-50 hover:opacity-100'}`}
                                        onMouseEnter={() => setHoveredIface(li.name)}
                                        onMouseLeave={() => setHoveredIface(null)}
                                        onClick={() => setModalIface(li.name)}
                                      >
                                        <TableCell className="py-2 px-3">
                                          <div className="text-slate-300 font-mono text-xs">{li.name}</div>
                                          {li.description && <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[150px]">{li.description}</div>}
                                        </TableCell>
                                        
                                        <TableCell className="py-2 px-3 text-right relative">
                                          <div className="flex flex-col items-end">
                                            <span className="text-blue-400 font-mono text-xs">{formatBps(li.bps_in)}</span>
                                            {isHovered && liHistory.length > 1 && (
                                              <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 w-32 h-12 bg-slate-950/95 rounded-md border border-slate-700/50 shadow-2xl z-20 hidden md:block animate-in fade-in slide-in-from-right-2">
                                                <div className="w-full h-full p-1 relative">
                                                  <div className="absolute inset-0 bg-blue-500/5 rounded blur-sm" />
                                                  <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={liHistory}>
                                                      <Area type="monotone" dataKey="in_mbps" stroke="#3b82f6" fillOpacity={0.2} fill="#3b82f6" strokeWidth={1.5} isAnimationActive={false} />
                                                      <Area type="monotone" dataKey="out_mbps" stroke="#f97316" fillOpacity={0.2} fill="#f97316" strokeWidth={1.5} isAnimationActive={false} />
                                                    </AreaChart>
                                                  </ResponsiveContainer>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="py-2 px-3 text-right text-orange-400 font-mono text-xs">{formatBps(li.bps_out)}</TableCell>
                                        <TableCell className="py-2 px-3 text-right">
                                          <Badge variant={liUp ? 'default' : 'destructive'} className={`text-[9px] px-1.5 py-0 ${liUp ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-none' : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border-none'}`}>
                                            {li.oper_status}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Logical Unit Traffic Dialog */}
      <Dialog open={!!modalIface} onOpenChange={(open: boolean) => !open && setModalIface(null)}>
        <DialogContent className="max-w-4xl sm:max-w-4xl md:max-w-5xl w-[95vw] md:w-full bg-slate-950/95 border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.15)] sm:rounded-2xl p-6 sm:p-8 backdrop-blur-xl">
          <DialogHeader className="mb-2 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <Activity className="text-cyan-400" size={24} />
              </div>
              <div>
                <DialogTitle className="text-2xl font-mono font-bold text-white leading-tight">{modalIface}</DialogTitle>
                <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">Live Traffic Overview</span>
              </div>
            </div>
          </DialogHeader>

          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50 shadow-[0_0_20px_rgba(34,211,238,0.4)] pointer-events-none" />

          {modalIface && (
            <div className="h-[350px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficHistory[modalIface] || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="modalColorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="modalColorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickMargin={12} minTickGap={30} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}M`} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', padding: '12px' }}
                    itemStyle={{ fontSize: '13px', fontWeight: '600' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2, strokeDasharray: '4 4' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}/>
                  <Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill={`url(#modalColorIn)`} isAnimationActive={true} animationDuration={800} />
                  <Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill={`url(#modalColorOut)`} isAnimationActive={true} animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          
          <div className="mt-6 text-center text-xs text-slate-500 bg-slate-800/30 rounded-lg p-3 border border-slate-700/50">
            <span className="text-slate-400">💡 Tip:</span> You can check the 'Historical' tab for long-term data if this router supports background scraping.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
