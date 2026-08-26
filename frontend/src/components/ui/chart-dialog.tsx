"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartDialog({ 
  open, 
  onOpenChange, 
  title,
  description,
  children,
  className
}: ChartDialogProps) {
  
  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number } | null>(null);
  
  // Keyboard shortcut: ESC to close dialog (Accessibility §1)
  React.useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);
  
  // Measure container after open animation completes
  React.useEffect(() => {
    if (!open) return;
    
    const timer = setTimeout(() => {
      const element = document.querySelector('[data-chart-dialog-wrapper]');
      if (!element) return;
      
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setContainerSize({ width: Math.round(width), height: Math.round(height) });
            observer.disconnect();
          }
        }
      });
      
      observer.observe(element);
    }, 100);
    
    return () => {
      clearTimeout(timer);
    };
  }, [open]);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
        role="button"
        tabIndex={-1}
      />
      
      {/* Dialog Container - Clean structure, minimal inline styles */}
      <div
        data-chart-dialog-wrapper
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "chart-dialog-title" : undefined}
        aria-describedby={description ? "chart-dialog-description" : undefined}
        className={cn(
          "relative w-full max-w-7xl rounded-xl border border-[#2A2E35] bg-surface-container-lowest p-0 shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
          "max-h-[90vh] overflow-hidden",
          className
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-center justify-between border-b border-[#2A2E35] px-6 py-4">
            <div className="flex flex-col gap-1">
              {title && (
                <h2 
                  id="chart-dialog-title"
                  className="font-mono text-xl font-bold leading-tight text-on-surface"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p 
                  id="chart-dialog-description"
                  className="text-xs uppercase tracking-[0.2em] text-on-surface-variant"
                >
                  {description}
                </p>
              )}
            </div>
            {/* Close button - Touch target min 44×44px per UI/UX Pro Max §2 */}
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
        
        {/* Chart Content - Use responsive sizing via container query context */}
        <div className="flex h-[450px] w-full items-stretch p-6">
          <div className="flex h-full w-full flex-col box-border">
            {/* Measured size injected here if available, fallback to full width/height */}
            <div 
              style={{
                minWidth: containerSize?.width ? `${containerSize.width}px` : '100%',
                minHeight: containerSize?.height ? `${containerSize.height}px` : '100%',
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChartDialog;
