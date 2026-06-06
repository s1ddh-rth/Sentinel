/* SENTINEL — Signup page (auto-logs in on success) */
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Icon } from "../components/ui.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { AuthShell, AuthField } from "../components/AuthShell.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", full_name: "", password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signup({
        email: form.email,
        username: form.username,
        full_name: form.full_name,
        password: form.password,
      });
      navigate("/cohorts", { replace: true }); // auto-login on success
    } catch (err) {
      setError(err?.message || "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create account" subtitle="Register to access the platform. You'll be signed in automatically.">
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <AuthField label="Full name">
          <input className="input" autoFocus value={form.full_name} onChange={set("full_name")} placeholder="Jane Okafor" />
        </AuthField>
        <AuthField label="Email">
          <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="jane@agency.gov" />
        </AuthField>
        <AuthField label="Username">
          <input className="input" value={form.username} onChange={set("username")} placeholder="j.okafor" />
        </AuthField>
        <AuthField label="Password">
          <input className="input" type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
        </AuthField>
        <AuthField label="Confirm password">
          <input className="input" type="password" value={form.confirm} onChange={set("confirm")} placeholder="Re-enter password" />
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

        <button type="submit" className="btn btn-primary" disabled={loading}
          style={{ justifyContent: "center", padding: "10px 14px", opacity: loading ? 0.7 : 1 }}>
          {loading ? <><Icon name="Loader2" size={14} /> Creating account…</> : "Create account"}
        </button>
      </form>

      <div style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
        Already have an account? <Link to="/login" style={{ color: "var(--color-accent)", fontWeight: 500 }}>Sign in</Link>
      </div>
    </AuthShell>
  );
}
