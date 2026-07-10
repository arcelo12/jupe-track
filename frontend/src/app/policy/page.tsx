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
          <h1 className="text-3xl font-bold font-display tracking-tight text-primary">Routing Policy</h1>
          <p className="text-on-surface-variant mt-1">Detailed BGP Import and Export Policies.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* View Mode Toggle */}
          <div className="flex bg-surface-container rounded p-1 border border-[#2A2E35]">
            <button
              onClick={() => setViewMode("policies")}
              className={`px-4 py-1.5 text-sm rounded transition-all ${
                viewMode === "policies" ? "bg-primary/20 text-primary font-medium" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              All Policies
            </button>
            <button
              onClick={() => setViewMode("neighbors")}
              className={`px-4 py-1.5 text-sm rounded transition-all ${
                viewMode === "neighbors" ? "bg-primary/20 text-primary font-medium" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              By Neighbor
            </button>
          </div>

          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-primary text-sm">🔍</span>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container border border-[#2A2E35] rounded pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-on-surface"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {loading && policiesList.length === 0 && neighborsList.length === 0 ? (
           <div className="glass-panel text-center py-12 text-on-surface-variant animate-pulse bg-surface-container-low border-[#2A2E35]">
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                Loading policy configs...
              </div>
           </div>
        ) : viewMode === "policies" ? (
          /* ALL POLICIES VIEW */
          policiesList.length === 0 ? (
            <div className="glass-panel text-center py-12 text-on-surface-variant bg-surface-container-low border-[#2A2E35]">
              No routing policies found for this logical system.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {policiesList
                .filter(p => p.policy_name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((policy, idx) => (
                <div key={idx} className="glass-panel space-y-4 border-l-4 border-l-primary bg-surface-container-low border-[#2A2E35]">
                  <h3 className="text-lg font-bold font-mono text-primary border-b border-[#2A2E35] pb-2">
                    Policy: {policy.policy_name}
                  </h3>
                  {policy.terms && policy.terms.map((term: any, tidx: number) => (
                    <PolicyNode key={term.term_name || tidx} term={term} index={tidx} />
                  ))}
                  {(!policy.terms || policy.terms.length === 0) && (
                    <div className="text-sm text-on-surface-variant italic">No terms configured or unable to parse.</div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          /* BY NEIGHBOR VIEW */
          neighborsList.length === 0 ? (
            <div className="glass-panel text-center py-12 text-on-surface-variant bg-surface-container-low border-[#2A2E35]">
              No BGP neighbors with configured policies found.
            </div>
          ) : (
            neighborsList
              .filter(peer => peer.peer_address.includes(searchQuery.trim()))
              .map((peerPolicy, idx) => (
              <div key={idx} className="glass-panel space-y-6 bg-surface-container-low border-[#2A2E35]">
                <div className="flex justify-between items-center border-b border-[#2A2E35] pb-4">
                   <h2 className="text-xl font-bold font-mono text-primary">
                     Peer: {peerPolicy.peer_address}
                   </h2>
                   <div className="flex gap-4 text-sm">
                     <div>
                       <span className="text-on-surface-variant">Imports:</span> 
                       <span className="ml-2 font-medium bg-surface-container-high px-2 py-1 rounded">{peerPolicy.import_policies.length}</span>
                     </div>
                     <div>
                       <span className="text-on-surface-variant">Exports:</span> 
                       <span className="ml-2 font-medium bg-surface-container-high px-2 py-1 rounded">{peerPolicy.export_policies.length}</span>
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Import Policies */}
                  <div>
                     <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-on-surface">
                       <span className="text-primary">⬇</span> Import Policies
                     </h3>
                     {peerPolicy.import_policies.map(pName => {
                       const pd = policyData.policies?.[pName] || peerPolicy.policy_details?.[pName];
                       return (
                       <div key={pName} className="glass-card mb-4 border-l-4 border-l-primary bg-surface-container border-[#2A2E35]">
                          <div className="font-mono text-sm mb-2 text-primary">{pName}</div>
                          {pd?.terms?.map((term: any, idx: number) => (
                             <PolicyNode key={term.term_name || idx} term={term} index={idx} />
                          ))}
                          {!pd && (
                             <div className="text-xs text-on-surface-variant italic mt-1">Unable to parse policy details.</div>
                          )}
                       </div>
                     )})}
                     {peerPolicy.import_policies.length === 0 && (
                       <p className="text-sm text-on-surface-variant">No import policy applied.</p>
                     )}
                  </div>

                  {/* Export Policies */}
                  <div>
                     <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-on-surface">
                       <span className="text-[#a28c85]">⬆</span> Export Policies
                     </h3>
                     {peerPolicy.export_policies.map(pName => {
                       const pd = policyData.policies?.[pName] || peerPolicy.policy_details?.[pName];
                       return (
                       <div key={pName} className="glass-card mb-4 border-t-2 border-t-[#a28c85] rounded-t-none bg-surface-container border-[#2A2E35]">
                          <div className="font-mono text-sm mb-4 text-[#a28c85] bg-surface-container-high px-3 py-1.5 rounded inline-block shadow-sm">
                             Policy: {pName}
                          </div>
                           {pd?.terms?.map((term: any, idx: number) => (
                             <PolicyNode key={term.term_name || idx} term={term} index={idx} />
                          ))}
                          {!pd && (
                             <div className="text-xs text-on-surface-variant italic mt-1">Unable to parse policy details.</div>
                          )}
                       </div>
                     )})}
                     {peerPolicy.export_policies.length === 0 && (
                       <p className="text-sm text-on-surface-variant">No export policy applied.</p>
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
