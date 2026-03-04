"use client";

import React, { useEffect, useState } from 'react';
import { BGPPeerPolicy } from '@/lib/types';
import { PolicyNode } from '@/components/dashboard/PolicyNode';
import { useRefresh } from '@/components/RefreshProvider';

export default function PolicyDashboard() {
  const [policyData, setPolicyData] = useState<Record<string, BGPPeerPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { refreshTrigger, logicalSystem } = useRefresh();

  // Load cached state on mount to prevent blank screen
  useEffect(() => {
    try {
      const cachedData = localStorage.getItem(`junos-policy-data-${logicalSystem || 'global'}`);
      if (cachedData) {
        setPolicyData(JSON.parse(cachedData));
        setLoading(false); // We have data, so don't show full loading screen
      }
    } catch {}
  }, [logicalSystem]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(`/api/proxy/bgp-policy/${logicalSystem}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Failed to fetch data');
        const data = await res.json();
        setPolicyData(data);
        localStorage.setItem(`junos-policy-data-${logicalSystem}`, JSON.stringify(data));
      } catch (error) {
        console.warn("Error loading BGP policy data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [logicalSystem, refreshTrigger]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Routing Policy</h1>
          <p className="text-slate-400 mt-1">Detailed BGP Import and Export Policies.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-emerald-500 text-sm">👁️</span>
            </div>
            <select
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-slate-200 appearance-none"
            >
              <option value="">All Peers</option>
              {Object.keys(policyData).map(peer => (
                <option key={peer} value={peer}>{peer}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {loading && Object.keys(policyData).length === 0 ? (
           <div className="glass-panel text-center py-12 text-slate-400 animate-pulse">
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                Loading policy configs...
              </div>
           </div>
        ) : Object.keys(policyData).length === 0 ? (
           <div className="glass-panel text-center py-12 text-slate-400">
              No routing policies configured for this logical system.
           </div>
        ) : (
          Object.values(policyData)
            .filter(peer => peer.peer_address.includes(searchQuery.trim()))
            .map((peerPolicy, idx) => (
            <div key={idx} className="glass-panel space-y-6">
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
                 <h2 className="text-xl font-bold font-mono text-emerald-400">
                   Peer: {peerPolicy.peer_address}
                 </h2>
                 <div className="flex gap-4 text-sm">
                   <div>
                     <span className="text-slate-500">Imports:</span> 
                     <span className="ml-2 font-medium bg-slate-800 px-2 py-1 rounded">{peerPolicy.import_policies.length}</span>
                   </div>
                   <div>
                     <span className="text-slate-500">Exports:</span> 
                     <span className="ml-2 font-medium bg-slate-800 px-2 py-1 rounded">{peerPolicy.export_policies.length}</span>
                   </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Import Policies */}
                <div>
                   <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                     <span className="text-blue-400">⬇</span> Import Policies
                   </h3>
                   {peerPolicy.import_policies.map(pName => (
                     <div key={pName} className="glass-card mb-4 border-l-4 border-l-blue-500">
                        <div className="font-mono text-sm mb-2 text-blue-300">{pName}</div>
                        {peerPolicy.policy_details[pName]?.terms.map((term, idx) => (
                           <PolicyNode key={term.term_name} term={term} index={idx} />
                        ))}
                        {!peerPolicy.policy_details[pName] && (
                           <div className="text-xs text-slate-500 italic mt-1">Unable to parse policy details.</div>
                        )}
                     </div>
                   ))}
                   {peerPolicy.import_policies.length === 0 && (
                     <p className="text-sm text-slate-500">No import policy applied.</p>
                   )}
                </div>

                {/* Export Policies */}
                <div>
                   <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                     <span className="text-orange-400">⬆</span> Export Policies
                   </h3>
                   {peerPolicy.export_policies.map(pName => (
                     <div key={pName} className="glass-card mb-4 border-t-2 border-t-orange-500 rounded-t-none">
                        <div className="font-mono text-sm mb-4 text-orange-300 bg-slate-800/80 px-3 py-1.5 rounded inline-block shadow-sm">
                           Policy: {pName}
                        </div>
                         {peerPolicy.policy_details[pName]?.terms.map((term, idx) => (
                           <PolicyNode key={term.term_name} term={term} index={idx} />
                        ))}
                        {!peerPolicy.policy_details[pName] && (
                           <div className="text-xs text-slate-500 italic mt-1">Unable to parse policy details.</div>
                        )}
                     </div>
                   ))}
                   {peerPolicy.export_policies.length === 0 && (
                     <p className="text-sm text-slate-500">No export policy applied.</p>
                   )}
                </div>
              </div>
            </div>
          ))
        )}
        {Object.keys(policyData).length > 0 && 
         Object.values(policyData).filter(p => p.peer_address.includes(searchQuery.trim())).length === 0 && (
          <div className="glass-panel text-center py-12 text-slate-500">
            No peers match the search "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}
