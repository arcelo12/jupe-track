import React, { useState } from 'react';
import { BGPPolicyItem } from '@/lib/types';

interface PolicyNodeProps {
  term: BGPPolicyItem;
  index: number;
}

export const PolicyNode = ({ term, index }: PolicyNodeProps) => {
  const [showAllFrom, setShowAllFrom] = useState(false);
  const fromLimit = 3;
  
  const displayedFrom = showAllFrom ? term.from_conditions : term.from_conditions.slice(0, fromLimit);
  const hasMoreFrom = term.from_conditions.length > fromLimit;

  return (
    <div className="relative pl-8 pb-8">
      {/* Vertical line connecting nodes */}
      <div className="absolute left-3.5 top-8 bottom-0 w-0.5 bg-slate-700/50 hidden group-last:hidden"></div>
      
      {/* Node bullet */}
      <div className="absolute left-2 top-2 w-3.5 h-3.5 rounded-full bg-slate-600 border border-slate-500 shadow-sm z-10"></div>

      <div className="glass-card shadow-lg border-l-4 border-l-purple-500 hover:border-l-purple-400 group">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-mono text-slate-200 font-semibold flex items-center gap-2">
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 rounded-full">Term {index + 1}</span>
            {term.term_name}
          </h4>
        </div>

        <div className="space-y-4">
          {/* From Conditions (Match) */}
          <div className="bg-slate-900/50 rounded-md p-3 border border-slate-700/30">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Match (From)
            </div>
            {term.from_conditions.length > 0 ? (
              <div className="space-y-1.5">
                {hasMoreFrom && (
                  <button 
                    onClick={() => setShowAllFrom(!showAllFrom)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 mb-2 font-medium transition-colors block"
                  >
                    {showAllFrom ? 'Show Less ↑' : `Show ${term.from_conditions.length - fromLimit} More ↓`}
                  </button>
                )}
                {displayedFrom.map((cond, i) => {
                  const [key, ...rest] = cond.split(' ');
                  return (
                    <div key={i} className="flex flex-wrap gap-2 text-sm font-mono items-center">
                      <span className="bg-slate-800 text-blue-300 px-2 py-0.5 rounded shadow-sm border border-slate-700/50">{key}</span>
                      <span className="text-slate-300">{rest.join(' ')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic">*Match all traffic*</div>
            )}
          </div>

          {/* Then Actions (Action) */}
          <div className="relative">
             <div className="absolute -top-3 left-4 w-0.5 h-3 bg-slate-700/50"></div>
             <div className="bg-slate-900/50 rounded-md p-3 border border-slate-700/30">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Action (Then)
              </div>
              <div className="flex flex-wrap gap-2">
                {term.then_actions.map((act, i) => {
                  const isAccept = act.includes('accept');
                  const isReject = act.includes('reject') || act.includes('discard');
                  
                  let colorClass = "bg-slate-800 text-slate-300 border-slate-700";
                  if (isAccept) colorClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                  if (isReject) colorClass = "bg-rose-500/20 text-rose-300 border-rose-500/30";

                  return (
                    <span key={i} className={`${colorClass} px-2.5 py-1 rounded-md text-sm font-mono border shadow-sm`}>
                      {act}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
