import React from 'react';
import { Network, ArrowRight, Cloud, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function ASPathGraph({ asPath }: { asPath: string }) {
  if (!asPath || asPath === 'Local' || asPath === 'Direct') {
    return (
      <div className="flex items-center gap-2 mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50 w-max">
        <Server size={14} className="text-emerald-400" />
        <span className="text-xs font-mono text-slate-300">Local / Direct Route</span>
      </div>
    );
  }

  const parts = asPath.trim().split(/\s+/);
  let originCode = "Unknown";
  
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last === 'I') {
      originCode = "IGP";
      parts.pop();
    } else if (last === 'E') {
      originCode = "EGP";
      parts.pop();
    } else if (last === '?') {
      originCode = "Incomplete";
      parts.pop();
    }
  }

  // Handle confederations or AS sets (e.g. [ 1 2 3 ] or ( 1 2 3 ))
  // For simplicity, we just join them back if they got split, or treat them as raw strings
  const asns = [];
  let inBracket = false;
  let currentGroup = "";
  for (const p of parts) {
    if (p.startsWith('[') || p.startsWith('{') || p.startsWith('(')) {
      inBracket = true;
      currentGroup = p;
    } else if (inBracket) {
      currentGroup += " " + p;
      if (p.endsWith(']') || p.endsWith('}') || p.endsWith(')')) {
        inBracket = false;
        asns.push(currentGroup);
        currentGroup = "";
      }
    } else {
      asns.push(p);
    }
  }
  if (currentGroup) {
    asns.push(currentGroup); // Unclosed bracket fallback
  }

  return (
    <div className="mt-2 w-full bg-slate-950/40 rounded-xl border border-white/5 overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-900/60 border-b border-white/5 flex items-center gap-2">
        <Network size={12} className="text-purple-400" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">AS Path Topology</span>
      </div>
      <ScrollArea className="w-full">
        <div className="flex items-center gap-2 min-w-max p-4">
          {/* Origin Node (This Router) */}
          <div className="flex flex-col items-center justify-center bg-slate-900 border border-emerald-500/30 rounded-lg px-3 py-2 shadow-[0_0_15px_rgba(16,185,129,0.1)] relative group">
            <Server size={16} className="text-emerald-400 mb-1" />
            <span className="text-[10px] font-bold text-slate-300">Local Router</span>
          </div>

          {asns.length > 0 && (
            <ArrowRight size={14} className="text-slate-600 shrink-0" />
          )}

          {asns.map((asn, idx) => (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center justify-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-4 py-2 hover:border-purple-500/50 transition-colors cursor-help group relative shadow-sm">
                <Cloud size={16} className="text-purple-400 mb-1 group-hover:text-purple-300 transition-colors" />
                <span className="text-[11px] font-mono font-bold text-slate-200">AS {asn}</span>
              </div>
              
              {idx < asns.length - 1 && (
                <ArrowRight size={14} className="text-slate-600 shrink-0" />
              )}
            </React.Fragment>
          ))}

          <ArrowRight size={14} className="text-slate-600 shrink-0" />
          
          {/* Final Destination / Origin Code */}
          <div className="flex flex-col items-center justify-center bg-slate-900 border border-slate-700/50 rounded-lg px-3 py-2">
            <Badge variant="outline" className={`text-[9px] uppercase border-none px-1.5 py-0 mb-1 ${
              originCode === 'IGP' ? 'bg-emerald-500/20 text-emerald-400' :
              originCode === 'EGP' ? 'bg-blue-500/20 text-blue-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {originCode}
            </Badge>
            <span className="text-[9px] text-slate-500">Origin</span>
          </div>
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  );
}
