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
        <div className="bg-error/10 border border-error/30 rounded px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2.5 text-error text-sm">
            <AlertTriangle size={18} className="text-error" />
            {connectionError}
          </div>
          <Button variant="destructive" size="sm" onClick={() => window.location.reload()} className="h-8">
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-primary">
            MX204 Dashboard
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">Real-time customizable view of system stats, traffic, and BGP status.</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            onClick={() => setIsEditMode(!isEditMode)}
            variant={isEditMode ? "default" : "outline"}
            className={`gap-2 transition-all duration-300 rounded ${isEditMode ? 'bg-primary hover:bg-primary-hover text-on-primary' : 'border-[#2A2E35] hover:bg-surface-container'}`}
          >
            <Settings2 size={16} />
            {isEditMode ? "Done Editing" : "Customize Layout"}
          </Button>
          {isEditMode && (
            <Button variant="ghost" onClick={resetLayout} className="text-on-surface-variant hover:text-on-surface rounded">
              Reset Layout
            </Button>
          )}
        </div>
      </div>

      {isEditMode && (
        <Card className="border-[#2A2E35] bg-surface-container animate-in fade-in slide-in-from-top-4 duration-500 shadow-none rounded">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-primary font-bold text-sm mb-4">
              <LayoutGrid size={16} />
              Toggle Widget Visibility
            </div>
            <div className="flex flex-wrap gap-2.5">
              {widgets.map((w: Widget) => (
                <Button
                  key={w.id}
                  variant="outline"
                  onClick={() => toggleWidget(w.id)}
                  className={`gap-2 text-xs h-9 transition-all rounded ${w.visible ? 'bg-surface-container-high text-primary border-primary/30' : 'bg-transparent text-on-surface-variant border-[#2A2E35]'}`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${w.visible ? 'bg-primary border-primary text-on-primary' : 'border-[#2A2E35]'}`}>
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
              className={`group flex flex-col relative bg-surface-container-low shadow-none rounded transition-all duration-300 ${
                isEditMode ? 'border-primary/30 hover:border-primary/50 cursor-grab active:cursor-grabbing' : 'border-[#2A2E35] hover:border-primary/20'
              } ${isDragged ? 'opacity-30 border-dashed' : ''}`}
            >
              {isEditMode && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant group-hover:text-primary transition-colors z-10">
                  <GripVertical size={14} />
                  Drag to reorder
                </div>
              )}

              {w.id === 'device_resources' && (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-on-surface">
                      <Cpu size={18} className="text-primary" />
                      RE System Resources
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center">
                    {statusLoading || !deviceStatus ? (
                      <div className="py-8 text-center text-on-surface-variant text-xs animate-pulse">Loading system statistics...</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-surface-container border border-[#2A2E35] rounded p-4 transition-all hover:bg-surface-container-high">
                          <div className="flex justify-between items-center text-on-surface-variant text-xs mb-3">
                            <span className="font-semibold">CPU Usage</span>
                            <span className="font-mono text-primary font-bold">{deviceStatus.cpu_usage}%</span>
                          </div>
                          <div className="h-2 bg-surface-container-highest rounded overflow-hidden">
                            <div className="h-full bg-primary rounded transition-all duration-500" style={{ width: `${deviceStatus.cpu_usage}%` }} />
                          </div>
                        </div>

                        <div className="bg-surface-container border border-[#2A2E35] rounded p-4 transition-all hover:bg-surface-container-high">
                          <div className="flex justify-between items-center text-on-surface-variant text-xs mb-3">
                            <span className="font-semibold">Memory Utilization</span>
                            <span className="font-mono text-[#0ea5e9] font-bold">{deviceStatus.memory_utilization}%</span>
                          </div>
                          <div className="h-2 bg-surface-container-highest rounded overflow-hidden">
                            <div className="h-full bg-[#0ea5e9] rounded transition-all duration-500" style={{ width: `${deviceStatus.memory_utilization}%` }} />
                          </div>
                        </div>

                        <div className="bg-surface-container border border-[#2A2E35] rounded p-4 flex items-center gap-4 transition-all hover:bg-surface-container-high">
                          <div className="p-2.5 bg-primary/10 rounded border border-primary/20">
                            <Thermometer size={20} className="text-primary" />
                          </div>
                          <div>
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Router Temp</p>
                            <p className="text-lg font-semibold text-on-surface font-mono mt-0.5">{deviceStatus.re_temperature}°C</p>
                          </div>
                        </div>

                        <div className="bg-surface-container border border-[#2A2E35] rounded p-4 flex items-center gap-4 transition-all hover:bg-surface-container-high">
                          <div className="p-2.5 bg-[#0ea5e9]/10 rounded border border-[#0ea5e9]/20">
                            <Clock size={20} className="text-[#0ea5e9]" />
                          </div>
                          <div>
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Uptime</p>
                            <p className="text-lg font-semibold text-on-surface font-mono mt-0.5">{formatUptime(deviceStatus.uptime_seconds)}</p>
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
                    <CardTitle className="text-lg flex items-center gap-2 text-on-surface">
                      <LayoutGrid size={18} className="text-primary" />
                      BGP Peer Overview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center">
                    {loading ? (
                      <div className="py-8 text-center text-on-surface-variant text-xs animate-pulse">Loading BGP states...</div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-surface-container border border-[#2A2E35] rounded p-5 text-center flex flex-col justify-center transition-all hover:bg-surface-container-high">
                          <span className="text-xs uppercase font-bold tracking-wider text-on-surface-variant block mb-2">Total Peers</span>
                          <span className="text-3xl font-bold font-mono text-on-surface">{bgpData.length}</span>
                        </div>
                        <div className="bg-primary/10 border border-primary/20 rounded p-5 text-center flex flex-col justify-center transition-all hover:bg-primary/20">
                          <span className="text-xs uppercase font-bold tracking-wider text-primary block mb-2">Peers Up</span>
                          <span className="text-3xl font-bold font-mono text-primary">{upBgpPeers}</span>
                        </div>
                        <div className="bg-error/10 border border-error/20 rounded p-5 text-center flex flex-col justify-center transition-all hover:bg-error/20">
                          <span className="text-xs uppercase font-bold tracking-wider text-error block mb-2">Peers Down</span>
                          <span className="text-3xl font-bold font-mono text-error">{downBgpPeers}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </>
              )}

              {w.id === 'top_interfaces' && (
                <>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2 text-on-surface">
                      <ArrowUpRight size={18} className="text-primary" />
                      Top Bandwidth Interfaces
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {rawInterfaces.length === 0 ? (
                      <div className="py-8 text-center text-on-surface-variant text-xs animate-pulse">Waiting for interface data...</div>
                    ) : (
                      <div className="border border-[#2A2E35] rounded overflow-x-auto bg-surface-container">
                        <Table>
                          <TableHeader className="bg-surface-container-high">
                            <TableRow className="border-[#2A2E35] hover:bg-transparent">
                              <TableHead className="text-on-surface-variant">Interface</TableHead>
                              <TableHead className="text-right text-on-surface-variant">In (Rx)</TableHead>
                              <TableHead className="text-right text-on-surface-variant">Out (Tx)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topInterfaces.map(iface => (
                              <TableRow key={iface.name} className="border-[#2A2E35] hover:bg-surface-container-high transition-colors">
                                <TableCell className="font-semibold text-on-surface flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${iface.oper_status.toLowerCase() === 'up' ? 'bg-primary' : 'bg-error'}`} />
                                  {iface.name}
                                </TableCell>
                                <TableCell className="text-right text-primary font-mono text-xs">{formatBps(iface.bps_in)}</TableCell>
                                <TableCell className="text-right text-[#0ea5e9] font-mono text-xs">{formatBps(iface.bps_out)}</TableCell>
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
                    <CardTitle className="text-lg flex items-center gap-2 text-on-surface">
                      <HardDrive size={18} className="text-primary" />
                      BGP Neighbors List
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="py-8 text-center text-on-surface-variant text-xs animate-pulse">Loading neighbors list...</div>
                    ) : bgpData.length === 0 ? (
                      <div className="py-8 text-center text-on-surface-variant text-xs">No BGP neighbors configured or active.</div>
                    ) : (
                      <ScrollArea className="h-[230px] rounded border border-[#2A2E35] p-3 bg-surface-container">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-4">
                          {bgpData.map((peer, idx) => (
                            <div key={idx} className="bg-surface-container-low border border-[#2A2E35] rounded p-3 flex items-center justify-between hover:border-primary/20 hover:bg-surface-container-high transition-all shadow-none">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                  peer.state === 'Established' 
                                    ? 'bg-primary' 
                                    : 'bg-error'
                                }`} />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold font-mono text-on-surface truncate">{peer.peer_address}</p>
                                  <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest mt-0.5">AS {peer.peer_as}</p>
                                </div>
                              </div>
                              <Badge variant={peer.state === 'Established' ? 'default' : 'destructive'} className={peer.state === 'Established' ? 'bg-primary/10 text-primary border-none rounded' : 'bg-error/10 text-error border-none rounded'}>
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
