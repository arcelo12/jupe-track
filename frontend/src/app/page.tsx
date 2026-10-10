"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useWebSocket } from '@/components/WebSocketProvider';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Cpu, HardDrive, MemoryStick, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DeviceStatus {
  cpu_usage: number;
  memory_utilization: number;
  re_temperature: number;
  uptime_seconds: number;
  hw_model: string;
}

interface ScraperStatus {
  last_scrape_bgp: string | null;
  last_scrape_interface: string | null;
  total_bgp_records: number;
  total_interface_records: number;
}

function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(2)} Kbps`;
  return `${bps} bps`;
}

function scrapeAge(timestamp: string | null): { label: string; stale: boolean } {
  if (!timestamp) return { label: 'No data', stale: true };
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return { label: `${seconds}s ago`, stale: false };
  const minutes = Math.floor(seconds / 60);
  return { label: `${minutes}m ago`, stale: minutes >= 5 };
}

export default function Dashboard() {
  const { bgpSummary: bgpData, interfaces, isConnected, error: connectionError } = useWebSocket();
  const { refreshTrigger, refreshInterval } = useRefresh();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [deviceResponse, scraperResponse] = await Promise.all([
          authFetch('/api/proxy/metrics/device/status'),
          authFetch('/api/proxy/metrics/status'),
        ]);
        if (!mounted) return;
        if (deviceResponse.ok) setDeviceStatus(await deviceResponse.json());
        if (scraperResponse.ok) setScraperStatus(await scraperResponse.json());
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    if (refreshInterval <= 0) return () => { mounted = false; };
    const timer = window.setInterval(load, refreshInterval * 1000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [refreshTrigger, refreshInterval]);

  const upPeers = bgpData.filter(peer => peer.state === 'Established').length;
  const downPeers = bgpData.length - upPeers;
  const topInterfaces = useMemo(() => [...interfaces]
    .filter(iface => iface.type === 'physical')
    .sort((a, b) => (b.bps_in + b.bps_out) - (a.bps_in + a.bps_out))
    .slice(0, 6), [interfaces]);
  const lastScrape = scrapeAge(scraperStatus?.last_scrape_bgp ?? null);

  return (
    <div className="min-w-0 space-y-5">
      {connectionError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded border border-error/30 bg-error/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5 text-sm text-error">
            <AlertTriangle aria-hidden="true" size={18} className="shrink-0" />
            <span className="break-words">{connectionError}</span>
          </div>
          <Button variant="destructive" size="sm" onClick={() => window.location.reload()} aria-label="Retry telemetry connection">Retry</Button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Network command center / live telemetry</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl">MX204 Overview</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">Router health, BGP state, and traffic context for the current operating window.</p>
        </div>
        <div role="status" aria-live="polite" className={`flex w-fit items-center gap-2 rounded border px-3 py-2 text-xs font-semibold ${isConnected ? 'border-success/30 bg-success/10 text-success' : 'border-error/30 bg-error/10 text-error'}`}>
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
          {isConnected ? 'Live telemetry' : 'Telemetry offline'}
        </div>
      </div>

      <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="BGP Sessions" value={`${upPeers}/${bgpData.length}`} detail={downPeers ? `${downPeers} down` : 'All established'} icon={Network} danger={downPeers > 0} />
        <KpiCard label="RE CPU" value={deviceStatus ? `${deviceStatus.cpu_usage}%` : '—'} detail={deviceStatus?.hw_model || 'Loading device'} icon={Cpu} danger={(deviceStatus?.cpu_usage ?? 0) > 80} />
        <KpiCard label="Memory" value={deviceStatus ? `${deviceStatus.memory_utilization}%` : '—'} detail="Routing Engine" icon={MemoryStick} danger={(deviceStatus?.memory_utilization ?? 0) > 80} />
        <KpiCard label="Last Scrape" value={lastScrape.label} detail={lastScrape.stale ? 'Collector stale' : 'Collector healthy'} icon={Clock} danger={lastScrape.stale} />
        <KpiCard label="Stored Records" value={scraperStatus ? ((scraperStatus.total_bgp_records ?? 0) + (scraperStatus.total_interface_records ?? 0)).toLocaleString() : '—'} detail="BGP + interface" icon={HardDrive} className="min-[420px]:col-span-2 xl:col-span-1" />
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="min-w-0 overflow-hidden rounded border-outline-variant bg-surface-container-low py-0 gap-0">
          <CardHeader className="border-b border-outline-variant bg-surface-container px-5 py-4">
            <CardTitle className="flex items-center justify-between text-base text-on-surface">
              <span className="flex items-center gap-2"><Activity aria-hidden="true" size={17} className="text-primary" />Top Interface Traffic</span>
              <span className="text-[10px] font-normal uppercase tracking-widest text-on-surface-variant">Live bps</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading || interfaces.length === 0 ? (
              <EmptyState text="Waiting for interface telemetry..." />
            ) : (
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[460px]">
                  <caption className="sr-only">Top physical interfaces by current traffic</caption>
                  <TableHeader className="bg-surface-container-high">
                    <TableRow className="border-outline-variant hover:bg-transparent">
                      <TableHead>Interface</TableHead>
                      <TableHead className="text-right">Ingress</TableHead>
                      <TableHead className="text-right">Egress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topInterfaces.map(iface => (
                      <TableRow key={iface.name} className="border-outline-variant hover:bg-surface-container-high">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${iface.oper_status.toLowerCase() === 'up' ? 'bg-success' : 'bg-error'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-sm font-semibold text-on-surface">{iface.name}</p>
                              <p className="max-w-[260px] truncate text-[10px] text-on-surface-variant">{iface.description || 'No description'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-primary">
                          <span className="inline-flex items-center justify-end gap-1">
                            <ArrowDownRight aria-hidden="true" size={12} />
                            {formatBps(iface.bps_in)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-on-surface">
                          <span className="inline-flex items-center justify-end gap-1">
                            <ArrowUpRight aria-hidden="true" size={12} />
                            {formatBps(iface.bps_out)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden rounded border-outline-variant bg-surface-container-low py-0 gap-0">
          <CardHeader className="border-b border-outline-variant bg-surface-container px-5 py-4">
            <CardTitle className="flex items-center justify-between text-base text-on-surface">
              <span className="flex items-center gap-2"><Network aria-hidden="true" size={17} className="text-primary" />BGP Neighbors</span>
              <Badge aria-label={downPeers ? `${downPeers} BGP neighbors need attention` : 'All BGP neighbors healthy'} className={downPeers ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}>{downPeers ? `${downPeers} attention` : 'All healthy'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {loading || bgpData.length === 0 ? (
              <EmptyState text="Waiting for BGP telemetry..." />
            ) : (
              <ScrollArea className="h-[365px] pr-3">
                <div className="space-y-2">
                  {bgpData.map(peer => {
                    const established = peer.state === 'Established';
                    return (
                      <div key={`${peer.peer_address}-${peer.afi}`} className="flex min-w-0 items-center justify-between gap-3 rounded border border-outline-variant bg-surface-container px-3 py-2.5 hover:border-primary/30">
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${established ? 'bg-success' : 'bg-error'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-sm font-semibold text-on-surface">{peer.peer_address}</p>
                            <p className="truncate text-[10px] uppercase tracking-wider text-on-surface-variant">AS {peer.peer_as} · {peer.afi || 'unknown'}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge className={established ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}>{peer.state}</Badge>
                          <p className="mt-1 font-mono text-[10px] text-on-surface-variant">{peer.received_prefixes || 0} prefixes</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, detail, icon: Icon, danger = false, className = '' }: { label: string; value: string; detail: string; icon: React.ElementType; danger?: boolean; className?: string }) {
  return (
    <Card className={`min-w-0 rounded border py-0 gap-0 ${danger ? 'border-error/30 bg-error/10' : 'border-outline-variant bg-surface-container-low'} ${className}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${danger ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}>
          <Icon aria-hidden="true" size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
          <p className={`truncate font-mono text-xl font-bold ${danger ? 'text-error' : 'text-on-surface'}`}>{value}</p>
          <p className="truncate text-[10px] text-on-surface-variant">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div role="status" aria-live="polite" className="flex min-h-44 items-center justify-center px-4 text-center text-xs text-on-surface-variant">{text}</div>;
}
