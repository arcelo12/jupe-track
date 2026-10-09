"use client";

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type UiVersion = "v1" | "v2";

const STORAGE_KEY = "jupetrack-ui-version";

interface UiVersionContextType {
  uiVersion: UiVersion;
  setUiVersion: (v: UiVersion) => void;
}

const UiVersionContext = createContext<UiVersionContextType | undefined>(undefined);

function isValidVersion(v: string | null | undefined): v is UiVersion {
  return v === "v1" || v === "v2";
}

function applyUiVersionToDOM(v: UiVersion) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiVersion = v;
}

export function UiVersionProvider({ children }: { children: React.ReactNode }) {
  const [uiVersion, setUiVersion] = useState<UiVersion>(() => {
    if (typeof window === "undefined") return "v1";
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      return isValidVersion(cached) ? cached : "v1";
    } catch {
      return "v1";
    }
  });

  useEffect(() => {
    applyUiVersionToDOM(uiVersion);
    try {
      localStorage.setItem(STORAGE_KEY, uiVersion);
    } catch {}
  }, [uiVersion]);

  // Multi-tab synchronization
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      let next: UiVersion = "v1";
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        next = isValidVersion(cached) ? cached : "v1";
      } catch {}
      setUiVersion(next);
      applyUiVersionToDOM(next);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <UiVersionContext.Provider value={{ uiVersion, setUiVersion }}>
      {children}
    </UiVersionContext.Provider>
  );
}

export function useUiVersion() {
  const context = useContext(UiVersionContext);
  if (!context) {
    throw new Error("useUiVersion must be used within a UiVersionProvider");
  }
  return context;
}

const emptySubscribe = () => () => {};

export function UiVersionSwitcher() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const { uiVersion, setUiVersion } = useUiVersion();

  const options: { id: UiVersion; label: string; title: string }[] = [
    { id: "v1", label: "V1", title: "Classic UI (v1)" },
    { id: "v2", label: "V2", title: "Minimal UI (v2)" },
  ];

  const active: UiVersion = mounted ? uiVersion : "v1";

  return (
    <div
      role="group"
      aria-label="UI version"
      aria-disabled={!mounted}
      className={cn(
        "inline-flex items-center gap-0.5 rounded border border-outline-variant bg-surface-container-low p-0.5",
        !mounted && "opacity-50"
      )}
    >
      {options.map((opt) => {
        const isActive = active === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={isActive}
            aria-label={opt.title}
            title={opt.title}
            onClick={() => {
              if (!mounted) return;
              setUiVersion(opt.id);
            }}
            className={cn(
              "min-h-11 min-w-11 rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              isActive
                ? "bg-surface-container-highest text-on-surface"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
