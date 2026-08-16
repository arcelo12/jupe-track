import React, { useState, useMemo } from 'react';
import { Route, ShieldCheck, Activity, Share2, Server, Network, CheckCircle2 } from 'lucide-react';
import { ASPathGraph } from './ASPathGraph';

export const parseRoutes = (text: string) => {
  if (!text) return [];
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

    if (!line.match(/^\s/)) {
      const prefixMatch = line.match(/^([0-9a-fA-F:\.\/]+)/);
      if (prefixMatch) {
        currentPrefix = prefixMatch[1];
      }
      
      const entryPart = line.substring(currentPrefix.length).trim();
      if (entryPart.startsWith('*[') || entryPart.startsWith('[')) {
        pushEntry();
        currentEntry = createEntry(currentPrefix, entryPart.startsWith('*'), line);
        parseBriefLine(entryPart, currentEntry);
      }
      continue;
    }

    const trimmed = line.trim();
    const isNewEntryBrief = trimmed.match(/^\*?\[.*?\/.*?\]/) || trimmed.match(/^\*?\[.*?\]\s+\d/);
    
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
  
  entries.sort((a, b) => {
    if (a.prefix === b.prefix) {
      return (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1;
    }
    return a.prefix.localeCompare(b.prefix);
  });

  return entries;
};

export function RouteResultViewer({ rawOutput }: { rawOutput: string }) {
  const [viewMode, setViewMode] = useState<'raw' | 'parsed'>('parsed');

  // Hooks must run unconditionally on every render (Rules of Hooks), so compute
  // this before any early return. parseRoutes("") is a safe no-op.
  const parsedRoutes = useMemo(() => parseRoutes(rawOutput), [rawOutput]);

  if (!rawOutput) {
    return <div className="text-on-surface-variant">No output.</div>;
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-end gap-2 mb-3 px-4 pt-2">
        <button
          type="button"
          onClick={() => setViewMode('parsed')}
          className={`px-3 py-1 text-xs rounded-full transition-all ${
            viewMode === 'parsed' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Simplified View
        </button>
        <button
          type="button"
          onClick={() => setViewMode('raw')}
          className={`px-3 py-1 text-xs rounded-full transition-all ${
            viewMode === 'raw' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Raw Output
        </button>
      </div>

      <div className="p-4 overflow-auto">
        {viewMode === 'raw' ? (
          <pre className="text-xs md:text-sm font-mono text-primary whitespace-pre leading-relaxed font-light select-text">
            {rawOutput}
          </pre>
        ) : (
          <div className="space-y-4">
            
            {parsedRoutes.length === 0 ? (
              <div className="text-on-surface-variant text-center py-10 italic">
                <p>No parsable routes found.</p>
                <button type="button" onClick={() => setViewMode('raw')} className="mt-2 text-primary hover:underline">
                  Switch to Raw Output
                </button>
              </div>
            ) : (
              parsedRoutes.map((r, i) => (
                <div key={i} className={`bg-surface-container border ${r.isActive ? 'border-primary shadow-none' : 'border-[#2A2E35] opacity-80'} rounded-xl p-4 transition-colors`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#2A2E35] pb-3 mb-3 gap-2">
                    <div className="flex items-center gap-2">
                      <Route className={r.isActive ? "text-primary" : "text-on-surface-variant"} size={18} />
                      <h3 className="text-lg font-mono font-bold text-on-surface">{r.prefix}</h3>
                      {r.isActive && (
                        <div className="flex items-center gap-1 bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                          <CheckCircle2 size={12} /> Active
                        </div>
                      )}
                    </div>
                    {r.protocol && (
                      <span className="px-2 py-1 bg-surface-container-high rounded text-xs font-bold text-primary inline-block self-start md:self-auto">
                        {r.protocol.toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-3">
                      {r.nextHops.length > 0 && (
                        <div className="flex items-start gap-2 bg-surface-container-high p-2 rounded-lg">
                          <Share2 className="text-primary mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block mb-0.5">Next Hop</span>
                            <div className="font-mono text-sm text-on-surface break-words">
                              {r.nextHops.map((nh: string, j: number) => (
                                <div key={j}>{nh}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {r.state && (
                        <div className="flex items-start gap-2 bg-surface-container-high p-2 rounded-lg">
                          <Activity className="text-primary mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block mb-0.5">State</span>
                            <span className="font-mono text-sm text-on-surface">{r.state}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      {r.peerAs && !r.asPath && (
                        <div className="flex items-start gap-2 bg-surface-container-high p-2 rounded-lg">
                          <Network className="text-primary mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block mb-0.5">Peer AS</span>
                            <span className="font-mono text-sm text-on-surface break-words block max-w-full">
                              {r.peerAs}
                            </span>
                          </div>
                        </div>
                      )}

                      {r.communities && (
                        <div className="flex items-start gap-2 bg-surface-container-high p-2 rounded-lg">
                          <Server className="text-primary mt-0.5 shrink-0" size={14} />
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block mb-0.5">Communities</span>
                            <span className="font-mono text-xs text-on-surface block break-words max-w-full">
                              {r.communities}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {(r.localpref || r.metric || r.preference || r.age) && (
                        <div className="flex items-start gap-2 bg-surface-container-high p-2 rounded-lg">
                          <ShieldCheck className="text-error mt-0.5 shrink-0" size={14} />
                          <div className="w-full">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block mb-0.5">Attributes</span>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              {r.localpref && (
                                <div><span className="text-[10px] text-on-surface-variant block">LocalPref:</span> <span className="font-mono text-sm text-on-surface">{r.localpref}</span></div>
                              )}
                              {r.metric && (
                                <div><span className="text-[10px] text-on-surface-variant block">Metric:</span> <span className="font-mono text-sm text-on-surface">{r.metric}</span></div>
                              )}
                              {r.preference && (
                                <div><span className="text-[10px] text-on-surface-variant block">Pref:</span> <span className="font-mono text-sm text-on-surface">{r.preference}</span></div>
                              )}
                              {r.age && (
                                <div><span className="text-[10px] text-on-surface-variant block">Age:</span> <span className="font-mono text-sm text-on-surface">{r.age}</span></div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {r.asPath && (
                    <div className="mt-4">
                      <ASPathGraph asPath={r.asPath} />
                    </div>
                  )}
                  
                  <details className="mt-4 border-t border-[#2A2E35] pt-3 group">
                    <summary className="text-xs text-on-surface-variant cursor-pointer hover:text-on-surface focus:outline-none select-none">
                      Show full raw entry
                    </summary>
                    <pre className="mt-2 text-xs font-mono text-primary/70 overflow-x-auto p-2 bg-surface-container rounded border border-[#2A2E35]">
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
