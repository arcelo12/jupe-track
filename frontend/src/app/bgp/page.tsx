"use client";

import React, { useEffect, useState } from 'react';
import { BGPPeer } from '@/lib/types';
import { useRefresh } from '@/components/RefreshProvider';

export default function BGPDashboard() {
  const [bgpData, setBgpData] = useState<BGPPeer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeer, setSelectedPeer] = useState<BGPPeer | null>(null);
  const [bgpLogs, setBgpLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const { refreshTrigger, logicalSystem } = useRefresh();

  // Load cached state on mount to prevent blank screen
  useEffect(() => {
    try {
      const cachedSys = localStorage.getItem('junos-bgp-sys');
      
      const cachedData = localStorage.getItem(`junos-bgp-data-${cachedSys || 'global'}`);
      if (cachedData) {
        setBgpData(JSON.parse(cachedData));
        setLoading(false); // We have data, so don't show full loading screen
      }
    } catch {}
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(`/api/proxy/bgp-summary/${logicalSystem}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Failed to fetch data');
        const data = await res.json();
        setBgpData(data);
        localStorage.setItem(`junos-bgp-data-${logicalSystem}`, JSON.stringify(data));
        localStorage.setItem('junos-bgp-sys', logicalSystem);
      } catch (error) {
        console.warn("Error loading BGP summary data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [logicalSystem, refreshTrigger]);

  useEffect(() => {
    if (selectedPeer) {
      const fetchLogs = async () => {
        setLogsLoading(true);
        setBgpLogs([]);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000);
          const res = await fetch(`/api/proxy/bgp-logs/${logicalSystem}/${selectedPeer.peer_address}`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            setBgpLogs(data);
          }
        } catch (error) {
          console.warn("Error loading BGP logs:", error);
          setBgpLogs(["Error fetching logs from device."]);
        } finally {
          setLogsLoading(false);
        }
      };
      fetchLogs();
    } else {
      setBgpLogs([]);
    }
  }, [selectedPeer, logicalSystem]);

  const filteredData = bgpData.filter(peer => 
    peer.peer_address.includes(searchQuery) || peer.peer_as.includes(searchQuery) || (peer.description && peer.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">BGP Routing Detail</h1>
          <p className="text-slate-400 mt-1">Comprehensive view of all active and configured peers.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="glass-card flex items-center px-3 py-1.5 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <span className="text-slate-500 mr-2">🔍</span>
            <input 
              type="text"
              placeholder="Search IP or AS..."
              className="bg-transparent border-none outline-none text-sm w-32 sm:w-48 placeholder:text-slate-600 focus:placeholder:text-slate-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400 text-sm uppercase tracking-wider">
              <th className="pb-3 px-4 font-medium">Peer Address</th>
              <th className="pb-3 px-4 font-medium">Remote AS</th>
              <th className="pb-3 px-4 font-medium">State</th>
              <th className="pb-3 px-4 font-medium">Uptime</th>
              <th className="pb-3 px-4 font-medium text-right">Active/Rcvd</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading && bgpData.length === 0 ? (
              [1, 2, 3].map(i => (
                <tr key={i} className="animate-pulse">
                  <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded w-24"></div></td>
                  <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded w-16"></div></td>
                  <td className="py-4 px-4"><div className="h-6 bg-slate-800 rounded-full w-20"></div></td>
                  <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded w-20"></div></td>
                  <td className="py-4 px-4 text-right"><div className="h-4 bg-slate-800 rounded w-16 ml-auto"></div></td>
                </tr>
              ))
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  {bgpData.length === 0 && !loading ? "No BGP peers configured." : "No peers matched search."}
                </td>
              </tr>
            ) : (
              filteredData.map((peer, idx) => (
                <tr 
                  key={idx} 
                  onClick={() => setSelectedPeer(peer)}
                  className="group hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <td className="py-4 px-4">
                    <div className="font-mono text-slate-200 group-hover:text-emerald-400 transition-colors">
                      {peer.peer_address}
                    </div>
                    {peer.description && <div className="text-xs text-slate-500 mt-0.5">{peer.description}</div>}
                  </td>
                  <td className="py-4 px-4 text-slate-300">AS {peer.peer_as}</td>
                  <td className="py-4 px-4">
                    {peer.state === "Established" || peer.state === "Active" ? (
                      <span className="status-badge-up w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {peer.state}
                      </span>
                    ) : (
                      <span className="status-badge-down w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        {peer.state}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-slate-400 text-sm">
                    {peer.uptime || "-"}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-sm flex justify-end items-center gap-4">
                    <div>
                      <span className="text-emerald-400">{peer.active_prefixes || 0}</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-slate-300">{peer.received_prefixes || 0}</span>
                    </div>
                    <span className="text-slate-600 group-hover:text-emerald-500 hidden sm:inline-block">→</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Peer Details Modal */}
      {selectedPeer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedPeer(null)}></div>
          <div className="relative glass-panel w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start border-b border-slate-700/50 pb-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                  Peer Detail
                  {selectedPeer.state === "Established" || selectedPeer.state === "Active" ? (
                    <span className="status-badge-up text-xs font-normal"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{selectedPeer.state}</span>
                  ) : (
                    <span className="status-badge-down text-xs font-normal"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>{selectedPeer.state}</span>
                  )}
                </h2>
                <div className="text-emerald-400 font-mono text-lg mt-1">{selectedPeer.peer_address}</div>
                {selectedPeer.description && <div className="text-slate-400 mt-1 text-sm">{selectedPeer.description}</div>}
              </div>
              <button 
                onClick={() => setSelectedPeer(null)}
                className="text-slate-400 hover:text-white transition-colors p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-6 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-4">
                   <div className="text-sm text-slate-400 mb-1">Remote AS</div>
                   <div className="text-xl font-bold">{selectedPeer.peer_as}</div>
                </div>
                <div className="glass-card p-4">
                   <div className="text-sm text-slate-400 mb-1">Uptime</div>
                   <div className="text-xl font-bold text-slate-200">{selectedPeer.uptime || "N/A"}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wider">Prefix Statistics</h3>
                <div className="glass-card p-0 divide-y divide-slate-700/50">
                  <div className="flex justify-between p-4">
                    <span className="text-slate-400">Received Prefixes</span>
                    <span className="font-mono font-medium">{selectedPeer.received_prefixes || 0}</span>
                  </div>
                  <div className="flex justify-between p-4 bg-emerald-500/5">
                    <span className="text-slate-300">Active (Accepted) Prefixes</span>
                    <span className="font-mono font-medium text-emerald-400">{selectedPeer.active_prefixes || 0}</span>
                  </div>
                   <div className="flex justify-between p-4">
                    <span className="text-slate-400">Rejected Prefixes</span>
                    <span className="font-mono font-medium text-rose-400">{(selectedPeer.received_prefixes || 0) - (selectedPeer.active_prefixes || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-blue-300">Routing Policy</h4>
                  <p className="text-sm text-blue-400/80 mt-1">View the configured import and export rules for this peer.</p>
                </div>
                <a 
                  href={`/policy`}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
                >
                  View Policies
                </a>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wider">Device Log Messages</h3>
                <div className="bg-slate-900/80 rounded-md p-3 font-mono text-xs text-slate-300 h-48 overflow-y-auto whitespace-pre-wrap border border-slate-700/50">
                  {logsLoading ? (
                     <div className="animate-pulse flex items-center gap-2 text-emerald-500">
                       <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                       Fetching latest syslog messages...
                     </div>
                  ) : bgpLogs.length > 0 ? (
                     <div className="space-y-1">
                       {bgpLogs.map((line, i) => (
                         <div key={i} className="hover:bg-slate-800/50 px-1 -mx-1 rounded break-all">{line}</div>
                       ))}
                     </div>
                  ) : (
                     <span className="text-slate-500 flex items-center justify-center h-full">No log messages found for this peer.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
