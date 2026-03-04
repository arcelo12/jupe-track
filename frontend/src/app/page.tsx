"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { BGPPeer } from '@/lib/types';
import { useRefresh } from '@/components/RefreshProvider';

export default function Dashboard() {
  const [bgpData, setBgpData] = useState<BGPPeer[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { refreshTrigger, logicalSystem } = useRefresh();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`/api/proxy/bgp-summary/${logicalSystem}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setBgpData(data);
      setConnectionError(null);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn("Error loading BGP data:", msg);
      setConnectionError(`Backend unreachable: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [logicalSystem]);

  useEffect(() => {
    fetchData();
  }, [logicalSystem, fetchData, refreshTrigger]);

  const upPeers = bgpData.filter(p => p.state === "Established" || p.state === "Active").length;
  const downPeers = bgpData.length - upPeers;

  return (
    <div className="space-y-6">
      {connectionError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2 text-rose-300 text-sm">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            {connectionError}
          </div>
          <button onClick={fetchData} className="text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-3 py-1 rounded transition-colors">Retry</button>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MX204 Dashboard</h1>
          <p className="text-slate-400 mt-1">Real-time view of BGP routes and policies.</p>
        </div>
      </div>

      <div className="glass-panel w-full">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
          BGP Peer Status
        </h2>
        <div className="flex items-end gap-4 mb-6">
          <div className="text-emerald-400">
            <span className="text-4xl font-bold">{upPeers}</span> 
            <span className="text-lg ml-1 font-medium">Up</span>
          </div>
          <div className="text-slate-600 font-light text-2xl mb-1">|</div>
          <div className="text-rose-400">
            <span className="text-4xl font-bold">{downPeers}</span> 
            <span className="text-lg ml-1 font-medium">Down</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
             [1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>)
          ) : (
            bgpData.map((peer, idx) => (
              <div key={idx} className="glass-card flex justify-between items-center group">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${peer.state === "Established" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"}`}></div>
                  <div>
                    <p className="font-medium flex items-center gap-2">
                       {peer.peer_address}
                       {peer.description && <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-normal">{peer.description}</span>}
                    </p>
                    <p className="text-xs text-slate-400">AS {peer.peer_as}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                   <div className="text-right">
                     <p className="text-xs font-mono text-emerald-400">{peer.active_prefixes || 0}</p>
                     <p className="text-[10px] text-slate-500">Pfx</p>
                   </div>
                </div>
              </div>
            ))
          )}
          {bgpData.length === 0 && !loading && (
            <p className="text-slate-500 text-sm py-4 col-span-full">No BGP peers currently configured.</p>
          )}
        </div>
      </div>
    </div>
  );
}
