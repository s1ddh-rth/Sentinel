// SENTINEL — Auth context.
// Token is held in React state / memory ONLY (no localStorage / sessionStorage).
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "../lib/api.js";

const AuthContext = createContext(null);

function initialsFor(user) {
  if (!user) return "??";
  const name = user.full_name || user.username || "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "??";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  // True until the one-shot silent refresh on load resolves, so routes don't flash /login before we
  // know whether the httpOnly cookie can restore the session.
  const [booting, setBooting] = useState(true);

  // Keep the api module's in-memory token in sync.
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  const logout = useCallback(async () => {
    try {
      if (token) await api.logout();
    } catch {
      // best-effort; clear locally regardless
    }
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setAuthToken(null);
  }, [token]);

  // On 401 from any API call, clear session so ProtectedRoute redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setAuthToken(null);
    });
  }, []);

  const applySession = useCallback((data) => {
    setToken(data.access_token);
    setAuthToken(data.access_token);
    if (data.refresh_token) setRefreshToken(data.refresh_token);
    if (data.user) setUser(data.user);
  }, []);

  // On first load, try a silent refresh against the httpOnly cookie. If a valid session exists the
  // user stays logged in across a browser refresh; otherwise we land on /login as before. The ref
  // guard keeps this to a single attempt even under StrictMode's double-invoked effects in dev.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      try {
        const data = await api.refresh();
        applySession(data);
      } catch {
        // No restorable session — remain logged out.
      } finally {
        setBooting(false);
      }
    })();
  }, [applySession]);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    applySession(data);
    return data.user;
  }, [applySession]);

  const signup = useCallback(async (payload) => {
    const data = await api.signup(payload);
    applySession(data); // auto-login on success
    return data.user;
  }, [applySession]);

  const value = {
    user,
    token,
    refreshToken,
    login,
    signup,
    logout,
    booting,
    isAuthenticated: !!token,
    initials: initialsFor(user),
  };

  return (
    <AuthContext.Provider value={value}>
      {booting ? <BootSplash /> : children}
    </AuthContext.Provider>
  );
}

// Brief branded splash shown while the silent refresh resolves on load.
function BootSplash() {
  return (
    <div style={{
      height: "100vh", width: "100vw", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "var(--color-bg-primary)", color: "var(--color-text-inverse-muted)",
    }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <path d="M12 2 L20 6 L20 13 C20 17.5 16.5 21 12 22 C7.5 21 4 17.5 4 13 L4 6 Z"
          stroke="var(--color-accent)" strokeWidth="1.6" fill="rgba(42,127,142,0.18)" />
        <path d="M9 12 L11 14 L15 10" stroke="var(--color-accent)" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Restoring session…
      </div>
    </div>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export default useAuth;
