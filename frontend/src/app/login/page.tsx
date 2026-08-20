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
    <div className="login-root">
      {/* Ambient background: theme-token driven, no hardcoded palette */}
      <div className="login-bg" aria-hidden="true">
        <div className="login-glow login-glow-1" />
        <div className="login-glow login-glow-2" />
        <div className="login-grid" />
      </div>

      <main className="login-card" role="main">
        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1>JupeTrack</h1>
          <p>Juniper MX204 Network Monitor</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <div className="login-input-wrap">
              <span className="login-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="login-toggle-pass"
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? "Hide password" : "Show password"}
                aria-pressed={showPass}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            className="login-btn"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <span className="login-spinner" aria-label="Signing in" />
            ) : (
              <>
                Sign In
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="login-footer">Secured with JWT authentication · JupeTrack</p>
      </main>

      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-background);
          color: var(--color-on-surface);
          position: relative;
          overflow: hidden;
          padding: 1.5rem;
        }

        .login-bg { position: absolute; inset: 0; pointer-events: none; }
        .login-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.5;
          animation: login-float 12s ease-in-out infinite;
        }
        .login-glow-1 {
          width: 460px; height: 460px;
          background: radial-gradient(circle, color-mix(in oklab, var(--color-primary) 22%, transparent), transparent 70%);
          top: -120px; left: -100px;
        }
        .login-glow-2 {
          width: 520px; height: 520px;
          background: radial-gradient(circle, color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 70%);
          bottom: -160px; right: -120px;
          animation-delay: -6s;
        }
        .login-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(color-mix(in oklab, var(--color-on-surface) 4%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in oklab, var(--color-on-surface) 4%, transparent) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(ellipse at center, #000 40%, transparent 80%);
        }
        @keyframes login-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(24px, -18px) scale(1.04); }
        }

        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 400px;
          background: color-mix(in oklab, var(--color-surface-container-low) 92%, transparent);
          backdrop-filter: blur(16px);
          border: 1px solid var(--color-outline-variant);
          border-radius: 0.5rem;
          padding: 2.5rem 2rem;
          animation: login-in 0.4s ease both;
        }
        @keyframes login-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: none; }
        }

        .login-brand { text-align: center; margin-bottom: 2rem; }
        .login-logo {
          width: 52px; height: 52px;
          border-radius: 0.5rem;
          background: color-mix(in oklab, var(--color-primary) 14%, transparent);
          border: 1px solid color-mix(in oklab, var(--color-primary) 30%, transparent);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 1rem;
          color: var(--color-primary);
        }
        .login-logo svg { width: 26px; height: 26px; }
        .login-brand h1 {
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 0.25rem;
          color: var(--color-on-surface);
        }
        .login-brand p {
          font-size: 0.8rem;
          color: var(--color-on-surface-variant);
          margin: 0;
        }

        .login-form { display: flex; flex-direction: column; gap: 1.15rem; }
        .login-field { display: flex; flex-direction: column; gap: 0.45rem; }
        .login-field label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--color-on-surface-variant);
          letter-spacing: 0.02em;
        }

        .login-input-wrap { position: relative; display: flex; align-items: center; }
        .login-input-icon {
          position: absolute; left: 0.85rem;
          color: var(--color-on-surface-variant);
          display: flex; align-items: center;
          pointer-events: none;
        }
        .login-input-icon svg { width: 16px; height: 16px; }

        .login-input-wrap input {
          width: 100%;
          background: var(--color-surface-container);
          border: 1px solid var(--color-outline-variant);
          border-radius: 0.375rem;
          padding: 0.7rem 2.75rem;
          color: var(--color-on-surface);
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .login-input-wrap input::placeholder { color: var(--color-on-surface-variant); opacity: 0.6; }
        .login-input-wrap input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 22%, transparent);
        }
        .login-input-wrap input:disabled { opacity: 0.55; cursor: not-allowed; }

        .login-toggle-pass {
          position: absolute; right: 0.7rem;
          background: none; border: none; cursor: pointer;
          color: var(--color-on-surface-variant);
          padding: 0.25rem;
          display: flex; align-items: center;
          border-radius: 0.25rem;
          transition: color 0.15s;
        }
        .login-toggle-pass:hover { color: var(--color-on-surface); }
        .login-toggle-pass:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 1px;
        }
        .login-toggle-pass svg { width: 16px; height: 16px; }

        .login-error {
          display: flex; align-items: center; gap: 0.5rem;
          background: color-mix(in oklab, var(--color-error) 12%, transparent);
          border: 1px solid color-mix(in oklab, var(--color-error) 35%, transparent);
          border-radius: 0.375rem;
          padding: 0.6rem 0.8rem;
          font-size: 0.82rem;
          color: var(--color-error);
        }
        .login-error svg { width: 15px; height: 15px; flex-shrink: 0; }

        .login-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          margin-top: 0.25rem;
          padding: 0.8rem;
          border: none; border-radius: 0.375rem; cursor: pointer;
          font-size: 0.9rem; font-weight: 600;
          color: var(--color-on-primary);
          background: var(--color-primary);
          transition: background 0.15s, transform 0.1s, opacity 0.15s;
        }
        .login-btn svg { width: 16px; height: 16px; }
        .login-btn:hover:not(:disabled) { background: var(--color-primary-hover); }
        .login-btn:active:not(:disabled) { transform: translateY(1px); }
        .login-btn:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 2px;
        }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .login-spinner {
          display: inline-block;
          width: 18px; height: 18px;
          border: 2px solid color-mix(in oklab, var(--color-on-primary) 40%, transparent);
          border-top-color: var(--color-on-primary);
          border-radius: 50%;
          animation: login-spin 0.7s linear infinite;
        }
        @keyframes login-spin { to { transform: rotate(360deg); } }

        .login-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.72rem;
          color: var(--color-on-surface-variant);
          opacity: 0.7;
        }

        @media (prefers-reduced-motion: reduce) {
          .login-glow, .login-card, .login-spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}
