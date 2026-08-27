"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Mock shadcn Dialog primitives (simplified version for this project)
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

const Dialog = ({ open = true, children }: DialogProps) => {
  if (!open) return null;
  return <>{children}</>;
};

const DialogContent = ({ children, className, ...props }: DialogContentProps) => {
  return (
    <div
      {...props}
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center p-4",
        // Backdrop
        "data-state-open:animate-in data-state-closed:animate-out",
        "data-state-open:fade-in data-state-closed:fade-out",
        "data-state-open:duration-200 data-state-closed:duration-200",
        "bg-black/40 backdrop-blur-sm cursor-pointer"
      )}
      onClick={() => props.onOpenChange?.(false)}
      role="button"
      aria-hidden="true"
      tabIndex={-1}
    >
      {/* Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full max-w-[1200px] rounded-xl border border-[#2A2E35]",
          "bg-surface-container-lowest p-0 shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
          "max-h-[90vh] overflow-hidden",
          className
        )}
        style={{ maxWidth: 'min(calc(100vw - 32px), 72rem)' }}
      >
        {children}
      </div>
    </div>
  );
};

const DialogHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex flex-col gap-2 p-6 pb-4", className)}>
    {children}
  </div>
);

const DialogTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h2 className={cn("text-xl font-bold leading-tight text-on-surface", className)}>
    {children}
  </h2>
);

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
  
  const [mounted, setMounted] = React.useState(false);
  
  // Mount guard for stable rendering
  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  // Keyboard shortcut: ESC to close dialog (Accessibility §1)
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
  
  // Measure container after mount for responsive sizing
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number } | null>(null);
  
  React.useEffect(() => {
    if (!open || !mounted || !containerRef.current) return;
    
    const timer = setTimeout(() => {
      const element = containerRef.current;
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
      // Observer cleanup handled by ResizeObserver
    };
  }, [open, mounted]);
  
  if (!mounted) return null;
  if (!open) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={containerRef} className={className}>
        {/* Header */}
        {(title || description) && (
          <DialogHeader className="border-b border-[#2A2E35] px-6 py-4">
            <div className="flex flex-col gap-1">
              <DialogTitle className="font-mono text-xl font-bold leading-tight text-on-surface">
                {title}
              </DialogTitle>
              {description && (
                <p className="text-xs uppercase tracking-[0.2em] text-on-surface-variant">
                  {description}
                </p>
              )}
            </div>
            {/* Close button - Touch target min 44×44px per UI/UX Pro Max §2 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
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
          </DialogHeader>
        )}
        
        {/* Chart Content - Fixed height with proper flex sizing */}
        <div className="flex h-[450px] w-full box-border items-stretch p-6">
          <div className="flex h-full w-full flex-col box-border">
            <div className="flex h-full w-full flex-1">
              {children}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ChartDialog;
