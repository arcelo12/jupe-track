"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowDownRight, ArrowUpRight, ChevronRight, Clock, LayoutGrid, LayoutList, Network } from 'lucide-react';

import { useRefresh } from '@/components/RefreshProvider';
import { useWebSocket } from '@/components/WebSocketProvider';
import { InterfaceTrafficChart } from '@/components/charts/InterfaceTrafficChart';
import { authFetch } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CHART_AXIS, CHART_GRID, CHART_IN, CHART_OUT, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from '@/lib/chart-colors';

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

interface HistoryInterface {
  interface_name: string;
  interface_type: string;
  points: Array<{ timestamp: string; bps_in: number; bps_out: number }>;
}

function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function isUp(iface: InterfaceInfo): boolean {
  return iface.oper_status.toLowerCase() === 'up';
}

export default function InterfacesDashboard() {
  const { logicalSystem } = useRefresh();
  const { interfaces: rawInterfaces } = useWebSocket();
  const [selectedPhysical, setSelectedPhysical] = useState<string>('');
  const [modalIface, setModalIface] = useState<string | null>(null);
  const [trafficHistory, setTrafficHistory] = useState<Record<string, TrafficData[]>>({});
  const [historyData, setHistoryData] = useState<HistoryInterface[]>([]);
  const [historyHours, setHistoryHours] = useState(24);
  const [selectedIface, setSelectedIface] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState('live');
  const [viewMode, setViewMode] = useState<'compact' | 'classic'>('compact');
  const [expandedClassic, setExpandedClassic] = useState<Set<string>>(new Set());
  const [hoveredIface, setHoveredIface] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('junos-interfaces-view');
    if (saved === 'classic' || saved === 'compact') setViewMode(saved);
  }, []);

  const changeViewMode = (mode: 'compact' | 'classic') => {
    setViewMode(mode);
    localStorage.setItem('junos-interfaces-view', mode);
  };

  const toggleClassic = (name: string) => {
    setExpandedClassic(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const groups = useMemo<PhysicalGroup[]>(() => {
    const result: PhysicalGroup[] = [];
    let current: PhysicalGroup | null = null;
    for (const iface of rawInterfaces) {
      if (iface.type === 'physical') {
        current = { physical: iface, logicals: [] };
        result.push(current);
      } else if (current) {
        current.logicals.push(iface);
      }
    }
    return result;
  }, [rawInterfaces]);

  useEffect(() => {
    if (!selectedPhysical && groups[0]) setSelectedPhysical(groups[0].physical.name);
  }, [groups, selectedPhysical]);

  useEffect(() => {
    if (rawInterfaces.length === 0) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTrafficHistory(prev => {
      const next = { ...prev };
      for (const iface of rawInterfaces) {
        const in_mbps = Number((iface.bps_in / 1_000_000).toFixed(2));
        const out_mbps = Number((iface.bps_out / 1_000_000).toFixed(2));
        next[iface.name] = [...(next[iface.name] || []), { time: now, in_mbps, out_mbps }].slice(-30);
      }
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
    } catch (error) {
      console.warn('Failed to fetch interface history', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyHours, selectedIface, isCustomRange, customStart, customEnd]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  const selectedGroup = groups.find(group => group.physical.name === selectedPhysical) || groups[0];
  const physicalIfaces = groups.map(group => group.physical);
  const totalIn = physicalIfaces.reduce((sum, iface) => sum + iface.bps_in, 0);
  const totalOut = physicalIfaces.reduce((sum, iface) => sum + iface.bps_out, 0);
  const upCount = physicalIfaces.filter(isUp).length;
  const interfaceNames = physicalIfaces.map(iface => iface.name);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Logical system: {logicalSystem}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary">Interfaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">Physical ports, logical units, live throughput, historical trend.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {activeTab === 'live' && (
            <div className="flex rounded-xl border border-border bg-muted p-1">
              {(['compact', 'classic'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => changeViewMode(mode)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === mode ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mode === 'compact' ? <LayoutList size={13} /> : <LayoutGrid size={13} />}
                  {mode}
                </button>
              ))}
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-[220px]">
            <TabsList className="grid w-full grid-cols-2 rounded-xl border border-border bg-muted">
              <TabsTrigger value="live" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Live</TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Historical</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Physical Up" value={`${upCount}/${physicalIfaces.length}`} detail="oper status" icon={Network} danger={upCount !== physicalIfaces.length} />
        <Kpi label="Ingress" value={formatBps(totalIn)} detail="physical aggregate" icon={ArrowDownRight} />
        <Kpi label="Egress" value={formatBps(totalOut)} detail="physical aggregate" icon={ArrowUpRight} />
        <Kpi label="Logical Units" value={groups.reduce((sum, group) => sum + group.logicals.length, 0).toString()} detail="subinterfaces" icon={Activity} />
      </section>

      {activeTab === 'history' ? (
        <HistoryPanel
          interfaceNames={interfaceNames}
          selectedIface={selectedIface}
          setSelectedIface={setSelectedIface}
          historyHours={historyHours}
          setHistoryHours={setHistoryHours}
          isCustomRange={isCustomRange}
          setIsCustomRange={setIsCustomRange}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
          historyLoading={historyLoading}
          historyData={historyData}
          fetchHistory={fetchHistory}
        />
      ) : viewMode === 'classic' ? (
        <ClassicView
          groups={groups}
          logicalSystem={logicalSystem}
          loading={rawInterfaces.length === 0}
          trafficHistory={trafficHistory}
          expandedGroups={expandedClassic}
          toggleGroup={toggleClassic}
          hoveredIface={hoveredIface}
          setHoveredIface={setHoveredIface}
          setModalIface={setModalIface}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]">
          <Card className="overflow-hidden rounded-xl border-border bg-card shadow-xs">
            <CardHeader className="border-b border-border bg-muted/40 px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-base text-foreground"><Network size={17} className="text-primary" />Physical Interfaces</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {groups.length === 0 ? (
                <EmptyState text="No physical interfaces found." />
              ) : (
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>Interface</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map(group => {
                      const active = selectedGroup?.physical.name === group.physical.name;
                      return (
                        <TableRow key={group.physical.name} onClick={() => setSelectedPhysical(group.physical.name)} className={`cursor-pointer border-border hover:bg-muted ${active ? 'bg-primary/10' : ''}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className={`h-2 w-2 rounded-full ${isUp(group.physical) ? 'bg-primary' : 'bg-error'}`} />
                              <div className="min-w-0">
                                <p className="font-mono text-sm font-semibold text-foreground">{group.physical.name}</p>
                                <p className="max-w-[220px] truncate text-[10px] text-muted-foreground">{group.physical.description || `${group.logicals.length} logical units`}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-primary">{formatBps(group.physical.bps_in)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-foreground">{formatBps(group.physical.bps_out)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl border-border bg-card shadow-xs">
            <CardHeader className="border-b border-border bg-muted/40 px-5 py-4">
              <CardTitle className="flex items-center justify-between text-base text-foreground">
                <span className="flex items-center gap-2"><Activity size={17} className="text-primary" />{selectedGroup?.physical.name || 'Interface Detail'}</span>
                {selectedGroup && <Badge className={isUp(selectedGroup.physical) ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}>{selectedGroup.physical.oper_status}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              {!selectedGroup ? (
                <EmptyState text="Select an interface." />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Ingress" value={formatBps(selectedGroup.physical.bps_in)} tone="primary" />
                    <Metric label="Egress" value={formatBps(selectedGroup.physical.bps_out)} tone="secondary" />
                  </div>

                  <div className="h-64 rounded-xl border border-border bg-muted/40 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trafficHistory[selectedGroup.physical.name] || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="liveIfaceIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_IN} stopOpacity={0.35}/><stop offset="95%" stopColor={CHART_IN} stopOpacity={0}/></linearGradient>
                          <linearGradient id="liveIfaceOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_OUT} stopOpacity={0.35}/><stop offset="95%" stopColor={CHART_OUT} stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                        <XAxis dataKey="time" stroke={CHART_AXIS} fontSize={10} tickMargin={8} minTickGap={30} tickLine={false} axisLine={false} />
                        <YAxis stroke={CHART_AXIS} fontSize={10} tickFormatter={(v) => `${v}M`} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: CHART_TOOLTIP_BG, borderColor: CHART_TOOLTIP_BORDER, borderRadius: '4px' }} itemStyle={{ fontSize: '12px' }} labelStyle={{ color: CHART_AXIS, fontSize: '10px' }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }}/>
                        <Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke={CHART_IN} strokeWidth={2} fillOpacity={1} fill="url(#liveIfaceIn)" isAnimationActive={false} />
                        <Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke={CHART_OUT} strokeWidth={2} fillOpacity={1} fill="url(#liveIfaceOut)" isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                      <span>Logical Units</span>
                      <span>{selectedGroup.logicals.length}</span>
                    </div>
                    {selectedGroup.logicals.length === 0 ? (
                      <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">No logical units under this physical interface.</div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
                        <Table>
                          <TableBody>
                            {selectedGroup.logicals.map(unit => (
                              <TableRow key={unit.name} onClick={() => setModalIface(unit.name)} className="cursor-pointer border-border hover:bg-muted">
                                <TableCell className="font-mono text-xs text-foreground">{unit.name}<p className="max-w-[220px] truncate text-[10px] text-muted-foreground">{unit.description || 'No description'}</p></TableCell>
                                <TableCell className="text-right font-mono text-xs text-primary">{formatBps(unit.bps_in)}</TableCell>
                                <TableCell className="text-right font-mono text-xs text-foreground">{formatBps(unit.bps_out)}</TableCell>
                                <TableCell className="text-right"><ChevronRight size={14} className="ml-auto text-muted-foreground" /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={!!modalIface} onOpenChange={(open: boolean) => !open && setModalIface(null)}>
        <DialogContent className="w-[95vw] max-w-5xl rounded-xl border-border bg-card p-6 shadow-xs">
          <DialogHeader>
            <DialogTitle className="font-mono text-2xl font-bold text-foreground">{modalIface}</DialogTitle>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Live logical-unit traffic</p>
          </DialogHeader>
          {modalIface && (
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficHistory[modalIface] || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="time" stroke={CHART_AXIS} fontSize={11} tickMargin={12} minTickGap={30} tickLine={false} axisLine={false} />
                  <YAxis stroke={CHART_AXIS} fontSize={11} tickFormatter={(v) => `${v}M`} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: CHART_TOOLTIP_BG, borderColor: CHART_TOOLTIP_BORDER, borderRadius: '4px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}/>
                  <Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke={CHART_IN} strokeWidth={3} fill={CHART_IN} fillOpacity={0.18} isAnimationActive />
                  <Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke={CHART_OUT} strokeWidth={3} fill={CHART_OUT} fillOpacity={0.12} isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassicView({ groups, logicalSystem, loading, trafficHistory, expandedGroups, toggleGroup, hoveredIface, setHoveredIface, setModalIface }: { groups: PhysicalGroup[]; logicalSystem: string; loading: boolean; trafficHistory: Record<string, TrafficData[]>; expandedGroups: Set<string>; toggleGroup: (name: string) => void; hoveredIface: string | null; setHoveredIface: (name: string | null) => void; setModalIface: (name: string) => void }) {
  if (loading && groups.length === 0) {
    return <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{[1, 2, 3, 4].map(item => <Card key={item} className="flex h-80 items-center justify-center rounded-xl border-border bg-card text-muted-foreground shadow-xs animate-pulse">Loading interface metrics...</Card>)}</div>;
  }
  if (groups.length === 0) return <Card className="rounded-xl border-border bg-card py-12 text-center text-muted-foreground shadow-xs">No physical interfaces found for {logicalSystem}.</Card>;

  return <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{groups.map(group => {
    const { physical, logicals } = group;
    const history = trafficHistory[physical.name] || [];
    const up = isUp(physical);
    const expanded = expandedGroups.has(physical.name);
    const safeName = physical.name.replace(/[/\\.]/g, '-');
    return <Card key={physical.name} className="flex flex-col overflow-hidden rounded-xl border-border bg-card shadow-xs">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><div className={`h-3 w-3 shrink-0 rounded-full ${up ? 'bg-primary' : 'bg-error'}`} /><div className="min-w-0"><CardTitle className="font-mono text-xl font-bold text-foreground">{physical.name}</CardTitle>{physical.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{physical.description}</p>}</div></div>
          <div className="flex items-center gap-4 font-mono text-sm"><div className="text-right"><div className="mb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">In (Rx)</div><div className="font-bold text-primary">{formatBps(physical.bps_in)}</div></div><div className="text-right"><div className="mb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">Out (Tx)</div><div className="font-bold text-foreground">{formatBps(physical.bps_out)}</div></div></div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="mt-2 h-52 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id={`colorIn-${safeName}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_IN} stopOpacity={0.3}/><stop offset="95%" stopColor={CHART_IN} stopOpacity={0}/></linearGradient><linearGradient id={`colorOut-${safeName}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_OUT} stopOpacity={0.3}/><stop offset="95%" stopColor={CHART_OUT} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false}/><XAxis dataKey="time" stroke={CHART_AXIS} fontSize={10} tickMargin={8} minTickGap={30} tickLine={false} axisLine={false}/><YAxis stroke={CHART_AXIS} fontSize={10} tickFormatter={v => `${v}M`} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ backgroundColor: CHART_TOOLTIP_BG, borderColor: CHART_TOOLTIP_BORDER, borderRadius: '4px', padding: '8px' }} itemStyle={{ fontSize: '12px', fontWeight: 'bold' }} labelStyle={{ color: CHART_AXIS, fontSize: '10px', marginBottom: '4px' }}/><Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }}/><Area type="monotone" dataKey="in_mbps" name="Ingress Mbps" stroke={CHART_IN} strokeWidth={2} fillOpacity={1} fill={`url(#colorIn-${safeName})`} isAnimationActive={false}/><Area type="monotone" dataKey="out_mbps" name="Egress Mbps" stroke={CHART_OUT} strokeWidth={2} fillOpacity={1} fill={`url(#colorOut-${safeName})`} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
        {logicals.length > 0 && <div className="mt-auto"><Button variant="ghost" size="sm" onClick={() => toggleGroup(physical.name)} className="h-8 w-full justify-start rounded text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"><ChevronRight size={14} className={`mr-2 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />{logicals.length} Logical Units</Button><div className={`grid transition-all duration-300 ease-in-out ${expanded ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}><div className="overflow-hidden"><div className="overflow-x-auto rounded-xl border border-border bg-muted/40"><Table><TableHeader className="border-b border-border bg-muted"><TableRow className="border-border hover:bg-transparent"><TableHead className="h-8 px-3 py-2 text-xs text-muted-foreground">Unit</TableHead><TableHead className="h-8 px-3 py-2 text-right text-xs text-muted-foreground">In (Rx)</TableHead><TableHead className="h-8 px-3 py-2 text-right text-xs text-muted-foreground">Out (Tx)</TableHead><TableHead className="h-8 px-3 py-2 text-right text-xs text-muted-foreground">Status</TableHead></TableRow></TableHeader><TableBody>{logicals.map(unit => {
          const unitHistory = trafficHistory[unit.name] || [];
          return <TableRow key={unit.name} onMouseEnter={() => setHoveredIface(unit.name)} onMouseLeave={() => setHoveredIface(null)} onClick={() => setModalIface(unit.name)} className={`cursor-pointer border-border transition-colors hover:bg-muted ${unit.bps_in > 0 || unit.bps_out > 0 ? '' : 'opacity-50 hover:opacity-100'}`}><TableCell className="px-3 py-2"><div className="font-mono text-xs text-foreground">{unit.name}</div>{unit.description && <div className="mt-0.5 max-w-[150px] truncate text-[10px] text-muted-foreground">{unit.description}</div>}</TableCell><TableCell className="relative px-3 py-2 text-right"><span className="font-mono text-xs text-primary">{formatBps(unit.bps_in)}</span>{hoveredIface === unit.name && unitHistory.length > 1 && <div className="absolute right-full top-1/2 z-20 mr-2 hidden h-12 w-32 -translate-y-1/2 rounded-xl border border-border bg-card md:block"><ResponsiveContainer width="100%" height="100%"><AreaChart data={unitHistory}><Area type="monotone" dataKey="in_mbps" stroke={CHART_IN} fill={CHART_IN} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false}/><Area type="monotone" dataKey="out_mbps" stroke={CHART_OUT} fill={CHART_OUT} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>}</TableCell><TableCell className="px-3 py-2 text-right font-mono text-xs text-foreground">{formatBps(unit.bps_out)}</TableCell><TableCell className="px-3 py-2 text-right"><Badge className={isUp(unit) ? 'border-none bg-primary/20 text-primary' : 'border-none bg-error/20 text-error'}>{unit.oper_status}</Badge></TableCell></TableRow>;
        })}</TableBody></Table></div></div></div></div>}
      </CardContent>
    </Card>;
  })}</div>;
}

function Kpi({ label, value, detail, icon: Icon, danger = false }: { label: string; value: string; detail: string; icon: React.ElementType; danger?: boolean }) {
  return (
    <Card className={`rounded-xl border shadow-xs ${danger ? 'border-error/30 bg-error/10' : 'border-border bg-card'}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${danger ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}><Icon size={17} /></div>
        <div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className={`truncate font-mono text-xl font-bold ${danger ? 'text-error' : 'text-foreground'}`}>{value}</p><p className="truncate text-[10px] text-muted-foreground">{detail}</p></div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'secondary' }) {
  return <div className="rounded-xl border border-border bg-muted/40 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p><p className={`mt-1 font-mono text-xl font-bold ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>{value}</p></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-44 items-center justify-center text-xs text-muted-foreground">{text}</div>;
}

function HistoryPanel({ interfaceNames, selectedIface, setSelectedIface, historyHours, setHistoryHours, isCustomRange, setIsCustomRange, customStart, setCustomStart, customEnd, setCustomEnd, historyLoading, historyData, fetchHistory }: {
  interfaceNames: string[];
  selectedIface: string;
  setSelectedIface: (value: string) => void;
  historyHours: number;
  setHistoryHours: (value: number) => void;
  isCustomRange: boolean;
  setIsCustomRange: (value: boolean) => void;
  customStart: string;
  setCustomStart: (value: string) => void;
  customEnd: string;
  setCustomEnd: (value: string) => void;
  historyLoading: boolean;
  historyData: HistoryInterface[];
  fetchHistory: () => void;
}) {
  return (
    <Card className="rounded-xl border-border bg-card shadow-xs">
      <CardContent className="p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <select value={selectedIface} onChange={e => setSelectedIface(e.target.value)} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary">
            <option value="">All interfaces</option>
            {interfaceNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <div className="flex rounded-xl border border-border bg-muted/40 p-1">
            {([1, 6, 24, 48, 168] as const).map(hours => (
              <Button key={hours} variant={!isCustomRange && historyHours === hours ? 'secondary' : 'ghost'} size="sm" onClick={() => { setIsCustomRange(false); setHistoryHours(hours); }} className={`h-8 px-3 text-xs ${!isCustomRange && historyHours === hours ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {hours < 24 ? `${hours}h` : hours === 168 ? '7d' : hours === 48 ? '2d' : '1d'}
              </Button>
            ))}
            <Button variant={isCustomRange ? 'secondary' : 'ghost'} size="sm" onClick={() => setIsCustomRange(true)} className={`h-8 px-3 text-xs ${isCustomRange ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Custom</Button>
          </div>
          {isCustomRange && (
            <div className="flex items-center gap-2">
              <Input type="datetime-local" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 border-border bg-muted/40 text-xs" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="datetime-local" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 border-border bg-muted/40 text-xs" />
            </div>
          )}
          <Button onClick={fetchHistory} size="sm" className="h-9 rounded-lg bg-primary text-on-primary hover:bg-primary-hover">Apply</Button>
        </div>

        {historyLoading ? (
          <div className="flex h-[220px] items-center justify-center text-muted-foreground"><Clock size={16} className="mr-2 animate-pulse" />Loading historical data...</div>
        ) : historyData.length === 0 ? (
          <EmptyState text="No historical data yet. Data appears after the background scraper has run." />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {historyData.map(iface => (
              <Card key={iface.interface_name} className="rounded-xl border-border bg-muted/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-mono text-sm text-foreground">{iface.interface_name}</CardTitle>
                  <Badge variant="outline" className="rounded-xl border-border text-[10px] uppercase text-muted-foreground">{iface.interface_type}</Badge>
                </CardHeader>
                <CardContent><InterfaceTrafficChart data={iface.points} interfaceName={iface.interface_name} /></CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
