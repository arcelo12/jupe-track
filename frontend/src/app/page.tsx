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
    <div className="space-y-5">
      {connectionError && (
        <div className="flex items-center justify-between rounded border border-error/30 bg-error/10 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-error">
            <AlertTriangle size={18} />
            {connectionError}
          </div>
          <Button variant="destructive" size="sm" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Network command center</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary">MX204 Overview</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Critical router health, BGP state, and traffic in one scan.</p>
        </div>
        <div className={`flex items-center gap-2 rounded border px-3 py-2 text-xs font-semibold ${isConnected ? 'border-primary/30 bg-primary/10 text-primary' : 'border-error/30 bg-error/10 text-error'}`}>
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-primary animate-pulse' : 'bg-error'}`} />
          {isConnected ? 'Live telemetry' : 'Telemetry offline'}
        </div>
      </div>

      <section aria-label="Key performance indicators" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <KpiCard label="BGP Sessions" value={`${upPeers}/${bgpData.length}`} detail={downPeers ? `${downPeers} down` : 'All established'} icon={Network} danger={downPeers > 0} />
        <KpiCard label="RE CPU" value={deviceStatus ? `${deviceStatus.cpu_usage}%` : '—'} detail={deviceStatus?.hw_model || 'Loading device'} icon={Cpu} danger={(deviceStatus?.cpu_usage ?? 0) > 80} />
        <KpiCard label="Memory" value={deviceStatus ? `${deviceStatus.memory_utilization}%` : '—'} detail="Routing Engine" icon={MemoryStick} danger={(deviceStatus?.memory_utilization ?? 0) > 80} />
        <KpiCard label="Last Scrape" value={lastScrape.label} detail={lastScrape.stale ? 'Collector stale' : 'Collector healthy'} icon={Clock} danger={lastScrape.stale} />
        <KpiCard label="Stored Records" value={scraperStatus ? (scraperStatus.total_bgp_records + scraperStatus.total_interface_records).toLocaleString() : '—'} detail="BGP + interface" icon={HardDrive} className="col-span-2 xl:col-span-1" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <Card className="overflow-hidden rounded border-[#2A2E35] bg-surface-container-low shadow-none">
          <CardHeader className="border-b border-[#2A2E35] bg-surface-container px-5 py-4">
            <CardTitle className="flex items-center justify-between text-base text-on-surface">
              <span className="flex items-center gap-2"><Activity size={17} className="text-primary" />Top Interface Traffic</span>
              <span className="text-[10px] font-normal uppercase tracking-widest text-on-surface-variant">Live bps</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading || interfaces.length === 0 ? (
              <EmptyState text="Waiting for interface telemetry..." />
            ) : (
              <Table>
                <TableHeader className="bg-surface-container-high">
                  <TableRow className="border-[#2A2E35] hover:bg-transparent">
                    <TableHead>Interface</TableHead>
                    <TableHead className="text-right">Ingress</TableHead>
                    <TableHead className="text-right">Egress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topInterfaces.map(iface => (
                    <TableRow key={iface.name} className="border-[#2A2E35] hover:bg-surface-container-high">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className={`h-2 w-2 rounded-full ${iface.oper_status.toLowerCase() === 'up' ? 'bg-primary' : 'bg-error'}`} />
                          <div><p className="font-mono text-sm font-semibold text-on-surface">{iface.name}</p><p className="max-w-[260px] truncate text-[10px] text-on-surface-variant">{iface.description || 'No description'}</p></div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-primary"><span className="inline-flex items-center gap-1"><ArrowDownRight size={12} />{formatBps(iface.bps_in)}</span></TableCell>
                      <TableCell className="text-right font-mono text-xs text-on-surface"><span className="inline-flex items-center gap-1"><ArrowUpRight size={12} />{formatBps(iface.bps_out)}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded border-[#2A2E35] bg-surface-container-low shadow-none">
          <CardHeader className="border-b border-[#2A2E35] bg-surface-container px-5 py-4">
            <CardTitle className="flex items-center justify-between text-base text-on-surface">
              <span className="flex items-center gap-2"><Network size={17} className="text-primary" />BGP Neighbors</span>
              <Badge className={downPeers ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}>{downPeers ? `${downPeers} attention` : 'All healthy'}</Badge>
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
                      <div key={`${peer.peer_address}-${peer.afi}`} className="flex items-center justify-between gap-3 rounded border border-[#2A2E35] bg-surface-container px-3 py-2.5 hover:border-primary/30">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${established ? 'bg-primary' : 'bg-error'}`} />
                          <div className="min-w-0"><p className="truncate font-mono text-sm font-semibold text-on-surface">{peer.peer_address}</p><p className="truncate text-[10px] uppercase tracking-wider text-on-surface-variant">AS {peer.peer_as} · {peer.afi || 'unknown'}</p></div>
                        </div>
                        <div className="text-right"><Badge className={established ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}>{peer.state}</Badge><p className="mt-1 font-mono text-[10px] text-on-surface-variant">{peer.received_prefixes || 0} prefixes</p></div>
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
    <Card className={`rounded border shadow-none ${danger ? 'border-error/30 bg-error/10' : 'border-[#2A2E35] bg-surface-container-low'} ${className}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${danger ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}><Icon size={17} /></div>
        <div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p><p className={`truncate font-mono text-xl font-bold ${danger ? 'text-error' : 'text-on-surface'}`}>{value}</p><p className="truncate text-[10px] text-on-surface-variant">{detail}</p></div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-44 items-center justify-center text-xs text-on-surface-variant">{text}</div>;
}
