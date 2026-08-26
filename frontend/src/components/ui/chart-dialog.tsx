"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Responsive breakpoints dari Tailwind CSS v4
const BREAKPOINTS = {
  sm: 640,   // 16rem - Mobile landscape + tablets
  md: 768,   // 24rem - Tablet portrait  
  lg: 1024,  // 32rem - Laptop small
  xl: 1280,  // 40rem - Desktop
  "2xl": 1536 // 48rem - Large desktop
} as const;

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
  // Responsive sizing: 95vw di semua screens untuk charts full-width
  const [dialogWidth, setDialogWidth] = React.useState("100%");
  
  React.useEffect(() => {
    if (!open) return;
    
    const updateWidth = () => {
      const width = window.innerWidth;
      // Responsive constraints untuk usability tanpa limitasi excessive
      if (width < 768) {
        setDialogWidth(`${Math.min(100, 98)}vw`); // 98vw mobile
      } else if (width < 1024) {
        setDialogWidth(`${Math.min(100, 96)}vw`); // 96vw tablet
      } else {
        setDialogWidth(`${Math.min(100, 94)}vw`); // 94vw desktop
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [open]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur for depth */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      
      {/* Content container with responsive sizing */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "chart-dialog-title" : undefined}
        aria-describedby={description ? "chart-dialog-description" : undefined}
        className={cn(
          "relative w-full max-w-7xl rounded-xl border border-[#2A2E35] bg-surface-container-lowest p-0 shadow-2xl",
          "transition-all duration-200 ease-out",
          open ? "opacity-100 scale-100" : "opacity-0 scale-95",
          className
        )}
        style={{
          width: dialogWidth,
          maxWidth: '7xl', // Override default 4xl constraint
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
      >
        {/* Header section */}
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
            {/* Close button with touch-friendly size */}
            <button
              onClick={() => onOpenChange(false)}
              className="group flex h-9 w-9 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:bg-surface-container-high active:scale-95 transition-transform"
              aria-label="Close dialog"
              tabIndex={0}
              style={{ minWidth: '36px', minHeight: '36px' }}
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
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Chart content area - full width within container */}
        <div 
          className="flex h-[450px] w-full items-stretch p-6"
          style={{
            minHeight: '1px', // Prevent zero-size collapse
            minWidth: 'min-content' // Allow expansion
          }}
        >
          <div 
            style={{ 
              width: '100%', 
              height: '100%', 
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column'
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
