import React from 'react';
import { Server, Globe, Building, Activity, CheckCircle, XCircle } from 'lucide-react';

export function LookupResultViewer({ result }: { result: any }) {
  if (!result || (!result.data && !result.asn_context)) {
    return (
      <div className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-sm text-green-400 font-mono">
        {JSON.stringify(result, null, 2)}
      </div>
    );
  }

  // Community logic wrapping the ASN data
  const isCommunity = result.community && result.asn_context;
  const data = isCommunity ? result.asn_context.data : result.data;

  const content = (
    <>
      {/* Render IP Lookup (network-info) */}
      {data?.prefix && data?.asns && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/80 border border-slate-700/50 p-5 rounded-xl shadow-inner">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="text-blue-400" size={20} />
              <h3 className="text-slate-300 font-semibold">Network Prefix</h3>
            </div>
            <p className="text-2xl font-mono text-white">{data.prefix}</p>
          </div>
          
          <div className="bg-slate-900/80 border border-slate-700/50 p-5 rounded-xl shadow-inner">
            <div className="flex items-center gap-3 mb-2">
              <Server className="text-purple-400" size={20} />
              <h3 className="text-slate-300 font-semibold">Origin ASNs</h3>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {data.asns.map((asn: string) => (
                <span key={asn} className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg font-mono text-sm">
                  AS{asn}
                </span>
              ))}
              {data.asns.length === 0 && <span className="text-slate-500 italic">No origin ASNs found</span>}
            </div>
          </div>
        </div>
      )}

      {/* Render ASN Lookup (as-overview) */}
      {data?.type === 'as' && data?.resource && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/80 border border-slate-700/50 p-5 rounded-xl shadow-inner">
              <div className="flex items-center gap-3 mb-2">
                <Server className="text-blue-400" size={20} />
                <h3 className="text-slate-300 font-semibold">Autonomous System</h3>
              </div>
              <p className="text-3xl font-mono text-white">AS{data.resource}</p>
            </div>

            <div className="bg-slate-900/80 border border-slate-700/50 p-5 rounded-xl shadow-inner">
              <div className="flex items-center gap-3 mb-2">
                <Activity className={data.announced ? "text-emerald-400" : "text-rose-400"} size={20} />
                <h3 className="text-slate-300 font-semibold">Routing Status</h3>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {data.announced ? (
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg flex items-center gap-2">
                    <CheckCircle size={16} /> Announced
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg flex items-center gap-2">
                    <XCircle size={16} /> Not Announced
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-700/50 p-5 rounded-xl shadow-inner">
            <div className="flex items-center gap-3 mb-2">
              <Building className="text-orange-400" size={20} />
              <h3 className="text-slate-300 font-semibold">Holder / Description</h3>
            </div>
            <p className="text-lg text-slate-200 mt-1">{data.holder || 'Unknown'}</p>
            {data.block && (
              <p className="text-sm text-slate-500 mt-2">
                Registry: {data.block.name} (Block: {data.block.resource})
              </p>
            )}
          </div>
        </div>
      )}

      {/* Render Routing (looking-glass) */}
      {data?.rrcs && (
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-700/50 p-5 rounded-xl shadow-inner mb-4">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="text-cyan-400" size={20} />
              <h3 className="text-slate-300 font-semibold">Routing Status (Looking Glass)</h3>
            </div>
            <p className="text-sm text-slate-400">
              Showing BGP routes from RIPE RIS route collectors for resource 
              <strong className="text-cyan-400 ml-1">{data.parameters?.resource}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {data.rrcs.filter((rrc: any) => rrc.peers && rrc.peers.length > 0).map((rrc: any, idx: number) => (
              <div key={idx} className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2">
                  <div>
                    <h4 className="text-slate-200 font-bold flex items-center gap-2">
                      <Server size={16} className="text-emerald-400" /> {rrc.rrc}
                    </h4>
                    <p className="text-xs text-slate-500">{rrc.location}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 bg-slate-700 rounded text-slate-300">
                    {rrc.peers.length} peers
                  </span>
                </div>
                
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {rrc.peers.map((peer: any, pIdx: number) => (
                    <div key={pIdx} className="bg-slate-900/50 rounded p-3 text-sm flex flex-col gap-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Peer: <span className="text-slate-200 font-mono">{peer.peer}</span></span>
                        <span className="text-slate-400">Origin: <span className="text-purple-400 font-mono">AS{peer.asn_origin}</span></span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs mr-2">AS Path:</span>
                        <span className="font-mono text-emerald-400">{peer.as_path}</span>
                      </div>
                      {peer.next_hop && (
                        <div>
                          <span className="text-slate-500 text-xs mr-2">Next Hop:</span>
                          <span className="font-mono text-blue-400">{peer.next_hop}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {data.rrcs.filter((rrc: any) => rrc.peers && rrc.peers.length > 0).length === 0 && (
              <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl text-center">
                <p className="text-slate-400">No BGP routes found from any RIPE RIS route collector for this resource.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (isCommunity) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/80 border border-purple-500/30 p-5 rounded-xl shadow-inner">
          <div className="flex items-center gap-3 mb-2">
            <Building className="text-purple-400" size={20} />
            <h3 className="text-purple-300 font-semibold">BGP Community</h3>
          </div>
          <p className="text-3xl font-mono text-white">{result.community}</p>
          <p className="text-sm text-slate-400 mt-2">Context from Target ASN:</p>
        </div>
        {content}
      </div>
    );
  }

  return content;
}
