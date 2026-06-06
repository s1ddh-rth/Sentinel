/* SENTINEL — Login page (institutional auth form) */
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Icon } from "../components/ui.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { AuthShell, AuthField } from "../components/AuthShell.jsx";

const DEMO_PASSWORD = "sentinel-demo-2026";
const DEMO_ACCOUNTS = [
  { user: "admin", label: "Sign in as Admin", note: "full access — review, override, and audit" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(null); // holds the username being signed in, or null
  const [copied, setCopied] = useState(null);

  const from = location.state?.from?.pathname || "/cohorts";

  const doLogin = async (uname, pass) => {
    if (loading) return;
    setLoading(uname);
    setError(null);
    try {
      await login(uname, pass);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed. Check your credentials and try again.");
    } finally {
      setLoading(null);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (username && password) doLogin(username, password);
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Access the fairness-aware risk assessment platform.">
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <AuthField label="Username">
          <input className="input" autoFocus value={username}
            onChange={e => setUsername(e.target.value)} placeholder="admin" />
        </AuthField>
        <AuthField label="Password">
          <div style={{ position: "relative" }}>
            <input className="input" type={showPassword ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"
              style={{ paddingRight: 38 }} />
            <button type="button" onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", padding: 4, display: "flex",
                color: "var(--color-text-tertiary)",
              }}>
              <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
            </button>
          </div>
        </AuthField>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 12,
            background: "var(--color-risk-high-bg)", color: "var(--color-risk-high)",
            padding: "8px 12px", borderRadius: "var(--radius-sm)",
          }}>
            <Icon name="AlertTriangle" size={14} /> {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={!!loading || !username || !password}
          style={{ justifyContent: "center", padding: "10px 14px", opacity: loading ? 0.7 : 1 }}>
          {loading ? <><Icon name="Loader2" size={14} /> Signing in…</> : "Sign in"}
        </button>
      </form>

      {/* One-click demo access */}
      <div style={{
        marginTop: 18, padding: "14px", background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
        }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: "var(--color-text-primary)" }}>
            Demo access — one click
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>no signup needed</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DEMO_ACCOUNTS.map(a => (
            <button key={a.user} type="button" className="btn btn-secondary"
              onClick={() => doLogin(a.user, DEMO_PASSWORD)} disabled={!!loading}
              title={`Sign in as ${a.user} (${a.note})`}
              style={{ flex: "1 1 0", minWidth: 96, justifyContent: "center", fontSize: 12 }}>
              {loading === a.user
                ? <><Icon name="Loader2" size={13} /> …</>
                : <><Icon name="LogIn" size={13} /> {a.label}</>}
            </button>
          ))}
        </div>

        <div style={{
          marginTop: 10, display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: "var(--color-text-secondary)",
        }}>
          <span>Password</span>
          <button type="button" onClick={() => copy(DEMO_PASSWORD, "pw")}
            title="Copy password" aria-label="Copy password"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
              padding: "3px 8px", color: "var(--color-text-primary)",
            }}>
            <span className="mono">{DEMO_PASSWORD}</span>
            <Icon name={copied === "pw" ? "Check" : "Copy"} size={13}
              color={copied === "pw" ? "var(--color-risk-low)" : "var(--color-text-tertiary)"} />
          </button>
          {copied === "pw" && <span style={{ color: "var(--color-risk-low)", fontSize: 11 }}>copied</span>}
        </div>
      </div>

      <div style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
        No account? <Link to="/signup" style={{ color: "var(--color-accent)", fontWeight: 500 }}>Create one</Link>
      </div>
    </AuthShell>
  );
}
