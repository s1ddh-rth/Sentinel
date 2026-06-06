/* SENTINEL — Audit Trail page (ported from prototype page-data.jsx) */
import React, { useState, useMemo } from "react";
import { Icon, RiskBadge } from "../components/ui.jsx";
import { PageHeader, FilterLabel, FilterSelect, FallbackBanner } from "../components/PageBits.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { SENTINEL_DATA } from "../lib/mockData.js";

export default function AuditTrail() {
  const { data, error, loading, refetch } = useApi(() => api.audit(), []);
  const auditData = (data && data.items) || SENTINEL_DATA.audit;

  const [actionFilter, setActionFilter] = useState("All");
  const [userFilter, setUserFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const users = useMemo(
    () => ["All", ...Array.from(new Set(auditData.map(r => r.user))).sort()],
    [auditData],
  );

  const rows = useMemo(() => auditData.filter(r =>
    (actionFilter === "All" || r.action === actionFilter.toLowerCase()) &&
    (userFilter === "All" || r.user === userFilter) &&
    (!search || r.offender.toLowerCase().includes(search.toLowerCase()) || r.user.toLowerCase().includes(search.toLowerCase()))
  ), [actionFilter, userFilter, search, auditData]);

  const exportCsv = () => {
    const cols = ["ts", "action", "offender", "user", "details", "model"];
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel-audit-${rows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const badgeFor = (a) => {
    const map = {
      prediction: { color: "var(--color-accent)", bg: "var(--color-accent-subtle)", label: "Prediction" },
      override: { color: "var(--color-risk-medium)", bg: "var(--color-risk-medium-bg)", label: "Override" },
      feedback: { color: "var(--color-text-secondary)", bg: "var(--color-bg-elevated)", label: "Feedback" },
      promotion: { color: "var(--color-risk-low)", bg: "var(--color-risk-low-bg)", label: "Promotion" },
    };
    const m = map[a];
    return <span style={{
      fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, padding: "2px 8px",
      borderRadius: "var(--radius-sm)", textTransform: "uppercase", letterSpacing: "0.06em",
      color: m.color, background: m.bg,
    }}>{m.label}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Audit Trail"
        subtitle="Every prediction, override, feedback signal, and model promotion is recorded here with full provenance."
        actions={
          <button className="btn btn-secondary" onClick={exportCsv}>
            <Icon name="Download" size={14} /> Export CSV
          </button>
        }
      />

      <FallbackBanner error={error} loading={loading && !data} onRetry={refetch} />

      <div className="card" style={{ padding: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <FilterLabel>Action type</FilterLabel>
          <div className="pill-group">
            {["All", "Prediction", "Override", "Feedback", "Promotion"].map(b => (
              <button key={b} className={actionFilter === b ? "active" : ""} onClick={() => setActionFilter(b)}>{b}</button>
            ))}
          </div>
        </div>
        <FilterSelect label="User" value={userFilter} options={users} onChange={setUserFilter} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220, flex: 1 }}>
          <FilterLabel>Offender reference</FilterLabel>
          <div style={{ position: "relative" }}>
            <input className="input" style={{ paddingLeft: 32 }} placeholder="OFN-XXXX-XXXX"
              value={search} onChange={e => setSearch(e.target.value)} />
            <Icon name="Search" size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--color-text-tertiary)" }} />
          </div>
        </div>
      </div>

      <div className="card card-flush">
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-divider)", fontSize: 13, color: "var(--color-text-secondary)" }}>
          <span className="mono" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{rows.length}</span>
          {" "}{rows.length === 1 ? "entry" : "entries"}
          {rows.length !== auditData.length && <> ({auditData.length} total)</>}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Timestamp</th>
              <th style={{ width: 130 }}>Action</th>
              <th style={{ width: 160 }}>Offender</th>
              <th style={{ width: 130 }}>User</th>
              <th>Details</th>
              <th style={{ width: 150 }}>Model</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <React.Fragment key={r.id}>
                <tr className={expanded === r.id ? "expanded" : ""}
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <td className="mono" style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{r.ts}</td>
                  <td>{badgeFor(r.action)}</td>
                  <td className="mono">{r.offender}</td>
                  <td className="mono" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.user}</td>
                  <td style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{r.details}</td>
                  <td className="mono" style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{r.model}</td>
                  <td><Icon name={expanded === r.id ? "ChevronUp" : "ChevronDown"} size={14} color="var(--color-text-tertiary)" /></td>
                </tr>
                {expanded === r.id && <AuditExpanded row={r} />}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)" }}>
                No audit entries match the current filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditExpanded({ row }) {
  if (row.action === "prediction") {
    return (
      <tr className="expanded">
        <td colSpan={7} style={{ background: "var(--color-bg-elevated)", padding: 0 }}>
          <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div className="section-heading" style={{ fontSize: 13, marginBottom: 10 }}>Input features (excerpt)</div>
              <pre className="mono" style={{
                fontSize: 11, lineHeight: 1.55, color: "var(--color-text-primary)",
                background: "var(--color-bg-card)", padding: 14, borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)", overflow: "auto", margin: 0,
              }}>
{`{
  "age_at_release": 34,
  "gender": "M",
  "prior_violent_count": 4,
  "prior_property_count": 2,
  "supervision_level": "STANDARD",
  "puma_poverty_rate": 0.28,
  "drug_dependency": true,
  "education_years": 10,
  ...
}`}
              </pre>
            </div>
            <div>
              <div className="section-heading" style={{ fontSize: 13, marginBottom: 10 }}>SHAP top-5</div>
              <div style={{ background: "var(--color-bg-card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", padding: 14 }}>
                {[
                  ["Prior violent offences", "+0.18"],
                  ["Age at release", "+0.11"],
                  ["Months without employment", "+0.09"],
                  ["Drug dependency flag", "+0.08"],
                  ["Program participation", "−0.09"],
                ].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 4 ? "1px solid var(--color-divider)" : "none", fontSize: 12 }}>
                    <span>{k}</span>
                    <span className="mono" style={{ color: v.startsWith("+") ? "var(--color-risk-high)" : "var(--color-risk-low)", fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }
  if (row.action === "override") {
    return (
      <tr className="expanded">
        <td colSpan={7} style={{ background: "var(--color-bg-elevated)", padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
            <div>
              <div className="label-tertiary">Original band</div>
              <RiskBadge band={row.details.split(" → ")[0]} />
            </div>
            <div>
              <div className="label-tertiary">New band</div>
              <RiskBadge band={row.details.split(" → ")[1]?.split(",")[0]} />
            </div>
            <div>
              <div className="label-tertiary">Reason</div>
              <div style={{ fontSize: 13, color: "var(--color-text-primary)", marginTop: 2 }}>
                {row.details.split(", ").slice(1).join(", ")}
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr className="expanded">
      <td colSpan={7} style={{ background: "var(--color-bg-elevated)", padding: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
        {row.details}
      </td>
    </tr>
  );
}
