"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-on-surface sm:p-6">
      <main className="relative z-10 w-full max-w-sm rounded border border-outline-variant bg-surface-container-lowest p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">JupeTrack</h1>
            <p className="text-xs text-on-surface-variant">Juniper MX204 Network Monitor</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
              disabled={loading}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              className="h-11 w-full rounded border border-input bg-surface-container px-3 text-sm placeholder:text-on-surface-variant/60 disabled:cursor-not-allowed disabled:opacity-55 focus:border-primary focus-visible:outline-2 focus-visible:outline-primary/40"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                disabled={loading}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                className="h-11 w-full rounded border border-input bg-surface-container px-3 pr-12 text-sm placeholder:text-on-surface-variant/60 disabled:cursor-not-allowed disabled:opacity-55 focus:border-primary focus-visible:outline-2 focus-visible:outline-primary/40"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? "Hide password" : "Show password"}
                aria-pressed={showPass}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded text-on-surface-variant hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              id="login-error"
              role="alert"
              className="flex items-center gap-2 rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading || !username || !password}
            className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {loading ? (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary/40 border-t-on-primary motion-reduce:animate-none"
                aria-label="Signing in"
              />
            ) : (
              <>
                Sign In
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-on-surface-variant">
          Secured with JWT authentication · JupeTrack
        </p>
      </main>
    </div>
  );
}
