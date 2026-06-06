/* SENTINEL — Layout shell with sidebar nav (ported from prototype layout.jsx, wired to react-router) */
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, Outlet, useParams } from "react-router-dom";
import { Icon, Avatar } from "./ui.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { SENTINEL_DATA } from "../lib/mockData.js";

// Track whether the viewport is below the drawer breakpoint. Inline styles can't be overridden by
// media queries, so the shell switches layout in JS.
function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

function Sidebar({ collapsed, setCollapsed, isMobile, drawerOpen, setDrawerOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const route = location.pathname;
  const { logout, user, initials } = useAuth();
  const go = (r) => { navigate(r); if (isMobile) setDrawerOpen(false); };

  const items = [
    { id: "case", label: "Case Review", icon: "FileSearch", route: "/case/OFN-2014-0847" },
    { id: "cohorts", label: "Cohorts", icon: "Users", route: "/cohorts" },
    { id: "dataset", label: "Dataset", icon: "Database", route: "/dataset" },
    { id: "fairness", label: "Fairness", icon: "Scale", route: "/fairness" },
    { id: "models", label: "Models", icon: "BarChart3", route: "/models" },
    { id: "assistant", label: "Assistant", icon: "MessageSquare", route: "/assistant" },
    { id: "audit", label: "Audit", icon: "ScrollText", route: "/audit" },
  ];
  const active = items.find(i =>
    i.id === "case" ? route.startsWith("/case") : route.startsWith(i.route)
  );

  const W = collapsed ? 64 : 240;
  const mobileStyle = isMobile
    ? {
        width: 240, position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 50,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 200ms ease", boxShadow: drawerOpen ? "var(--shadow-lg)" : "none",
      }
    : { width: W, position: "relative", transition: "width 180ms ease" };
  return (
    <aside style={{
      flexShrink: 0, background: "var(--color-bg-primary)",
      color: "var(--color-text-inverse)", display: "flex", flexDirection: "column",
      borderRight: "1px solid rgba(0,0,0,0.4)",
      ...mobileStyle,
    }}>
      {/* Brand */}
      <div style={{
        height: 56, display: "flex", alignItems: "center",
        padding: collapsed ? "0" : "0 20px", justifyContent: collapsed ? "center" : "flex-start",
        borderBottom: "1px solid rgba(255,255,255,0.06)", gap: 10,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 L20 6 L20 13 C20 17.5 16.5 21 12 22 C7.5 21 4 17.5 4 13 L4 6 Z"
            stroke="var(--color-accent)" strokeWidth="1.8" fill="rgba(42,127,142,0.18)" />
          <path d="M9 12 L11 14 L15 10" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && (
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18,
            letterSpacing: "0.06em", color: "var(--color-text-inverse)",
          }}>SENTINEL</div>
        )}
      </div>

      {/* Collapse toggle (desktop only — on mobile the sidebar is a drawer) */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            position: "absolute", top: 16, right: -12, width: 24, height: 24,
            background: "var(--color-bg-secondary)", color: "var(--color-text-inverse-muted)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5,
          }}>
          <Icon name={collapsed ? "ChevronRight" : "ChevronLeft"} size={14} />
        </button>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 0", overflow: "auto" }}>
        {items.map(item => {
          const isActive = active && active.id === item.id;
          return (
            <button key={item.id}
              onClick={() => go(item.route)}
              aria-current={isActive ? "page" : undefined}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                gap: 12, padding: collapsed ? "10px 0" : "10px 20px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: isActive ? "var(--color-bg-secondary)" : "transparent",
                color: isActive ? "var(--color-text-inverse)" : "var(--color-text-inverse-muted)",
                border: "none", borderLeft: isActive ? "3px solid var(--color-accent)" : "3px solid transparent",
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: "pointer", textAlign: "left", whiteSpace: "nowrap",
                transition: "background 100ms ease, color 100ms ease",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
              <Icon name={item.icon} size={16} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User + logout */}
      {!collapsed && (
        <div style={{
          padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            background: "var(--color-bg-secondary)", color: "var(--color-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 600, fontSize: 11, letterSpacing: "0.04em",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: "var(--color-text-inverse)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{user?.full_name || user?.username || "User"}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-inverse-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {(user?.role || "case_officer").replace("_", " ")}
            </div>
          </div>
          <button title="Log out" onClick={logout}
            style={{
              background: "transparent", border: "none", color: "var(--color-text-inverse-muted)",
              display: "flex", alignItems: "center", padding: 4, borderRadius: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-inverse)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-inverse-muted)"}>
            <Icon name="LogOut" size={16} />
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: collapsed ? "12px 0" : "12px 20px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        fontSize: 11, color: "var(--color-text-inverse-muted)",
        display: "flex", justifyContent: collapsed ? "center" : "space-between", alignItems: "center", whiteSpace: "nowrap", gap: 8,
      }}>
        {!collapsed && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-risk-low)" }} />
              <span>All services healthy</span>
            </div>
            <span className="mono">v0.1.0</span>
          </>
        )}
        {collapsed && (
          <button title="Log out" onClick={logout} style={{ background: "transparent", border: "none", color: "var(--color-text-inverse-muted)", padding: 0 }}>
            <Icon name="LogOut" size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}

function TopBar({ breadcrumb, isMobile, onMenu }) {
  const { user, initials, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(null); // "search" | "bell" | "user" | null
  const ref = useRef(null);

  // Close any open menu on outside click or Escape.
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const toggle = (k) => setOpen(o => (o === k ? null : k));
  const close = () => setOpen(null);

  return (
    <div style={{
      height: 56, background: "var(--color-bg-card)",
      borderBottom: "1px solid var(--color-border)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: isMobile ? "0 12px" : "0 24px", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-text-secondary)", minWidth: 0 }}>
        {isMobile && (
          <button className="btn btn-ghost" onClick={onMenu} aria-label="Open navigation menu"
            style={{ padding: 6, marginRight: 2 }}>
            <Icon name="Menu" size={18} />
          </button>
        )}
        {breadcrumb.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="ChevronRight" size={14} color="var(--color-text-tertiary)" />}
            <span style={{
              color: i === breadcrumb.length - 1 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
              fontFamily: b.mono ? "var(--font-mono)" : "var(--font-body)",
            }}>{b.label}</span>
          </React.Fragment>
        ))}
      </div>
      <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <SearchMenu open={open === "search"} onToggle={() => toggle("search")} navigate={navigate} close={close} />
        <NotificationMenu open={open === "bell"} onToggle={() => toggle("bell")} navigate={navigate} close={close} />
        <div style={{ width: 1, height: 22, background: "var(--color-divider)" }} />
        <UserMenu open={open === "user"} onToggle={() => toggle("user")} user={user} initials={initials} logout={logout} />
      </div>
    </div>
  );
}

const menuPanel = {
  position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 60,
  background: "var(--color-bg-card)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
};

// Global "jump to case" search across the offender cohort.
function SearchMenu({ open, onToggle, navigate, close }) {
  const { data } = useApi(() => api.offenders(), []);
  const cohort = (data && data.items) || SENTINEL_DATA.cohort;
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cohort.slice(0, 6);
    return cohort.filter(o =>
      o.id.toLowerCase().includes(s) || (o.offence || "").toLowerCase().includes(s) || (o.region || "").toLowerCase().includes(s)
    ).slice(0, 8);
  }, [q, cohort]);

  const go = (id) => { setQ(""); close(); navigate(`/case/${id}`); };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-ghost" title="Search cases" aria-label="Search cases" onClick={onToggle}>
        <Icon name="Search" size={16} />
      </button>
      {open && (
        <div style={{ ...menuPanel, width: 320 }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--color-divider)" }}>
            <input ref={inputRef} className="input" placeholder="Search offenders by ID, offence, region…"
              value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && results[0]) go(results[0].id); }} />
          </div>
          <div style={{ maxHeight: 280, overflow: "auto" }}>
            {results.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center" }}>No matches.</div>
            )}
            {results.map(o => (
              <button key={o.id} onClick={() => go(o.id)}
                style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer",
                  padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-elevated)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ minWidth: 0 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{o.id}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.offence} · {o.region}
                  </span>
                </span>
                <span className={`risk-badge ${(o.band || "").toLowerCase()}`}>{o.band}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Recent activity, drawn from the real audit trail.
function NotificationMenu({ open, onToggle, navigate, close }) {
  const { data } = useApi(() => api.audit(), []);
  const items = ((data && data.items) || SENTINEL_DATA.audit).slice(0, 6);
  const overrides = items.filter(i => i.action === "override").length;

  const label = (a) => ({ prediction: "Prediction", override: "Override", feedback: "Feedback", promotion: "Promotion" }[a] || a);
  const color = (a) => a === "override" ? "var(--color-risk-medium)" : a === "promotion" ? "var(--color-risk-low)" : "var(--color-accent)";

  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-ghost" title="Recent activity" aria-label="Recent activity" onClick={onToggle}
        style={{ position: "relative" }}>
        <Icon name="Bell" size={16} />
        {overrides > 0 && (
          <span style={{ position: "absolute", top: 2, right: 2, minWidth: 14, height: 14, padding: "0 3px",
            borderRadius: 8, background: "var(--color-risk-high)", color: "#fff", fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center" }}>{overrides}</span>
        )}
      </button>
      {open && (
        <div style={{ ...menuPanel, width: 320 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", fontSize: 13, fontWeight: 600 }}>
            Recent activity
          </div>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {items.map((it, i) => (
              <div key={i} style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-divider)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: color(it.action) }}>{label(it.action)}</span>
                  <span className="mono" style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>{it.ts}</span>
                </div>
                <div style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>
                  <span className="mono">{it.offender}</span> · {it.details}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { close(); navigate("/audit"); }}
            style={{ width: "100%", border: "none", background: "var(--color-bg-elevated)", cursor: "pointer",
              padding: "10px", fontSize: 12, fontWeight: 600, color: "var(--color-accent)" }}>
            View full audit trail →
          </button>
        </div>
      )}
    </div>
  );
}

// Identity + logout.
function UserMenu({ open, onToggle, user, initials, logout }) {
  return (
    <div style={{ position: "relative" }}>
      <button onClick={onToggle} aria-label="Account menu" title="Account"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%" }}>
        <Avatar initials={initials} />
      </button>
      {open && (
        <div style={{ ...menuPanel, width: 240 }}>
          <div style={{ padding: 14, borderBottom: "1px solid var(--color-divider)" }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>
              {user?.full_name || user?.username || "User"}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>{user?.email}</div>
            <div style={{ marginTop: 8 }}>
              <span className="tag" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {(user?.role || "case_officer").replace("_", " ")}
              </span>
            </div>
          </div>
          <button onClick={logout}
            style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer",
              padding: "11px 14px", fontSize: 13, color: "var(--color-risk-high)", display: "flex", alignItems: "center", gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-elevated)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <Icon name="LogOut" size={15} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

// Derive breadcrumb from current route.
function useBreadcrumb() {
  const location = useLocation();
  const params = useParams();
  const route = location.pathname;
  if (route.startsWith("/case")) {
    const id = params.id || "OFN-2014-0847";
    return [{ label: "Case Review" }, { label: id, mono: true }];
  }
  if (route.startsWith("/cohorts")) return [{ label: "Cohorts" }];
  if (route.startsWith("/dataset")) return [{ label: "Dataset" }, { label: "Training data" }];
  if (route.startsWith("/fairness")) return [{ label: "Fairness" }, { label: "Production model" }];
  if (route.startsWith("/models")) return [{ label: "Models" }, { label: "Production model" }];
  if (route.startsWith("/assistant")) return [{ label: "Assistant" }];
  if (route.startsWith("/audit")) return [{ label: "Audit Trail" }];
  return [{ label: "SENTINEL" }];
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile(1024);
  const breadcrumb = useBreadcrumb();
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed}
        isMobile={isMobile} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} />
      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} aria-hidden="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40 }} />
      )}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar breadcrumb={breadcrumb} isMobile={isMobile} onMenu={() => setDrawerOpen(o => !o)} />
        <div style={{
          flex: 1, overflow: "auto",
          background: "var(--color-bg-content)",
        }}>
          <div className="page-enter" key={location.pathname} style={{
            maxWidth: 1400, margin: "0 auto",
            padding: isMobile ? "16px" : "32px",
          }}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export default Layout;
