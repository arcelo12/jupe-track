"use client";

import React, { useEffect, useState } from 'react';
import { BGPPeerPolicy } from '@/lib/types';
import { PolicyNode } from '@/components/dashboard/PolicyNode';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';

type PolicyDataResp = {
  neighbors: Record<string, BGPPeerPolicy>;
  policies: Record<string, any>;
};

export default function PolicyDashboard() {
  const [policyData, setPolicyData] = useState<PolicyDataResp>({ neighbors: {}, policies: {} });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"policies" | "neighbors">("policies");
  const { refreshTrigger, logicalSystem } = useRefresh();

  useEffect(() => {
    try {
      const cachedData = localStorage.getItem(`junos-policy-data-${logicalSystem || 'global'}`);
      if (cachedData) {
        setPolicyData(JSON.parse(cachedData));
        setLoading(false);
      }
    } catch {}
  }, [logicalSystem]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await authFetch(`/api/proxy/bgp-policy/${logicalSystem}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Failed to fetch data');
        const data = await res.json();
        
        // Handle backwards compatibility if backend hasn't updated yet
        if (!data.policies && !data.neighbors) {
          setPolicyData({ neighbors: data, policies: {} });
        } else {
          setPolicyData(data);
          localStorage.setItem(`junos-policy-data-${logicalSystem}`, JSON.stringify(data));
        }
      } catch (error) {
        console.warn("Error loading BGP policy data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [logicalSystem, refreshTrigger]);

  const policiesList = Object.values(policyData.policies || {});
  const neighborsList = Object.values(policyData.neighbors || {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Routing Policy</h1>
          <p className="text-slate-400 mt-1">Detailed BGP Import and Export Policies.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700/50">
            <button
              onClick={() => setViewMode("policies")}
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                viewMode === "policies" ? "bg-emerald-500/20 text-emerald-400 font-medium" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Policies
            </button>
            <button
              onClick={() => setViewMode("neighbors")}
              className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                viewMode === "neighbors" ? "bg-emerald-500/20 text-emerald-400 font-medium" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              By Neighbor
            </button>
          </div>

          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-emerald-500 text-sm">🔍</span>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-slate-200"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {loading && policiesList.length === 0 && neighborsList.length === 0 ? (
           <div className="glass-panel text-center py-12 text-slate-400 animate-pulse">
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
                Loading policy configs...
              </div>
           </div>
        ) : viewMode === "policies" ? (
          /* ALL POLICIES VIEW */
          policiesList.length === 0 ? (
            <div className="glass-panel text-center py-12 text-slate-400">
              No routing policies found for this logical system.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {policiesList
                .filter(p => p.policy_name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((policy, idx) => (
                <div key={idx} className="glass-panel space-y-4 border-l-4 border-l-emerald-500">
                  <h3 className="text-lg font-bold font-mono text-emerald-400 border-b border-slate-700/50 pb-2">
                    Policy: {policy.policy_name}
                  </h3>
                  {policy.terms && policy.terms.map((term: any, tidx: number) => (
                    <PolicyNode key={term.term_name || tidx} term={term} index={tidx} />
                  ))}
                  {(!policy.terms || policy.terms.length === 0) && (
                    <div className="text-sm text-slate-500 italic">No terms configured or unable to parse.</div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          /* BY NEIGHBOR VIEW */
          neighborsList.length === 0 ? (
            <div className="glass-panel text-center py-12 text-slate-400">
              No BGP neighbors with configured policies found.
            </div>
          ) : (
            neighborsList
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
                     {peerPolicy.import_policies.map(pName => {
                       const pd = policyData.policies?.[pName] || peerPolicy.policy_details?.[pName];
                       return (
                       <div key={pName} className="glass-card mb-4 border-l-4 border-l-blue-500">
                          <div className="font-mono text-sm mb-2 text-blue-300">{pName}</div>
                          {pd?.terms?.map((term: any, idx: number) => (
                             <PolicyNode key={term.term_name || idx} term={term} index={idx} />
                          ))}
                          {!pd && (
                             <div className="text-xs text-slate-500 italic mt-1">Unable to parse policy details.</div>
                          )}
                       </div>
                     )})}
                     {peerPolicy.import_policies.length === 0 && (
                       <p className="text-sm text-slate-500">No import policy applied.</p>
                     )}
                  </div>

                  {/* Export Policies */}
                  <div>
                     <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                       <span className="text-orange-400">⬆</span> Export Policies
                     </h3>
                     {peerPolicy.export_policies.map(pName => {
                       const pd = policyData.policies?.[pName] || peerPolicy.policy_details?.[pName];
                       return (
                       <div key={pName} className="glass-card mb-4 border-t-2 border-t-orange-500 rounded-t-none">
                          <div className="font-mono text-sm mb-4 text-orange-300 bg-slate-800/80 px-3 py-1.5 rounded inline-block shadow-sm">
                             Policy: {pName}
                          </div>
                           {pd?.terms?.map((term: any, idx: number) => (
                             <PolicyNode key={term.term_name || idx} term={term} index={idx} />
                          ))}
                          {!pd && (
                             <div className="text-xs text-slate-500 italic mt-1">Unable to parse policy details.</div>
                          )}
                       </div>
                     )})}
                     {peerPolicy.export_policies.length === 0 && (
                       <p className="text-sm text-slate-500">No export policy applied.</p>
                     )}
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
