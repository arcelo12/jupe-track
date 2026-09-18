"use client";

import * as React from "react";

interface ChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Fixed height for the chart area (px). Defaults to 320 — recharts
   * ResponsiveContainer needs a determinate container height to render. */
  chartHeight?: number;
  children: React.ReactNode;
}

export function ChartDialog({
  open,
  onOpenChange,
  title,
  description,
  chartHeight = 320,
  children
}: ChartDialogProps) {
  
  const [mounted, setMounted] = React.useState(false);
  
  // Mount guard for stable rendering
  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  // ESC key to close (Accessibility §1)
  React.useEffect(() => {
    if (!open || !mounted) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, mounted, onOpenChange]);
  
  if (!mounted || !open) return null;
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-2 sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 cursor-pointer bg-background/80"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      
      {/* Dialog Container - Responsive per UI/UX Pro Max §5 Layout & Responsive guidelines */}
      <div
        data-chart-dialog-wrapper
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "chart-dialog-title" : undefined}
        aria-describedby={description ? "chart-dialog-description" : undefined}
        className="relative w-full min-w-0 rounded border border-outline-variant bg-surface-container-lowest animate-in fade-in-0 zoom-in-95 duration-200 ease-out overflow-hidden"
        style={{
          maxWidth: 'min(calc(100dvw - 1rem), 80rem)',
          maxHeight: 'calc(min(90vh, 80dvh))',
          margin: 'auto',
          // 'fit-content' collapses to 0 with a 100%-width recharts child,
          // leaving the chart invisible — use the full allowed width instead.
          width: '100%',
        }}
      >
        {/* Header - Responsive spacing */}
        {(title || description) && (
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-outline-variant px-3 py-2 sm:px-4 sm:py-3 md:px-6">
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              {title && (
                <h2 id="chart-dialog-title" className="truncate font-mono text-base sm:text-lg font-bold leading-tight text-on-surface">
                  {title}
                </h2>
              )}
              {description && (
                <p id="chart-dialog-description" className="text-xs uppercase tracking-widest text-on-surface-variant mt-0.5">
                  {description}
                </p>
              )}
            </div>
            {/* Close button - Touch target 44×44px per UI/UX Pro Max §2 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
              className="group flex h-11 w-11 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:bg-surface-container-high active:scale-95 transition-transform cursor-pointer"
              aria-label="Close dialog"
              type="button"
            >
              <svg 
                className="h-5 w-5 text-on-surface-variant transition-colors group-hover:text-on-surface" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round" 
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Chart Content — needs a DETERMINATE height: children use recharts
            ResponsiveContainer (width/height 100%), which measures its parent.
            With height:'auto' here the chart collapses to 0px and renders
            nothing, even though the card/header are visible. */}
        <div
          className="w-full"
          style={{
            height: `${chartHeight}px`,
            minHeight: '220px',
            maxHeight: 'calc(min(90vh, 80dvh) - 120px)',
            boxSizing: 'border-box',
            padding: '0.5rem 0.5rem 1rem',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default ChartDialog;
