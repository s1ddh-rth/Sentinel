/* SENTINEL — shared page header + filter helpers (ported from prototype page-data.jsx) */
import React from "react";
import { Icon } from "./ui.jsx";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="label-secondary" style={{ marginTop: 6, maxWidth: 720 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}

// Banner shown when a data fetch errored and the page fell back to sample data, or while loading.
export function FallbackBanner({ error, loading, onRetry }) {
  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, fontSize: 13,
        background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)",
        padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
      }}>
        <Icon name="Loader2" size={14} /> Loading live data…
      </div>
    );
  }
  if (!error) return null;
  // Distinguish a real network failure (fall back to sample) from a 404 (the record doesn't exist).
  const notFound = error?.status === 404;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, fontSize: 13,
      background: "var(--color-risk-medium-bg)", color: "var(--color-risk-medium)",
      padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
    }}>
      <Icon name="AlertTriangle" size={14} />
      <span>{notFound
        ? "This record was not found — showing sample data."
        : "Backend unreachable — showing sample data."}</span>
      {onRetry && !notFound && (
        <button className="btn btn-ghost" onClick={onRetry}
          style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-risk-medium)" }}>
          <Icon name="RefreshCw" size={13} /> Retry
        </button>
      )}
    </div>
  );
}

export function FilterLabel({ children }) {
  return <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-secondary)", fontWeight: 600 }}>{children}</span>;
}

export function FilterSelect({ label, value, options, onChange }) {
  const id = React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id}><FilterLabel>{label}</FilterLabel></label>
      <select id={id} aria-label={label} className="select" style={{ minWidth: 140 }}
        value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function DualRange({ value, min, max, onChange }) {
  return (
    <div className="dual-range" style={{ position: "relative", height: 28, width: 220 }}>
      <div style={{ position: "absolute", top: 12, left: 0, right: 0, height: 4, background: "var(--color-bg-elevated)", borderRadius: 2 }} />
      <div style={{
        position: "absolute", top: 12,
        left: `${((value[0] - min) / (max - min)) * 100}%`,
        right: `${100 - ((value[1] - min) / (max - min)) * 100}%`,
        height: 4, background: "var(--color-accent)", borderRadius: 2,
      }} />
      <input type="range" min={min} max={max} value={value[0]} aria-label="Minimum age"
        onChange={e => onChange([Math.min(+e.target.value, value[1] - 1), value[1]])} />
      <input type="range" min={min} max={max} value={value[1]} aria-label="Maximum age"
        onChange={e => onChange([value[0], Math.max(+e.target.value, value[0] + 1)])} />
    </div>
  );
}

export function SortHeader({ label, k, sort, setSort }) {
  const active = sort.key === k;
  return (
    <th className="sortable" onClick={() => setSort(k)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <Icon name={active ? (sort.dir === "asc" ? "ChevronUp" : "ChevronDown") : "ChevronsUpDown"}
          size={12} color={active ? "var(--color-accent)" : "var(--color-text-tertiary)"} />
      </span>
    </th>
  );
}
