"use client";

import React, { useState, useEffect } from 'react';
import { useWebSocket } from '@/components/WebSocketProvider';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { LayoutGrid, Check, Settings2, GripVertical, AlertTriangle, ArrowUpRight, ArrowDownLeft, Cpu, HardDrive, Thermometer, Clock } from 'lucide-react';

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

  // Drag and Drop States
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Fetch device stats
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

  // Load layout from LocalStorage
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

  const resetLayout = () => {
    saveLayout(DEFAULT_WIDGETS);
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

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

  // Calculations for Widgets
  const upBgpPeers = bgpData.filter(p => p.state === "Established" || p.state === "Active").length;
  const downBgpPeers = bgpData.length - upBgpPeers;
  const loading = bgpData.length === 0 && !isConnected;

  // Sorting interfaces by total throughput (bps_in + bps_out)
  const topInterfaces = [...rawInterfaces]
    .filter(i => i.type === 'physical')
    .sort((a, b) => (b.bps_in + b.bps_out) - (a.bps_in + a.bps_out))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2.5 text-rose-300 text-sm">
            <AlertTriangle size={18} className="text-rose-400" />
            {connectionError}
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header and Toggle Edit Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            MX204 Dashboard
          </h1>
          <p className="text-slate-400 mt-1">Real-time customizable view of system stats, traffic, and BGP status.</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-all duration-300 ${
              isEditMode 
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/5'
            }`}
          >
            <Settings2 size={16} />
            {isEditMode ? "Done Editing" : "Customize Layout"}
          </button>
          {isEditMode && (
            <button
              onClick={resetLayout}
              className="px-3 py-2 text-xs border border-white/5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              Reset Layout
            </button>
          )}
        </div>
      </div>

      {/* Edit Widget Visibility Panel */}
      {isEditMode && (
        <div className="glass-panel border-emerald-500/20 bg-emerald-500/5 p-4 rounded-2xl animate-fade-in space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <LayoutGrid size={16} />
            Toggle Widget Visibility
          </div>
          <div className="flex flex-wrap gap-2.5">
            {widgets.map((w: Widget) => (
              <button
                key={w.id}
                onClick={() => toggleWidget(w.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  w.visible
                    ? 'bg-slate-800/80 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-900/40 text-slate-500 border-white/5'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                  w.visible ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700'
                }`}>
                  {w.visible && <Check size={10} strokeWidth={4} />}
                </div>
                {w.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Customizable Dashboard Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[400px]">
        {widgets
          .filter((w: Widget) => w.visible)
          .map((w: Widget) => {
            const isDragged = draggedId === w.id;
            
            return (
              <div
                key={w.id}
                draggable={isEditMode}
                onDragStart={(e) => handleDragStart(e, w.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, w.id)}
                className={`group flex flex-col relative bg-[#0f172a]/40 border rounded-2xl p-5 shadow-lg transition-all duration-300 ${
                  isEditMode 
                    ? 'border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.05)] cursor-grab active:cursor-grabbing' 
                    : 'border-white/5'
                } ${isDragged ? 'opacity-20' : ''}`}
              >
                {/* Drag Handle Indicator */}
                {isEditMode && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-emerald-400 transition-colors">
                    <GripVertical size={14} />
                    Drag to reorder
                  </div>
                )}

                {/* Widget 1: CPU & RAM Gauges */}
                {w.id === 'device_resources' && (
                  <div className="space-y-5 flex-1 flex flex-col justify-between">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      <Cpu size={18} className="text-emerald-400" />
                      RE System Resources
                    </h2>
                    {statusLoading || !deviceStatus ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading system statistics...</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 items-center">
                        {/* CPU usage bar */}
                        <div className="glass-card flex flex-col justify-between p-3.5 min-h-[85px]">
                          <div className="flex justify-between items-center text-slate-400 text-xs">
                            <span className="font-semibold">CPU Usage</span>
                            <span className="font-mono text-emerald-400 font-bold">{deviceStatus.cpu_usage}%</span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${deviceStatus.cpu_usage}%` }} />
                          </div>
                        </div>

                        {/* Memory usage bar */}
                        <div className="glass-card flex flex-col justify-between p-3.5 min-h-[85px]">
                          <div className="flex justify-between items-center text-slate-400 text-xs">
                            <span className="font-semibold">Memory Utilization</span>
                            <span className="font-mono text-cyan-400 font-bold">{deviceStatus.memory_utilization}%</span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
                            <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${deviceStatus.memory_utilization}%` }} />
                          </div>
                        </div>

                        {/* Temperature status */}
                        <div className="glass-card flex items-center gap-3 p-3.5">
                          <Thermometer size={20} className="text-amber-500" />
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Router Temp</p>
                            <p className="text-sm font-semibold text-slate-200 font-mono mt-0.5">{deviceStatus.re_temperature}°C</p>
                          </div>
                        </div>

                        {/* Uptime status */}
                        <div className="glass-card flex items-center gap-3 p-3.5">
                          <Clock size={20} className="text-purple-500" />
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Uptime</p>
                            <p className="text-sm font-semibold text-slate-200 font-mono mt-0.5">{formatUptime(deviceStatus.uptime_seconds)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Widget 2: BGP Peer Summary */}
                {w.id === 'bgp_summary' && (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      <LayoutGrid size={18} className="text-emerald-400" />
                      BGP Peer Overview
                    </h2>
                    {loading ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading BGP states...</div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 flex-1 items-center">
                        <div className="glass-card p-3.5 text-center flex flex-col justify-center min-h-[90px]">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">Total Peers</span>
                          <span className="text-2xl font-bold font-mono text-slate-200">{bgpData.length}</span>
                        </div>
                        <div className="glass-card p-3.5 text-center flex flex-col justify-center min-h-[90px] border-emerald-500/10">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">Peers Up</span>
                          <span className="text-2xl font-bold font-mono text-emerald-400">{upBgpPeers}</span>
                        </div>
                        <div className="glass-card p-3.5 text-center flex flex-col justify-center min-h-[90px] border-rose-500/10">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">Peers Down</span>
                          <span className="text-2xl font-bold font-mono text-rose-400">{downBgpPeers}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Widget 3: Top Interfaces */}
                {w.id === 'top_interfaces' && (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      <ArrowUpRight size={18} className="text-emerald-400" />
                      Top Bandwidth Interfaces
                    </h2>
                    {rawInterfaces.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Waiting for interface data...</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-white/5 text-slate-500">
                              <th className="py-2">Interface</th>
                              <th className="py-2 text-right">In (Rx)</th>
                              <th className="py-2 text-right">Out (Tx)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topInterfaces.map(iface => (
                              <tr key={iface.name} className="border-b border-white/5 last:border-0 hover:bg-slate-800/20">
                                <td className="py-2 font-semibold text-slate-300 flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${iface.oper_status.toLowerCase() === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  {iface.name}
                                </td>
                                <td className="py-2 text-right text-blue-400">{formatBps(iface.bps_in)}</td>
                                <td className="py-2 text-right text-orange-400">{formatBps(iface.bps_out)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Widget 4: BGP Peers Grid */}
                {w.id === 'bgp_peers_grid' && (
                  <div className="space-y-4 col-span-full">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      <HardDrive size={18} className="text-emerald-400" />
                      BGP Neighbors List
                    </h2>
                    {loading ? (
                      <div className="py-8 text-center text-slate-500 text-xs animate-pulse">Loading neighbors list...</div>
                    ) : bgpData.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-xs">No BGP neighbors configured or active.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                        {bgpData.map((peer, idx) => (
                          <div key={idx} className="glass-card p-3 flex items-center justify-between hover:border-emerald-500/10 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                peer.state === 'Established' 
                                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                                  : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                              }`} />
                              <div className="min-w-0">
                                <p className="text-xs font-bold font-mono text-slate-300 truncate">{peer.peer_address}</p>
                                <p className="text-[10px] text-slate-500 font-mono">AS {peer.peer_as}</p>
                              </div>
                            </div>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-medium">
                              {peer.state}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
