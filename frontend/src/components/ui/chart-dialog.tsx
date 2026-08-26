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
  
  // Prevent zero-size during initial mount before DOM measures
  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number } | null>(null);
  
  // Measure actual container size after dialog opens
  React.useEffect(() => {
    if (!open) return;
    
    const element = document.querySelector('[data-chart-dialog-wrapper]');
    if (!element) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });
    
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - pointer-events-auto saat open untuk catch clicks */}
      <div 
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity",
          !open && "pointer-events-none"
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      
      {/* Dialog Container - animate dengan transform untuk smooth exit */}
      <div
        data-chart-dialog-wrapper
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "chart-dialog-title" : undefined}
        aria-describedby={description ? "chart-dialog-description" : undefined}
        className={cn(
          "relative w-full max-w-7xl rounded-xl border border-[#2A2E35] bg-surface-container-lowest p-0 shadow-2xl",
          "transition-all duration-200 ease-out",
          open ? "opacity-100 scale-100 translate-z-0" : "opacity-0 scale-95 -translate-z-0 pointer-events-none",
          className
        )}
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          maxWidth: '7xl',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-center justify-between border-b border-[#2A2E35] px-6 py-4">
            <div>
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
                  className="mt-1 text-xs uppercase tracking-[0.2em] text-on-surface-variant"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="group flex h-9 w-9 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:bg-surface-container-high active:scale-95 transition-transform"
              aria-label="Close dialog"
              type="button"
            >
              <svg 
                className="h-4 w-4 text-on-surface-variant transition-colors group-hover:text-on-surface" 
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
        
        {/* Chart Content with Measured Size */}
        <div 
          className="flex h-[450px] w-full items-stretch p-6"
          style={{
            minWidth: 'min-content',
            minHeight: '1px',
          }}
        >
          <div 
            style={{ 
              width: '100%', 
              height: '100%', 
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              minWidth: containerSize?.width ? `${containerSize.width}px` : '100%',
              minHeight: containerSize?.height ? `${containerSize.height}px` : '450px',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChartDialog;
