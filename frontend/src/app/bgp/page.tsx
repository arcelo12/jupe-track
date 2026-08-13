"use client";

import React, { useEffect, useState } from 'react';
import { BGPPeer } from '@/lib/types';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { useWebSocket } from '@/components/WebSocketProvider';
import { BGPPrefixChart } from '@/components/charts/BGPPrefixChart';
import { LookupModal } from '@/components/ui/LookupModal';
import { Search, Activity, Clock, ShieldAlert, Network, X, Server, Globe } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

function isFlapping(uptime?: string): boolean {
  if (!uptime) return false;
  if (uptime.includes('w') || uptime.includes('d')) return false;
  const parts = uptime.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    return hours === 0;
  } else if (parts.length === 2) {
    return true;
  }
  return false;
}

export default function BGPDashboard() {
  const [bgpData, setBgpData] = useState<BGPPeer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeer, setSelectedPeer] = useState<BGPPeer | null>(null);
  const [bgpLogs, setBgpLogs] = useState<string[]>([]);
  const [bgpPolicy, setBgpPolicy] = useState<any>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  
  const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d" | "30d" | "all">("1h");
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [lookupQuery, setLookupQuery] = useState<{ query: string, type: 'asn' | 'ip' | 'community' } | null>(null);

  const { refreshTrigger, logicalSystem } = useRefresh();

  useEffect(() => {
    try {
      const cachedData = localStorage.getItem(`junos-bgp-data-${logicalSystem}`);
      if (cachedData) {
        setBgpData(JSON.parse(cachedData));
      } else {
        setBgpData([]);
      }
    } catch {
      setBgpData([]);
    }
  }, [logicalSystem]);

  const { bgpSummary: rawBgpData, isConnected } = useWebSocket();
  const loading = rawBgpData.length === 0 && !isConnected;

  useEffect(() => {
    if (rawBgpData.length > 0) {
      setBgpData(rawBgpData);
      localStorage.setItem(`junos-bgp-data-${logicalSystem}`, JSON.stringify(rawBgpData));
      localStorage.setItem('junos-bgp-sys', logicalSystem);
    }
  }, [rawBgpData, logicalSystem]);

  useEffect(() => {
    if (!selectedPeer) return;

    const fetchHistory = async () => {
      setChartLoading(true);
      setChartData([]);
      const hours = { "1h": 1, "24h": 24, "7d": 168, "30d": 720, all: 8760 }[timeRange];
      try {
        const response = await authFetch(`/api/proxy/metrics/bgp/history?peer=${encodeURIComponent(selectedPeer.peer_address)}&hours=${hours}`);
        if (!response.ok) throw new Error("Failed to fetch BGP history");
        setChartData(await response.json());
      } catch (error) {
        console.warn("Failed to fetch historical data", error);
      } finally {
        setChartLoading(false);
      }
    };

    fetchHistory();
  }, [selectedPeer, timeRange]);

  useEffect(() => {
    if (selectedPeer) {
      const fetchLogsAndPolicy = async () => {
        setLogsLoading(true);
        setPolicyLoading(true);
        setBgpLogs([]);
        setBgpPolicy(null);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          const [logsRes, policyRes] = await Promise.all([
            authFetch(`/api/proxy/bgp-logs/${logicalSystem}/${selectedPeer.peer_address}`, { signal: controller.signal }),
            authFetch(`/api/proxy/bgp-policy/${logicalSystem}`, { signal: controller.signal })
          ]);
          
          clearTimeout(timeoutId);
          
          if (logsRes.ok) {
             const logsData = await logsRes.json();
             setBgpLogs(Array.isArray(logsData) ? logsData : []);
          }
          if (policyRes.ok) {
             const policyData = await policyRes.json();
             setBgpPolicy(policyData[selectedPeer.peer_address] || null);
          }
        } catch (error) {
          setBgpLogs(["Error fetching logs from device."]);
        } finally {
          setLogsLoading(false);
          setPolicyLoading(false);
        }
      };
      fetchLogsAndPolicy();
    }
  }, [selectedPeer, logicalSystem]);

  const filteredData = bgpData.filter(peer => 
    peer.peer_address.includes(searchQuery) || peer.peer_as.includes(searchQuery) || (peer.description && peer.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight flex items-center gap-3 text-primary">
            <Network className="text-primary" size={28} />
            BGP Routing Detail
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">Comprehensive view of all active and configured peers.</p>
        </div>
        
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
          <Input 
            placeholder="Search IP or AS..." 
            className="pl-9 bg-surface-container border-[#2A2E35] w-full md:w-64 focus-visible:ring-primary rounded"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-[#2A2E35] bg-surface-container-low shadow-none rounded overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-surface-container-high hover:bg-surface-container-high">
              <TableRow className="border-[#2A2E35] hover:bg-transparent">
                <TableHead className="py-4 px-6 text-on-surface-variant">Peer Address</TableHead>
                <TableHead className="py-4 px-6 text-on-surface-variant">AFI</TableHead>
                <TableHead className="py-4 px-6 text-on-surface-variant">Remote AS</TableHead>
                <TableHead className="py-4 px-6 text-on-surface-variant">State</TableHead>
                <TableHead className="py-4 px-6 text-on-surface-variant">Uptime</TableHead>
                <TableHead className="py-4 px-6 text-on-surface-variant text-right">Rcvd/Actv/Adv</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && bgpData.length === 0 ? (
                [1, 2, 3].map(i => (
                  <TableRow key={i} className="animate-pulse border-[#2A2E35] hover:bg-transparent">
                    <TableCell className="py-5 px-6"><div className="h-4 bg-surface-container-highest rounded w-24"></div></TableCell>
                    <TableCell className="py-5 px-6"><div className="h-4 bg-surface-container-highest rounded w-10"></div></TableCell>
                    <TableCell className="py-5 px-6"><div className="h-4 bg-surface-container-highest rounded w-16"></div></TableCell>
                    <TableCell className="py-5 px-6"><div className="h-6 bg-surface-container-highest rounded w-24"></div></TableCell>
                    <TableCell className="py-5 px-6"><div className="h-4 bg-surface-container-highest rounded w-20"></div></TableCell>
                    <TableCell className="py-5 px-6 text-right"><div className="h-4 bg-surface-container-highest rounded w-16 ml-auto"></div></TableCell>
                  </TableRow>
                ))
              ) : filteredData.length === 0 ? (
                <TableRow className="hover:bg-transparent border-[#2A2E35]">
                  <TableCell colSpan={6} className="py-12 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Network size={32} className="text-on-surface-variant opacity-50 mb-2" />
                      {bgpData.length === 0 && !loading ? "No BGP peers configured." : "No peers matched search."}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((peer, idx) => {
                  const isUp = peer.state === "Established" || peer.state === "Active";
                  return (
                    <TableRow 
                      key={idx} 
                      onClick={() => setSelectedPeer(peer)}
                      className="group hover:bg-surface-container-high transition-all duration-300 cursor-pointer border-[#2A2E35]"
                    >
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div 
                            className="font-mono font-medium text-on-surface hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1 group/ip z-10"
                            onClick={(e) => { e.stopPropagation(); setLookupQuery({ query: peer.peer_address, type: 'ip' }); }}
                          >
                            {peer.peer_address}
                            <Globe size={12} className="opacity-0 group-hover/ip:opacity-100 transition-opacity text-on-surface-variant" />
                          </div>
                        </div>
                        {peer.description && <div className="text-[11px] text-on-surface-variant mt-1 max-w-[200px] truncate">{peer.description}</div>}
                      </TableCell>
                      <TableCell className="py-4 px-6 text-sm text-on-surface font-mono uppercase">{peer.afi || "N/A"}</TableCell>
                      <TableCell className="py-4 px-6 text-sm text-on-surface font-mono">
                        <span 
                          className="hover:text-primary cursor-pointer inline-flex items-center gap-1 group/asn transition-colors z-10 relative"
                          onClick={(e) => { e.stopPropagation(); setLookupQuery({ query: peer.peer_as, type: 'asn' }); }}
                        >
                          AS {peer.peer_as}
                          <Search size={12} className="opacity-0 group-hover/asn:opacity-100 transition-opacity" />
                        </span>
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <Badge variant={isUp ? 'default' : 'destructive'} className={`gap-1.5 rounded ${isUp ? 'bg-primary/10 text-primary border-none' : 'bg-error/10 text-error border-none'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-primary animate-pulse' : 'bg-error'}`}></span>
                          {peer.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-sm font-mono text-on-surface-variant">
                        {peer.uptime || "-"}
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right font-mono text-sm">
                         <div className="flex justify-end items-center gap-3">
                           <div className="flex items-center">
                            <span className="text-primary font-medium" title="Received Prefixes">{peer.received_prefixes || 0}</span>
                            <span className="text-on-surface-variant/50 mx-1">/</span>
                            <span className="text-[#a28c85] font-medium" title="Active Prefixes">{peer.active_prefixes || 0}</span>
                            <span className="text-on-surface-variant/50 mx-1">/</span>
                            <span className="text-primary font-medium" title="Advertised Prefixes">{peer.advertised_prefixes || 0}</span>
                           </div>
                           <div className="w-5 h-5 flex items-center justify-center rounded bg-surface-container opacity-0 group-hover:opacity-100 transition-opacity">
                             <Activity size={12} className="text-primary" />
                           </div>
                         </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {lookupQuery && (
        <LookupModal 
          query={lookupQuery.query} 
          type={lookupQuery.type} 
          onClose={() => setLookupQuery(null)} 
        />
      )}

      {/* Peer Details Dialog */}
      <Dialog open={!!selectedPeer} onOpenChange={(open: boolean) => !open && setSelectedPeer(null)}>
        <DialogContent className="max-w-5xl sm:max-w-4xl md:max-w-5xl w-[95vw] md:w-full bg-surface-container border-[#2A2E35] shadow-none p-0 gap-0 overflow-hidden rounded">
          {selectedPeer && (
            <>
              <DialogHeader className="border-b border-[#2A2E35] p-6 bg-surface-container-high">
                <DialogTitle className="text-2xl font-bold font-display text-on-surface flex items-center gap-3">
                  <Server className="text-primary" size={24} />
                  {selectedPeer.peer_address}
                  <Badge variant={selectedPeer.state === "Established" || selectedPeer.state === "Active" ? 'default' : 'destructive'} className={`ml-2 text-xs font-normal gap-1 rounded ${selectedPeer.state === "Established" || selectedPeer.state === "Active" ? 'bg-primary/10 text-primary border-none' : 'bg-error/10 text-error border-none'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedPeer.state === "Established" || selectedPeer.state === "Active" ? 'bg-primary' : 'bg-error'}`}></span>
                    {selectedPeer.state}
                  </Badge>
                </DialogTitle>
                <div className="text-on-surface-variant mt-2 text-sm flex flex-wrap items-center gap-2">
                  <span className="font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface">AS {selectedPeer.peer_as}</span>
                  <span className="font-mono bg-surface-container px-2 py-0.5 rounded text-primary uppercase">{selectedPeer.afi || "N/A"}</span>
                  {selectedPeer.description && <span>• {selectedPeer.description}</span>}
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[75vh] p-6 bg-surface-container-low">
                <div className="space-y-6 pb-6">
                  {/* TSDB Zoom Controls & Chart */}
                  <Card className="border-[#2A2E35] bg-surface-container rounded shadow-none">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-widest flex items-center gap-2">
                          <Activity size={14} className="text-primary" />
                          Historical Trend (TSDB)
                        </h3>
                        
                        <div className="flex bg-surface-container-low p-1 rounded border border-[#2A2E35]">
                          {[
                            { id: "1h", label: "1H" },
                            { id: "24h", label: "24H" },
                            { id: "7d", label: "7D" },
                            { id: "30d", label: "30D" },
                            { id: "all", label: "All" }
                          ].map(range => (
                            <button
                              key={range.id}
                              onClick={() => setTimeRange(range.id as any)}
                              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                                timeRange === range.id 
                                  ? 'bg-primary text-on-primary' 
                                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                              }`}
                            >
                              {range.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="relative h-[200px] w-full">
                        {chartLoading && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container-low/50 backdrop-blur-sm rounded">
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                          </div>
                        )}
                        <BGPPrefixChart data={chartData} peerAddress={selectedPeer.peer_address} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-surface-container border-[#2A2E35] border-l-4 border-l-primary rounded shadow-none">
                      <CardContent className="p-5 flex flex-col justify-center h-full">
                         <div className="text-xs text-on-surface-variant mb-2 uppercase tracking-widest flex items-center gap-2">
                           <Clock size={12} /> Router ID
                         </div>
                         <div className="text-lg font-mono font-bold text-on-surface">{selectedPeer.router_id || "N/A"}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-surface-container border-[#2A2E35] border-l-4 border-l-primary rounded shadow-none">
                      <CardContent className="p-5 flex flex-col justify-center h-full">
                         <div className="text-xs text-on-surface-variant mb-2 uppercase tracking-widest flex items-center gap-2">
                           <Network size={12} /> Received / Active
                         </div>
                         <div className="flex items-baseline gap-2">
                           <div className="text-2xl font-mono font-bold text-primary">{selectedPeer.received_prefixes || 0}</div>
                           <div className="text-sm font-mono text-on-surface-variant">/ {selectedPeer.active_prefixes || 0}</div>
                         </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-surface-container border-[#2A2E35] border-l-4 border-l-[#a28c85] rounded shadow-none">
                      <CardContent className="p-5 flex flex-col justify-center h-full">
                         <div className="text-xs text-on-surface-variant mb-2 uppercase tracking-widest flex items-center gap-2">
                           <Network size={12} /> Advertised Routes
                         </div>
                         <div className="text-2xl font-mono font-bold text-[#a28c85]">{selectedPeer.advertised_prefixes || 0}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-surface-container border-[#2A2E35] border-l-4 border-l-primary rounded shadow-none">
                      <CardContent className="p-5 flex flex-col justify-center h-full">
                         <div className="text-xs text-on-surface-variant mb-2 uppercase tracking-widest flex items-center gap-2">
                           <ShieldAlert size={12} /> Policy (In/Out)
                         </div>
                         <div className="text-sm font-mono text-primary">
                           {policyLoading ? (
                             <span className="animate-pulse">Loading...</span>
                           ) : bgpPolicy ? (
                             <div className="flex flex-col gap-1">
                               <span>{bgpPolicy.import_policies?.join(", ") || "None"}</span>
                               <span className="text-on-surface-variant">/</span>
                               <span>{bgpPolicy.export_policies?.join(", ") || "None"}</span>
                             </div>
                           ) : "N/A"}
                         </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Logs */}
                  <Card className="border-[#2A2E35] bg-surface-container rounded shadow-none">
                    <CardContent className="p-5">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-widest flex items-center gap-2">
                          <Server size={14} className="text-on-surface-variant" />
                          Syslog Messages
                        </h3>
                      </div>
                      <div className="bg-surface-container-low rounded p-4 font-mono text-[11px] text-on-surface-variant h-40 overflow-y-auto whitespace-pre-wrap border border-[#2A2E35]">
                        {logsLoading ? (
                           <div className="animate-pulse flex items-center gap-2 text-primary">
                             <span className="w-2 h-2 rounded-full bg-primary"></span>
                             Fetching latest syslog messages...
                           </div>
                        ) : bgpLogs.length > 0 ? (
                           <div className="space-y-1.5">
                              {bgpLogs.map((line, i) => (
                                <div key={i} className="hover:bg-surface-container-high px-2 py-1 -mx-2 rounded transition-colors break-all">
                                  {line}
                                </div>
                              ))}
                           </div>
                        ) : (
                           <span className="text-on-surface-variant flex items-center justify-center h-full italic">No log messages found for this peer.</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
