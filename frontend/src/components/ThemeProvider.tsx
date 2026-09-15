"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { authFetch, User } from "@/lib/auth";
import type { ThemePreset, ColorMode } from "@/lib/types";

export const PRESET_OPTIONS: { id: ThemePreset; name: string; description: string; accent: string; darkBg: string }[] = [
  { id: "graphite-mono", name: "Graphite Mono", description: "Neutral chrome; color reserved for status", accent: "#d6dbe0", darkBg: "#0e1012" },
  { id: "signal-blue", name: "Signal Blue", description: "Sharp, familiar NOC palette", accent: "#58a6ff", darkBg: "#0b0f14" },
  { id: "network-teal", name: "Network Teal", description: "Calm, technical network identity", accent: "#2dd4bf", darkBg: "#091313" },
  { id: "midnight-indigo", name: "Midnight Indigo", description: "Modern, low-glare expression", accent: "#8da2fb", darkBg: "#0c0d16" },
];

const PRESET_KEY = "jupetrack-theme-preset";
const MODE_KEY = "jupetrack-color-mode";

interface ThemeContextType {
  themePreset: ThemePreset;
  colorMode: ColorMode;
  theme: ColorMode; // back-compat with existing useTheme().theme
  isSaving: boolean;
  saveError: string | null;
  setThemePreference: (preset: ThemePreset, mode: ColorMode) => Promise<boolean>;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isValidPreset(p: string | null | undefined): p is ThemePreset {
  return p === "graphite-mono" || p === "signal-blue" || p === "network-teal" || p === "midnight-indigo";
}

function isValidMode(m: string | null | undefined): m is ColorMode {
  return m === "dark" || m === "light";
}

function applyThemeToDOM(preset: ThemePreset, mode: ColorMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.themePreset = preset;
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
}

function setLocalCache(preset: ThemePreset, mode: ColorMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRESET_KEY, preset);
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem("theme", mode);
  } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, updateUser } = useAuth();

  const [themePreset, setThemePreset] = useState<ThemePreset>(() => {
    if (typeof window === "undefined") return "graphite-mono";
    try {
      const cached = localStorage.getItem(PRESET_KEY);
      return isValidPreset(cached) ? cached : "graphite-mono";
    } catch {
      return "graphite-mono";
    }
  });

  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const cached = localStorage.getItem(MODE_KEY) || localStorage.getItem("theme");
      return isValidMode(cached) ? cached : "dark";
    } catch {
      return "dark";
    }
  });

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Synchronize DOM on state change
  useEffect(() => {
    applyThemeToDOM(themePreset, colorMode);
    setLocalCache(themePreset, colorMode);
  }, [themePreset, colorMode]);

  // Synchronize from authenticated server profile
  const lastSyncedUser = useRef<string | null>(null);
  useEffect(() => {
    if (isSavingRef.current) return;
    if (!user) {
      lastSyncedUser.current = null;
      return;
    }
    const userKey = `${user.id}:${user.theme_preset}:${user.color_mode}`;
    if (lastSyncedUser.current === userKey) return;
    lastSyncedUser.current = userKey;

    const serverPreset = isValidPreset(user.theme_preset) ? (user.theme_preset as ThemePreset) : "graphite-mono";
    const serverMode = isValidMode(user.color_mode) ? (user.color_mode as ColorMode) : "dark";

    setThemePreset(serverPreset);
    setColorMode(serverMode);
    applyThemeToDOM(serverPreset, serverMode);
    setLocalCache(serverPreset, serverMode);
  }, [user]);

  // Multi-tab synchronization
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (isSavingRef.current) return;
      if (e.key === PRESET_KEY || e.key === MODE_KEY || e.key === "theme") {
        const cachedPreset = localStorage.getItem(PRESET_KEY);
        const nextPreset = isValidPreset(cachedPreset) ? cachedPreset : "graphite-mono";
        const cachedMode = localStorage.getItem(MODE_KEY) || localStorage.getItem("theme");
        const nextMode = isValidMode(cachedMode) ? cachedMode : "dark";

        setThemePreset(nextPreset);
        setColorMode(nextMode);
        applyThemeToDOM(nextPreset, nextMode);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setThemePreference = useCallback(async (newPreset: ThemePreset, newMode: ColorMode): Promise<boolean> => {
    if (isSavingRef.current) return false;

    const prevPreset = themePreset;
    const prevMode = colorMode;

    // 1. Optimistic apply
    setThemePreset(newPreset);
    setColorMode(newMode);
    applyThemeToDOM(newPreset, newMode);
    setLocalCache(newPreset, newMode);
    setSaveError(null);

    // If still restoring auth or unauthenticated, local cache is sufficient; do not send network request
    if (isLoading || !user) {
      return true;
    }

    // 2. Persist to backend
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const res = await authFetch("/api/proxy/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          theme_preset: newPreset,
          color_mode: newMode,
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to save theme preferences";
        try {
          const errData = await res.json();
          errMsg = errData.error || errData.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const updatedUser: User = await res.json();
      lastSyncedUser.current = `${updatedUser.id}:${updatedUser.theme_preset}:${updatedUser.color_mode}`;
      updateUser(updatedUser);
      return true;
    } catch (err: unknown) {
      // Rollback on failure
      setThemePreset(prevPreset);
      setColorMode(prevMode);
      applyThemeToDOM(prevPreset, prevMode);
      setLocalCache(prevPreset, prevMode);
      const msg = err instanceof Error ? err.message : "Failed to save theme";
      setSaveError(msg);
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [themePreset, colorMode, user, isLoading, updateUser]);

  const toggleTheme = useCallback(() => {
    if (isSavingRef.current) return;
    const nextMode: ColorMode = colorMode === "dark" ? "light" : "dark";
    void setThemePreference(themePreset, nextMode);
  }, [colorMode, themePreset, setThemePreference]);

  return (
    <ThemeContext.Provider
      value={{
        themePreset,
        colorMode,
        theme: colorMode,
        isSaving,
        saveError,
        setThemePreference,
        toggleTheme,
      }}
    >
      {saveError && (
        <div role="status" aria-live="polite" className="sr-only">
          {saveError}
        </div>
      )}
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
