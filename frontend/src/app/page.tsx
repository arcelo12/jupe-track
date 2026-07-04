"use client";

import React, { useState, useEffect } from 'react';
import { useWebSocket } from '@/components/WebSocketProvider';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { LayoutGrid, Check, Settings2, GripVertical, AlertTriangle, ArrowUpRight, Cpu, HardDrive, Thermometer, Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Widget {
  id: string;
  title: string;
  visible: boolean;
}

interface DeviceStatus {
  cpu_usage: number;
  memory_utilization: number;
  re_temperature: number;
  uptime_seconds: number;
  hw_model: string;
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'device_resources', title: 'Resource Gauges', visible: true },
  { id: 'bgp_summary', title: 'BGP Peer Summary', visible: true },
  { id: 'top_interfaces', title: 'Top Interfaces (Throughput)', visible: true },
  { id: 'bgp_peers_grid', title: 'BGP Peer Cards', visible: true },
];

function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(2)} Kbps`;
  return `${bps} bps`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function Dashboard() {
  const { bgpSummary: bgpData, interfaces: rawInterfaces, isConnected, error: connectionError } = useWebSocket();
  const { refreshTrigger, refreshInterval } = useRefresh();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await authFetch('/api/proxy/metrics/device/status');
        if (res.ok && mounted) {
          setDeviceStatus(await res.json());
        }
      } catch (e) {
        console.warn("Failed to fetch device status", e);
      } finally {
        if (mounted) setStatusLoading(false);
      }
    };

    fetchStatus();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchStatus, refreshInterval * 1000);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }
  }, [refreshTrigger, refreshInterval]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('junos-dashboard-layout');
      if (cached) {
        setWidgets(JSON.parse(cached));
      } else {
        setWidgets(DEFAULT_WIDGETS);
      }
    } catch {
      setWidgets(DEFAULT_WIDGETS);
    }
  }, []);

  const saveLayout = (newWidgets: Widget[]) => {
    setWidgets(newWidgets);
    try {
      localStorage.setItem('junos-dashboard-layout', JSON.stringify(newWidgets));
    } catch {}
  };

  const toggleWidget = (id: string) => {
    const updated = widgets.map((w: Widget) => w.id === id ? { ...w, visible: !w.visible } : w);
    saveLayout(updated);
  };

  const resetLayout = () => saveLayout(DEFAULT_WIDGETS);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const dragIdx = widgets.findIndex((w: Widget) => w.id === draggedId);
    const dropIdx = widgets.findIndex((w: Widget) => w.id === targetId);
    const updated = [...widgets];
    const [draggedItem] = updated.splice(dragIdx, 1);
    updated.splice(dropIdx, 0, draggedItem);
    saveLayout(updated);
    setDraggedId(null);
  };

  const upBgpPeers = bgpData.filter(p => p.state === "Established" || p.state === "Active").length;
  const downBgpPeers = bgpData.length - upBgpPeers;
  const loading = bgpData.length === 0 && !isConnected;

  const topInterfaces = [...rawInterfaces]
    .filter(i => i.type === 'physical')
    .sort((a, b) => (b.bps_in + b.bps_out) - (a.bps_in + a.bps_out))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {connectionError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2.5 text-rose-300 text-sm">
            <AlertTriangle size={18} className="text-rose-400" />
            {connectionError}
          </div>
          <Button variant="destructive" size="sm" onClick={() => window.location.reload()} className="h-8">
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            MX204 Dashboard
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Real-time customizable view of system stats, traffic, and BGP status.</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            onClick={() => setIsEditMode(!isEditMode)}
            variant={isEditMode ? "default" : "outline"}
            className={`gap-2 transition-all duration-300 ${isEditMode ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'border-white/10 hover:bg-slate-800'}`}
          >
            <Settings2 size={16} />
            {isEditMode ? "Done Editing" : "Customize Layout"}
          </Button>
          {isEditMode && (
            <Button variant="ghost" onClick={resetLayout} className="text-slate-400 hover:text-white">
              Reset Layout
            </Button>
          )}
        </div>
      </div>

      {isEditMode && (
        <Card className="border-emerald-500/20 bg-emerald-500/5 animate-in fade-in slide-in-from-top-4 duration-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-4">
              <LayoutGrid size={16} />
              Toggle Widget Visibility
            </div>
            <div className="flex flex-wrap gap-2.5">
              {widgets.map((w: Widget) => (
                <Button
                  key={w.id}
                  variant="outline"
                  onClick={() => toggleWidget(w.id)}
                  className={`gap-2 text-xs h-9 transition-all ${w.visible ? 'bg-slate-800 text-emerald-400 border-emerald-500/30' : 'bg-transparent text-slate-500 border-white/10'}`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${w.visible ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700'}`}>
                    {w.visible && <Check size={12} strokeWidth={4} />}
                  </div>
                  {w.title}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[400px]">
        {widgets.filter((w: Widget) => w.visible).map((w: Widget) => {
          const isDragged = draggedId === w.id;
          
          return (
            <Card
              key={w.id}
              draggable={isEditMode}
              onDragStart={(e) => handleDragStart(e, w.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, w.id)}
              className={`group flex flex-col relative bg-[#0f172a]/60 backdrop-blur-md transition-all duration-300 ${
                isEditMode ? 'border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.1)] cursor-grab active:cursor-grabbing' : 'border-white/10 hover:border-white/20 hover:shadow-2xl'
              } ${isDragged ? 'opacity-30 border-dashed' : ''}`}
            >
              {isEditMode && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-emerald-400 transition-colors z-10">
                  <GripVertical size={14} />
                  Drag to reorder
                </div>
              )}

              {w.id === 'device_resources' && (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-slate-200">
                      <Cpu size={18} className="text-emerald-400" />
                      RE System Resources
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center">
                    {statusLoading || !deviceStatus ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading system statistics...</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 transition-all hover:bg-slate-900/80 hover:border-white/10">
                          <div className="flex justify-between items-center text-slate-400 text-xs mb-3">
                            <span className="font-semibold">CPU Usage</span>
                            <span className="font-mono text-emerald-400 font-bold">{deviceStatus.cpu_usage}%</span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${deviceStatus.cpu_usage}%` }} />
                          </div>
                        </div>

                        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 transition-all hover:bg-slate-900/80 hover:border-white/10">
                          <div className="flex justify-between items-center text-slate-400 text-xs mb-3">
                            <span className="font-semibold">Memory Utilization</span>
                            <span className="font-mono text-cyan-400 font-bold">{deviceStatus.memory_utilization}%</span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${deviceStatus.memory_utilization}%` }} />
                          </div>
                        </div>

                        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-slate-900/80 hover:border-white/10">
                          <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <Thermometer size={20} className="text-amber-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Router Temp</p>
                            <p className="text-lg font-semibold text-slate-200 font-mono mt-0.5">{deviceStatus.re_temperature}°C</p>
                          </div>
                        </div>

                        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-slate-900/80 hover:border-white/10">
                          <div className="p-2.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
                            <Clock size={20} className="text-purple-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Uptime</p>
                            <p className="text-lg font-semibold text-slate-200 font-mono mt-0.5">{formatUptime(deviceStatus.uptime_seconds)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </>
              )}

              {w.id === 'bgp_summary' && (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-slate-200">
                      <LayoutGrid size={18} className="text-emerald-400" />
                      BGP Peer Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center">
                    {loading ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading BGP states...</div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-5 text-center flex flex-col justify-center transition-all hover:bg-slate-900/80 hover:border-white/10">
                          <span className="text-xs uppercase font-bold tracking-wider text-slate-500 block mb-2">Total Peers</span>
                          <span className="text-3xl font-bold font-mono text-slate-200">{bgpData.length}</span>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 text-center flex flex-col justify-center transition-all hover:bg-emerald-500/10">
                          <span className="text-xs uppercase font-bold tracking-wider text-emerald-500/70 block mb-2">Peers Up</span>
                          <span className="text-3xl font-bold font-mono text-emerald-400">{upBgpPeers}</span>
                        </div>
                        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-5 text-center flex flex-col justify-center transition-all hover:bg-rose-500/10">
                          <span className="text-xs uppercase font-bold tracking-wider text-rose-500/70 block mb-2">Peers Down</span>
                          <span className="text-3xl font-bold font-mono text-rose-400">{downBgpPeers}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </>
              )}

              {w.id === 'top_interfaces' && (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-slate-200">
                      <ArrowUpRight size={18} className="text-emerald-400" />
                      Top Bandwidth Interfaces
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rawInterfaces.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Waiting for interface data...</div>
                    ) : (
                      <div className="border border-white/10 rounded-lg overflow-hidden bg-slate-900/30">
                        <Table>
                          <TableHeader className="bg-slate-900/50 hover:bg-slate-900/50">
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-slate-400">Interface</TableHead>
                              <TableHead className="text-right text-slate-400">In (Rx)</TableHead>
                              <TableHead className="text-right text-slate-400">Out (Tx)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topInterfaces.map(iface => (
                              <TableRow key={iface.name} className="border-white/5 hover:bg-slate-800/50 transition-colors">
                                <TableCell className="font-semibold text-slate-300 flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${iface.oper_status.toLowerCase() === 'up' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
                                  {iface.name}
                                </TableCell>
                                <TableCell className="text-right text-blue-400 font-mono text-xs">{formatBps(iface.bps_in)}</TableCell>
                                <TableCell className="text-right text-orange-400 font-mono text-xs">{formatBps(iface.bps_out)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </>
              )}

              {w.id === 'bgp_peers_grid' && (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-slate-200">
                      <HardDrive size={18} className="text-emerald-400" />
                      BGP Neighbors List
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading neighbors list...</div>
                    ) : bgpData.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-xs">No BGP neighbors configured or active.</div>
                    ) : (
                      <ScrollArea className="h-[230px] rounded-lg border border-white/5 p-3 bg-slate-900/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-4">
                          {bgpData.map((peer, idx) => (
                            <div key={idx} className="bg-slate-900/60 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-emerald-500/20 hover:bg-slate-800/80 transition-all shadow-sm">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                  peer.state === 'Established' 
                                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                    : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                                }`} />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold font-mono text-slate-200 truncate">{peer.peer_address}</p>
                                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">AS {peer.peer_as}</p>
                                </div>
                              </div>
                              <Badge variant={peer.state === 'Established' ? 'default' : 'destructive'} className={peer.state === 'Established' ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/20'}>
                                {peer.state}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
