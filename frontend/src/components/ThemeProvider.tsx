"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_CHANGE_EVENT = "jupetrack:theme-change";

function getTheme(): Theme {
  return localStorage.getItem("theme") === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function subscribeToTheme(onStoreChange: () => void) {
  const syncTheme = () => {
    applyTheme(getTheme());
    onStoreChange();
  };

  window.addEventListener("storage", syncTheme);
  window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
  return () => {
    window.removeEventListener("storage", syncTheme);
    window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, getTheme, () => "dark");

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
