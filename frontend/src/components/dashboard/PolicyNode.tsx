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
      <div className="absolute left-3.5 top-8 bottom-0 w-0.5 bg-outline-variant hidden group-last:hidden"></div>
      
      {/* Node bullet */}
      <div className="absolute left-2 top-2 w-3.5 h-3.5 rounded-full bg-surface-container-highest border border-outline shadow-sm z-10"></div>

      <div className="glass-card shadow-lg border-l-4 border-l-primary hover:border-l-primary-hover group">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-mono text-on-surface font-semibold flex items-center gap-2">
            <span className="text-xs bg-primary/20 text-primary px-2 rounded-full">Term {index + 1}</span>
            {term.term_name}
          </h4>
        </div>

        <div className="space-y-4">
          {/* From Conditions (Match) */}
          <div className="bg-surface-container-high rounded-md p-3 border border-surface-container-highest">
            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              Match (From)
            </div>
            {term.from_conditions.length > 0 ? (
              <div className="space-y-1.5">
                {hasMoreFrom && (
                  <button 
                    onClick={() => setShowAllFrom(!showAllFrom)}
                    className="text-xs text-primary hover:text-primary-hover mb-2 font-medium transition-colors block"
                  >
                    {showAllFrom ? 'Show Less ↑' : `Show ${term.from_conditions.length - fromLimit} More ↓`}
                  </button>
                )}
                {displayedFrom.map((cond, i) => {
                  const [key, ...rest] = cond.split(' ');
                  return (
                    <div key={i} className="flex flex-wrap gap-2 text-sm font-mono items-center">
                      <span className="bg-surface-container-highest text-primary px-2 py-0.5 rounded shadow-sm border border-outline-variant">{key}</span>
                      <span className="text-on-surface">{rest.join(' ')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-on-surface-variant italic">*Match all traffic*</div>
            )}
          </div>

          {/* Then Actions (Action) */}
          <div className="relative">
             <div className="absolute -top-3 left-4 w-0.5 h-3 bg-outline-variant"></div>
             <div className="bg-surface-container-high rounded-md p-3 border border-surface-container-highest">
              <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Action (Then)
              </div>
              <div className="flex flex-wrap gap-2">
                {term.then_actions.map((act, i) => {
                  const isAccept = act.includes('accept');
                  const isReject = act.includes('reject') || act.includes('discard');
                  
                  let colorClass = "bg-surface-container-highest text-on-surface border-outline-variant";
                  if (isAccept) colorClass = "bg-primary/20 text-primary border-primary/30";
                  if (isReject) colorClass = "bg-error/20 text-error border-error/30";

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
