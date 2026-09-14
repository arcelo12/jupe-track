"use client";

import * as React from "react";

interface ChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function ChartDialog({ 
  open, 
  onOpenChange, 
  title,
  description,
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
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
        className="relative w-full rounded border border-outline-variant bg-surface-container-lowest animate-in fade-in-0 zoom-in-95 duration-200 ease-out overflow-hidden"
        style={{
          maxWidth: 'min(95vw, min(90%, 80rem))',
          maxHeight: 'calc(min(90vh, 80dvh))',
          margin: 'auto',
          width: 'fit-content',
        }}
      >
        {/* Header - Responsive spacing */}
        {(title || description) && (
          <div className="flex items-center justify-between border-b border-outline-variant px-3 sm:px-4 md:px-6 py-2 sm:py-3">
            <div className="flex flex-col gap-1">
              {title && (
                <h2 id="chart-dialog-title" className="font-mono text-base sm:text-lg font-bold leading-tight text-on-surface">
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
        
        {/* Chart Content - Fully responsive container that adapts to page/resolution */}
        <div 
          className="w-full" 
          style={{ 
            height: 'auto',
            maxHeight: 'calc(min(90vh, 80dvh) - 120px)',
            boxSizing: 'border-box', 
            padding: '0.5rem 1rem',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default ChartDialog;
