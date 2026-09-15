"use client";

import { useTheme } from "./ThemeProvider";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme, isSaving } = useTheme();
  const label = isSaving
    ? "Saving theme preference..."
    : theme === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode";

  return (
    <button
      onClick={toggleTheme}
      disabled={isSaving}
      className="flex items-center justify-center h-11 min-w-11 sm:h-auto text-on-surface-variant hover:text-primary transition-colors px-2 py-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <Sun size={14} className="mr-1.5" />
      ) : (
        <Moon size={14} className="mr-1.5" />
      )}
      <span className="text-xs">Theme</span>
    </button>
  );
}
