import React from 'react';
import { Server, Globe, Building, Activity, CheckCircle, XCircle } from 'lucide-react';
import { GlowingCard } from '@/components/ui/GlowingCard';
import { motion } from 'framer-motion';

export function LookupResultViewer({ result }: { result: any }) {
  if (!result || (!result.data && !result.asn_context)) {
    return (
      <div className="bg-surface-container p-4 rounded-lg overflow-x-auto text-sm text-primary font-mono">
        {JSON.stringify(result, null, 2)}
      </div>
    );
  }

  const isCommunity = result.community && result.asn_context;
  const data = isCommunity ? result.asn_context.data : result.data;

  const content = (
    <>
      {data?.prefix && data?.asns && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlowingCard delay={0.1} className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="text-primary" size={24} />
              <h3 className="text-on-surface font-semibold font-outfit text-lg">Network Prefix</h3>
            </div>
            <p className="text-3xl font-mono font-bold text-on-surface tracking-tight break-all">{data.prefix}</p>
          </GlowingCard>
          
          <GlowingCard delay={0.2} className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Server className="text-primary" size={24} />
              <h3 className="text-on-surface font-semibold font-outfit text-lg">Origin ASNs</h3>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {data.asns.map((asn: string) => (
                <span key={asn} className="px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-lg font-mono font-semibold text-sm shadow-none">
                  AS{asn}
                </span>
              ))}
              {data.asns.length === 0 && <span className="text-on-surface-variant italic">No origin ASNs found</span>}
            </div>
          </GlowingCard>
        </div>
      )}

      {data?.type === 'as' && data?.resource && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <GlowingCard delay={0.1} className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Server className="text-primary" size={24} />
                <h3 className="text-on-surface font-semibold font-outfit text-lg">Autonomous System</h3>
              </div>
              <p className="text-4xl font-mono font-bold text-on-surface tracking-tight">AS{data.resource}</p>
            </GlowingCard>

            <GlowingCard delay={0.2} className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Activity className={data.announced ? "text-primary" : "text-error"} size={24} />
                <h3 className="text-on-surface font-semibold font-outfit text-lg">Routing Status</h3>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {data.announced ? (
                  <span className="px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-xl flex items-center gap-2 font-semibold shadow-none">
                    <CheckCircle size={18} /> Announced
                  </span>
                ) : (
                  <span className="px-4 py-2 bg-error/10 text-error border border-error/30 rounded-xl flex items-center gap-2 font-semibold shadow-none">
                    <XCircle size={18} /> Not Announced
                  </span>
                )}
              </div>
            </GlowingCard>
          </div>

          <GlowingCard delay={0.3} className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Building className="text-primary" size={24} />
              <h3 className="text-on-surface font-semibold font-outfit text-lg">Holder / Description</h3>
            </div>
            <p className="text-xl text-on-surface mt-1">{data.holder || 'Unknown'}</p>
            {data.block && (
              <p className="text-sm text-on-surface-variant mt-2 font-medium">
                Registry: {data.block.name} (Block: {data.block.resource})
              </p>
            )}
          </GlowingCard>
        </div>
      )}

      {data?.rrcs && (
        <div className="space-y-6 mt-6">
          <GlowingCard delay={0.4} className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="text-primary" size={24} />
              <h3 className="text-on-surface font-semibold font-outfit text-lg">Looking Glass (Routing Status)</h3>
            </div>
            <p className="text-sm text-on-surface-variant">
              Showing BGP routes from RIPE RIS route collectors for resource 
              <strong className="text-primary ml-1 font-mono">{data.parameters?.resource}</strong>
            </p>
          </GlowingCard>

          <div className="grid grid-cols-1 gap-6">
            {data.rrcs.filter((rrc: any) => rrc.peers && rrc.peers.length > 0).map((rrc: any, idx: number) => (
              <GlowingCard key={idx} delay={0.5 + (idx * 0.1)} className="p-5 bg-surface-container">
                <div className="flex justify-between items-center mb-4 border-b border-[#2A2E35] pb-3">
                  <div>
                    <h4 className="text-on-surface font-bold flex items-center gap-2 text-lg">
                      <Server size={18} className="text-primary drop-shadow-none" /> {rrc.rrc}
                    </h4>
                    <p className="text-xs text-on-surface-variant mt-1 uppercase tracking-wider">{rrc.location}</p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-primary shadow-none">
                    {rrc.peers.length} peers
                  </span>
                </div>
                
                <div className="space-y-4 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                  {rrc.peers.map((peer: any, pIdx: number) => (
                    <div key={pIdx} className="bg-surface-container-high border border-[#2A2E35] rounded-xl p-4 text-sm flex flex-col gap-3 hover:bg-surface-container-highest transition-colors">
                      <div className="flex justify-between text-xs pb-2 border-b border-[#2A2E35]">
                        <span className="text-on-surface-variant">Peer: <span className="text-on-surface font-mono font-bold">{peer.peer}</span></span>
                        <span className="text-on-surface-variant">Origin: <span className="text-primary font-mono font-bold">AS{peer.asn_origin}</span></span>
                      </div>
                      <div className="pt-1">
                        <span className="text-on-surface-variant text-xs mr-3 font-semibold uppercase tracking-wider">AS Path</span>
                        <span className="font-mono text-primary font-medium">{peer.as_path}</span>
                      </div>
                      {peer.next_hop && (
                        <div>
                          <span className="text-on-surface-variant text-xs mr-3 font-semibold uppercase tracking-wider">Next Hop</span>
                          <span className="font-mono text-primary font-medium">{peer.next_hop}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlowingCard>
            ))}
            
            {data.rrcs.filter((rrc: any) => rrc.peers && rrc.peers.length > 0).length === 0 && (
              <GlowingCard className="p-8 text-center bg-surface-container">
                <p className="text-on-surface-variant">No BGP routes found from any RIPE RIS route collector for this resource.</p>
              </GlowingCard>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (isCommunity) {
    return (
      <div className="space-y-6">
        <GlowingCard delay={0.1} className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Building className="text-primary" size={24} />
            <h3 className="text-primary font-semibold font-outfit text-lg">BGP Community</h3>
          </div>
          <p className="text-4xl font-mono font-bold text-on-surface tracking-tight break-all">{result.community}</p>
          <p className="text-sm text-on-surface-variant mt-2">Context from Target ASN:</p>
        </GlowingCard>
        {content}
      </div>
    );
  }

  return <div className="space-y-6 pb-12">{content}</div>;
}
