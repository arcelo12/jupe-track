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
  
  // Prevent horizontal scroll in dialog
  React.useEffect(() => {
    if (!open || !mounted) return;
    
    // Prevent body scroll when dialog is open
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, mounted]);
  
  if (!mounted || !open) return null;
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop - clickable overlay with smooth transition */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer transition-opacity duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
        role="button"
        tabIndex={-1}
      />
      
      {/* Dialog Container - Fixed responsive sizing per UI/UX Pro Max §5 */}
      <div
        data-chart-dialog-wrapper
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "chart-dialog-title" : undefined}
        aria-describedby={description ? "chart-dialog-description" : undefined}
        className="relative w-full rounded-xl border border-[#2A2E35] bg-surface-container-lowest shadow-2xl overflow-hidden"
        style={{
          // Responsive sizing: max-width follows viewport, min-width ensures usability
          maxWidth: 'min(100vw - 2rem, 72rem)',
          maxHeight: '90vh',
          margin: 'auto',
          transform: 'scale(1)',
        }}
      >
        {/* Header - Compact spacing with clear hierarchy */}
        {(title || description) && (
          <div className="flex items-center justify-between border-b border-[#2A2E35] px-6 py-4">
            <div className="flex flex-col gap-1 flex-shrink-0">
              {title && (
                <h2 id="chart-dialog-title" className="font-mono text-lg font-bold leading-tight text-on-surface">
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
              onClick={() => onOpenChange(false)}
              className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:bg-surface-container-high active:scale-95 transition-transform cursor-pointer"
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
        
        {/* Chart Content Container - Strict width constraint to prevent overflow */}
        <div className="w-full box-border overflow-x-hidden">
          <div className="flex w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChartDialog;
