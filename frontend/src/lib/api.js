// SENTINEL — fetch wrapper.
// Base URL is /api (configurable via VITE_API_BASE). Attaches the bearer token
// from the in-memory auth store. On 401, triggers a logout + redirect to /login.

const BASE = import.meta.env.VITE_API_BASE || "/api";

// In-memory token holder. Set by the AuthProvider; never persisted to storage.
let _token = null;
let _onUnauthorized = null;

export function setAuthToken(token) {
  _token = token;
}

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

async function request(path, { method = "GET", body, headers = {}, auth = true } = {}) {
  const opts = {
    method,
    // Send the httpOnly refresh cookie so a browser refresh can silently re-establish the session.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(auth && _token ? { Authorization: `Bearer ${_token}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    if (_onUnauthorized) _onUnauthorized();
    throw new ApiError("Unauthorized", 401);
  }
  if (res.status === 429) {
    throw new ApiError("Rate limited — please wait a moment.", 429);
  }
  if (!res.ok) {
    let detail;
    try {
      detail = (await res.json())?.detail;
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body, opts = {}) => request(path, { method: "POST", body, ...opts }),

  // --- Auth ---
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password }, auth: false }),
  signup: (payload) =>
    request("/auth/signup", { method: "POST", body: payload, auth: false }),
  // With no argument, refresh relies on the httpOnly cookie (used for the silent refresh on app
  // load, after a browser refresh has wiped any in-memory token).
  refresh: (refresh_token) =>
    request("/auth/refresh", {
      method: "POST",
      body: refresh_token ? { refresh_token } : undefined,
      auth: false,
    }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  // --- Data ---
  health: () => request("/health", { auth: false }),
  offenders: () => request("/offenders"),
  offender: (id) => request(`/offenders/${encodeURIComponent(id)}`),
  dataset: (offset = 0, limit = 25) => request(`/dataset?offset=${offset}&limit=${limit}`),
  predict: (payload) => request("/predict", { method: "POST", body: payload }),
  override: (payload) => request("/override", { method: "POST", body: payload }),
  audit: () => request("/audit"),
  fairnessMetrics: (group) => request(`/fairness/metrics${group ? `?group=${encodeURIComponent(group)}` : ""}`),
  fairnessHistory: () => request("/fairness/history"),
  modelsPerformance: () => request("/models/performance"),
  reference: () => request("/reference"),

  // --- Agent ---
  chat: (payload) => request("/agent/chat", { method: "POST", body: payload }),

  // --- Graph ---
  graphNeighborhood: (id) => request(`/graph/neighborhood/${encodeURIComponent(id)}`),
  graphFeatures: (id) => request(`/graph/features/${encodeURIComponent(id)}`),
};

export default api;
