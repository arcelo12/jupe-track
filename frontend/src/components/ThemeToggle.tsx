"use client";

import { useTheme } from "./ThemeProvider";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-primary/10"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
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
