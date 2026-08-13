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
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <div className="login-grid" />
      </div>

      {/* Card */}
      <div className="login-card">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1>JupeTrack</h1>
          <p>Juniper MX204 Network Monitor</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
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
              <span className="login-input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
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
                tabIndex={-1}
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            className="login-btn"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <span className="login-spinner" />
            ) : (
              <>
                Sign In
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="login-footer">
          Secured with JWT authentication · JupeTrack v2.0
        </p>
      </div>

      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #060b14;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', 'Segoe UI', sans-serif;
        }

        /* Animated background orbs */
        .login-bg { position: absolute; inset: 0; pointer-events: none; }

        .login-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: orb-float 8s ease-in-out infinite;
        }
        .login-orb-1 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(255,181,154,0.18), transparent 70%);
          top: -100px; left: -100px;
          animation-delay: 0s;
        }
        .login-orb-2 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(255,198,178,0.13), transparent 70%);
          bottom: -150px; right: -100px;
          animation-delay: -3s;
        }
        .login-orb-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(220,190,175,0.10), transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -6s;
        }
        .login-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        @keyframes orb-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }

        /* Card */
        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 420px;
          margin: 1.5rem;
          background: rgba(10, 18, 30, 0.85);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(99, 179, 237, 0.12);
          border-radius: 20px;
          padding: 2.5rem 2rem;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 25px 50px rgba(0,0,0,0.6),
            0 0 80px rgba(6,182,212,0.08);
          animation: card-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes card-in {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: none; }
        }

        /* Brand */
        .login-brand {
          text-align: center;
          margin-bottom: 2rem;
        }
        .login-logo {
          width: 56px; height: 56px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.2));
          border: 1px solid rgba(6,182,212,0.25);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 1rem;
          box-shadow: 0 0 20px rgba(6,182,212,0.15);
        }
        .login-logo svg {
          width: 28px; height: 28px;
          color: rgb(6,182,212);
        }
        .login-brand h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #f1f5f9;
          letter-spacing: -0.025em;
          margin: 0 0 0.25rem;
        }
        .login-brand p {
          font-size: 0.8rem;
          color: #64748b;
          margin: 0;
        }

        /* Form */
        .login-form { display: flex; flex-direction: column; gap: 1.25rem; }

        .login-field { display: flex; flex-direction: column; gap: 0.5rem; }
        .login-field label {
          font-size: 0.8rem;
          font-weight: 500;
          color: #94a3b8;
          letter-spacing: 0.025em;
        }

        .login-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .login-input-icon {
          position: absolute; left: 0.875rem;
          color: #475569;
          display: flex; align-items: center;
          pointer-events: none;
        }
        .login-input-icon svg { width: 16px; height: 16px; }

        .login-input-wrap input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 0.75rem 2.75rem 0.75rem 2.75rem;
          color: #e2e8f0;
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .login-input-wrap input::placeholder { color: #334155; }
        .login-input-wrap input:focus {
          border-color: rgba(6,182,212,0.4);
          background: rgba(6,182,212,0.05);
          box-shadow: 0 0 0 3px rgba(6,182,212,0.1);
        }
        .login-input-wrap input:disabled { opacity: 0.5; cursor: not-allowed; }

        .login-toggle-pass {
          position: absolute; right: 0.875rem;
          background: none; border: none; cursor: pointer;
          color: #475569; padding: 0;
          display: flex; align-items: center;
          transition: color 0.2s;
        }
        .login-toggle-pass:hover { color: #94a3b8; }
        .login-toggle-pass svg { width: 16px; height: 16px; }

        /* Error */
        .login-error {
          display: flex; align-items: center; gap: 0.5rem;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          padding: 0.625rem 0.875rem;
          font-size: 0.82rem;
          color: #fca5a5;
          animation: shake 0.4s ease;
        }
        .login-error svg { width: 15px; height: 15px; flex-shrink: 0; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }

        /* Submit button */
        .login-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          margin-top: 0.25rem;
          padding: 0.875rem;
          border: none; border-radius: 10px; cursor: pointer;
          font-size: 0.9rem; font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, rgb(6,182,212), rgb(59,130,246));
          box-shadow: 0 4px 20px rgba(6,182,212,0.3);
          transition: all 0.2s;
        }
        .login-btn svg { width: 16px; height: 16px; }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 25px rgba(6,182,212,0.4);
          filter: brightness(1.1);
        }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled {
          opacity: 0.5; cursor: not-allowed;
          box-shadow: none; transform: none;
        }

        /* Spinner */
        .login-spinner {
          display: inline-block;
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer */
        .login-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.73rem;
          color: #334155;
        }
      `}</style>
    </div>
  );
}
