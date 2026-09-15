"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, toggleTheme, isSaving } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === "dark" : true;
  const label = !mounted
    ? "Theme"
    : isSaving
      ? "Saving theme preference..."
      : isDark
        ? "Switch to light mode"
        : "Switch to dark mode";

  const handleClick = () => {
    if (!mounted || isSaving) return;
    toggleTheme();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-disabled={!mounted || isSaving}
      className={cn(
        "flex items-center justify-center h-11 min-w-11 sm:h-auto text-on-surface-variant hover:text-primary transition-colors px-2 py-1.5 rounded hover:bg-primary/10",
        (!mounted || isSaving) && "opacity-50 cursor-not-allowed"
      )}
      aria-label={label}
      title={label}
    >
      {mounted ? (
        isDark ? (
          <Sun size={14} className="mr-1.5" />
        ) : (
          <Moon size={14} className="mr-1.5" />
        )
      ) : (
        <span className="w-3.5 h-3.5 mr-1.5 inline-block" aria-hidden="true" />
      )}
      <span className="text-xs">Theme</span>
    </button>
  );
}
