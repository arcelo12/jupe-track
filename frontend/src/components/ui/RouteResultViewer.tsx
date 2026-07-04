import React, { useState } from 'react';
import { Route, Search, ShieldCheck, Activity, Share2, Server, Clock, Settings, Network, CheckCircle2 } from 'lucide-react';

export function RouteResultViewer({ rawOutput }: { rawOutput: string }) {
  const [viewMode, setViewMode] = useState<'raw' | 'parsed'>('parsed');

  if (!rawOutput) {
    return <div className="text-slate-400">No output.</div>;
  }

  const parseRoutes = (text: string) => {
    const lines = text.split('\n');
    const entries: any[] = [];
    
    let currentPrefix = "";
    let currentEntry: any = null;

    const pushEntry = () => {
      if (currentEntry) {
        entries.push(currentEntry);
        currentEntry = null;
      }
    };

    const createEntry = (prefix: string, isActive: boolean, rawLine: string) => {
      return {
        prefix,
        isActive,
        rawLines: [rawLine],
        asPath: '', communities: '', nextHops: [], protocol: '', preference: '', localpref: '', metric: '', age: '', peerAs: '', state: ''
      };
    };

    const parseBriefLine = (trimmed: string, entry: any) => {
      const match = trimmed.match(/\*?\[(.*?)\/(.*?)\]\s+(.*)/);
      if (match) {
        entry.protocol = match[1];
        entry.preference = match[2];
        entry.age = match[3].split(',')[0].trim();
      } else {
        // sometimes no preference, just protocol
        const fallback = trimmed.match(/\*?\[(.*?)\]\s+(.*)/);
        if (fallback) {
          entry.protocol = fallback[1];
          entry.age = fallback[2].split(',')[0].trim();
        }
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.startsWith('inet.0:') || line.includes('destinations') || line.includes('routes') || line.startsWith('+ =')) {
        continue;
      }

      // New Prefix Block
      if (!line.match(/^\s/)) {
        const prefixMatch = line.match(/^([0-9a-fA-F:\.\/]+)/);
        if (prefixMatch) {
          currentPrefix = prefixMatch[1];
        }
        
        // Inline brief format?
        let entryPart = line.substring(currentPrefix.length).trim();
        if (entryPart.startsWith('*[') || entryPart.startsWith('[')) {
          pushEntry();
          currentEntry = createEntry(currentPrefix, entryPart.startsWith('*'), line);
          parseBriefLine(entryPart, currentEntry);
        } else {
          // Just the prefix line (detail/extensive format)
          // We don't create an entry yet until we see the protocol line
        }
        continue;
      }

      const trimmed = line.trim();
      
      // Check if line looks like start of a new entry
      // Protocol lines usually have Preference or Metric, or are just single words like 'Direct'
      const isNewEntryBrief = trimmed.match(/^\*?\[.*?\/.*?\]/) || trimmed.match(/^\*?\[.*?\]\s+\d/);
      
      // Specifically avoid matching lone words like "Accepted", "Announced", etc. that show up in BGP routes
      let isNewEntryDetail = line.match(/^\s+(\*?)([A-Z][a-zA-Z0-9]+)\s+Preference:/) || 
                             line.match(/^\s+(\*?)([A-Z][a-zA-Z0-9]+)\s+Metric:/);
      if (!isNewEntryDetail) {
        const simpleMatch = line.match(/^\s+(\*?)([A-Z][a-zA-Z0-9]+)$/);
        if (simpleMatch && !['Accepted', 'Announced', 'Multipath', 'Resolve'].includes(line.trim())) {
          isNewEntryDetail = simpleMatch;
        }
      }
      
      if (isNewEntryBrief || isNewEntryDetail) {
        pushEntry();
        currentEntry = createEntry(currentPrefix, trimmed.startsWith('*'), line);
        
        if (isNewEntryBrief) {
           parseBriefLine(trimmed, currentEntry);
        } else if (isNewEntryDetail) {
           currentEntry.protocol = isNewEntryDetail[2];
           if (line.includes('Preference:')) currentEntry.preference = line.split('Preference:')[1].trim().split(' ')[0];
        }
        continue;
      }

      // Inside an entry, parse attributes
      if (currentEntry) {
        currentEntry.rawLines.push(line);
        if (line.includes('> via') || line.includes('> to')) {
          currentEntry.nextHops.push(trimmed.replace(/^> /, ''));
        } else if (trimmed.startsWith('Next hop:')) {
          const nh = line.split('Next hop:')[1].split(',')[0].trim();
          if (nh) currentEntry.nextHops.push(nh);
        }
        if (line.includes('AS path:')) {
          currentEntry.asPath = line.split('AS path:')[1].trim();
        }
        if (line.includes('Communities:')) {
          currentEntry.communities = line.split('Communities:')[1].trim();
        }
        if (line.includes('Localpref:')) {
          currentEntry.localpref = line.split('Localpref:')[1].trim();
        }
        if (line.includes('Metric:')) {
          const match = line.match(/Metric:\s*(\d+)/);
          if (match) currentEntry.metric = match[1];
        }
        if (line.includes('Age:')) {
          const match = line.match(/Age:\s*([^\s]+)/);
          if (match) currentEntry.age = match[1];
        }
        if (line.includes('State: ') && !line.includes('Validation State:')) {
          currentEntry.state = line.split('State:')[1].trim();
        }
        if (line.includes('Peer AS:')) {
          const match = line.match(/Peer AS:\s*(\d+)/);
          if (match) currentEntry.peerAs = match[1];
        }
      }
    }
    pushEntry();
    
    // Sort so active entries (*) are first
    entries.sort((a, b) => {
      // If same prefix, active goes first
      if (a.prefix === b.prefix) {
        return (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1;
      }
      return a.prefix.localeCompare(b.prefix);
    });

    return entries;
  };

  const parsedRoutes = parseRoutes(rawOutput);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-end gap-2 mb-3 px-4 pt-2">
        <button
          type="button"
          onClick={() => setViewMode('parsed')}
          className={`px-3 py-1 text-xs rounded-full transition-all ${
            viewMode === 'parsed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Simplified View
        </button>
        <button
          type="button"
          onClick={() => setViewMode('raw')}
          className={`px-3 py-1 text-xs rounded-full transition-all ${
            viewMode === 'raw' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Raw Output
        </button>
      </div>

      <div className="p-4 bg-black/40 min-h-[400px] max-h-[600px] overflow-auto">
        {viewMode === 'raw' ? (
          <pre className="text-xs md:text-sm font-mono text-emerald-400 whitespace-pre leading-relaxed font-light select-text">
            {rawOutput}
          </pre>
        ) : (
          <div className="space-y-4">
            {parsedRoutes.length === 0 ? (
              <div className="text-slate-500 text-center py-10 italic">
                <p>No parsable routes found.</p>
                <button type="button" onClick={() => setViewMode('raw')} className="mt-2 text-emerald-500 hover:underline">
                  Switch to Raw Output
                </button>
              </div>
            ) : (
              parsedRoutes.map((r, i) => (
                <div key={i} className={`bg-slate-900 border ${r.isActive ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-slate-700/50 opacity-80'} rounded-xl p-4 transition-colors`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3 mb-3 gap-2">
                    <div className="flex items-center gap-2">
                      <Route className={r.isActive ? "text-emerald-400" : "text-slate-500"} size={18} />
                      <h3 className="text-lg font-mono font-bold text-white">{r.prefix}</h3>
                      {r.isActive && (
                        <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                          <CheckCircle2 size={12} /> Active
                        </div>
                      )}
                    </div>
                    {r.protocol && (
                      <span className="px-2 py-1 bg-slate-800 rounded text-xs font-bold text-emerald-400 inline-block self-start md:self-auto">
                        {r.protocol.toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-3">
                      {r.nextHops.length > 0 && (
                        <div className="flex items-start gap-2 bg-slate-950/30 p-2 rounded-lg">
                          <Share2 className="text-blue-400 mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">Next Hop</span>
                            <div className="font-mono text-sm text-slate-300 break-words">
                              {r.nextHops.map((nh: string, j: number) => (
                                <div key={j}>{nh}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {r.state && (
                        <div className="flex items-start gap-2 bg-slate-950/30 p-2 rounded-lg">
                          <Activity className="text-emerald-400 mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">State</span>
                            <span className="font-mono text-sm text-slate-300">{r.state}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      {(r.asPath || r.peerAs) && (
                        <div className="flex items-start gap-2 bg-slate-950/30 p-2 rounded-lg">
                          <Network className="text-purple-400 mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">AS Path / Peer</span>
                            <span className="font-mono text-sm text-slate-300 break-words block max-w-full">
                              {r.asPath ? r.asPath : `Peer AS: ${r.peerAs}`}
                            </span>
                          </div>
                        </div>
                      )}

                      {r.communities && (
                        <div className="flex items-start gap-2 bg-slate-950/30 p-2 rounded-lg">
                          <Server className="text-amber-400 mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">Communities</span>
                            <span className="font-mono text-xs text-slate-300 block break-words max-w-full">
                              {r.communities}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {(r.localpref || r.metric || r.preference || r.age) && (
                        <div className="flex items-start gap-2 bg-slate-950/30 p-2 rounded-lg">
                          <ShieldCheck className="text-rose-400 mt-0.5 shrink-0" size={14} />
                          <div className="w-full">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-0.5">Attributes</span>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              {r.localpref && (
                                <div><span className="text-[10px] text-slate-500 block">LocalPref:</span> <span className="font-mono text-sm text-slate-300">{r.localpref}</span></div>
                              )}
                              {r.metric && (
                                <div><span className="text-[10px] text-slate-500 block">Metric:</span> <span className="font-mono text-sm text-slate-300">{r.metric}</span></div>
                              )}
                              {r.preference && (
                                <div><span className="text-[10px] text-slate-500 block">Pref:</span> <span className="font-mono text-sm text-slate-300">{r.preference}</span></div>
                              )}
                              {r.age && (
                                <div><span className="text-[10px] text-slate-500 block">Age:</span> <span className="font-mono text-sm text-slate-300">{r.age}</span></div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <details className="mt-4 border-t border-slate-800 pt-3 group">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 focus:outline-none select-none">
                      Show full raw entry
                    </summary>
                    <pre className="mt-2 text-xs font-mono text-emerald-500/70 overflow-x-auto p-2 bg-black/30 rounded border border-white/5">
                      {r.rawLines.join('\n')}
                    </pre>
                  </details>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
