import React from 'react';
import { Network, ArrowRight, Cloud, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function ASPathGraph({ asPath }: { asPath: string }) {
  if (!asPath || asPath === 'Local' || asPath === 'Direct') {
    return (
      <div className="flex items-center gap-2 mt-2 p-2 bg-surface-container-high rounded-lg border border-[#2A2E35] w-max">
        <Server size={14} className="text-primary" />
        <span className="text-xs font-mono text-on-surface">Local / Direct Route</span>
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
    <div className="mt-2 w-full bg-surface-container rounded-xl border border-[#2A2E35] overflow-hidden">
      <div className="px-3 py-1.5 bg-surface-container-high border-b border-[#2A2E35] flex items-center gap-2">
        <Network size={12} className="text-primary" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">AS Path Topology</span>
      </div>
      <ScrollArea className="w-full">
        <div className="flex items-center gap-2 min-w-max p-4">
          {/* Origin Node (This Router) */}
          <div className="flex flex-col items-center justify-center bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2 shadow-none relative group">
            <Server size={16} className="text-primary mb-1" />
            <span className="text-[10px] font-bold text-on-surface">Local Router</span>
          </div>

          {asns.length > 0 && (
            <ArrowRight size={14} className="text-on-surface-variant shrink-0" />
          )}

          {asns.map((asn, idx) => (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center justify-center bg-surface-container-highest border border-[#2A2E35] rounded-lg px-4 py-2 hover:border-primary transition-colors cursor-help group relative shadow-sm">
                <Cloud size={16} className="text-primary mb-1 group-hover:text-primary-hover transition-colors" />
                <span className="text-[11px] font-mono font-bold text-on-surface">AS {asn}</span>
              </div>
              
              {idx < asns.length - 1 && (
                <ArrowRight size={14} className="text-on-surface-variant shrink-0" />
              )}
            </React.Fragment>
          ))}

          <ArrowRight size={14} className="text-on-surface-variant shrink-0" />
          
          {/* Final Destination / Origin Code */}
          <div className="flex flex-col items-center justify-center bg-surface-container-high border border-[#2A2E35] rounded-lg px-3 py-2">
            <Badge variant="outline" className={`text-[9px] uppercase border-none px-1.5 py-0 mb-1 ${
              originCode === 'IGP' ? 'bg-primary/20 text-primary' :
              originCode === 'EGP' ? 'bg-primary/20 text-primary' :
              'bg-primary/10 text-primary'
            }`}>
              {originCode}
            </Badge>
            <span className="text-[9px] text-on-surface-variant">Origin</span>
          </div>
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  );
}
