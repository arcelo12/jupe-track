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
