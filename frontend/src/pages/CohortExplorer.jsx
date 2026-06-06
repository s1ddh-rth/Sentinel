/* SENTINEL — Cohort Explorer page (ported from prototype page-data.jsx) */
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, RiskBadge, MetricCard } from "../components/ui.jsx";
import { PageHeader, FilterLabel, FilterSelect, DualRange, SortHeader } from "../components/PageBits.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { SENTINEL_DATA } from "../lib/mockData.js";

export default function CohortExplorer() {
  const navigate = useNavigate();

  const { data: offData, error: offError } = useApi(() => api.offenders(), []);
  const { data: refData } = useApi(() => api.reference(), []);

  // Fall back to mock data when the backend is unavailable so the UI is never blank.
  const cohort = (offData && offData.items) || SENTINEL_DATA.cohort;
  const offenceTypes = (refData && refData.offenceTypes) || SENTINEL_DATA.offenceTypes;
  const regions = (refData && refData.regions) || SENTINEL_DATA.regions;
  const usingSample = !!offError;

  const [filters, setFilters] = useState({ band: "All", offence: "All", region: "All", age: [18, 65] });
  const [sort, setSort] = useState({ key: "score", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    return cohort.filter(r =>
      (filters.band === "All" || r.band === filters.band.toUpperCase()) &&
      (filters.offence === "All" || r.offence === filters.offence) &&
      (filters.region === "All" || r.region === filters.region) &&
      (r.age >= filters.age[0] && r.age <= filters.age[1])
    );
  }, [filters, cohort]);

  // Summary metrics derived from the FILTERED view so they always reconcile with the table below.
  const kpis = useMemo(() => {
    const n = filtered.length || 1;
    const high = filtered.filter(r => r.band === "HIGH").length;
    const overridden = filtered.filter(r => r.overridden).length;
    const meanScore = filtered.reduce((s, r) => s + (r.score || 0), 0) / n;
    return {
      total: filtered.length,
      high, highPct: (high / n) * 100,
      overridePct: (overridden / n) * 100,
      meanScore,
    };
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize);

  const setSortKey = (k) => setSort(s => s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" });

  // Export the current filtered + sorted view as a CSV download.
  const exportCsv = () => {
    const cols = ["id", "score", "band", "offence", "region", "age", "race", "gender", "priorOffences", "lastAssessed"];
    // Only quote fields that need it (commas/quotes/newlines); leave numbers bare so spreadsheets
    // read them as numbers, not text.
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(","), ...sorted.map(r => cols.map(c => esc(r[c])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel-cohort-${sorted.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Cohort Explorer"
        subtitle="Filter and review cases across the synthetic NIJ-schema population by risk band and attributes — see Dataset for provenance. Click a row to open the full case review."
        actions={
          <button className="btn btn-secondary" onClick={exportCsv}>
            <Icon name="Download" size={14} /> Export CSV
          </button>
        }
      />

      {usingSample && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          background: "var(--color-risk-medium-bg)", color: "var(--color-risk-medium)",
          padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
        }}>
          <Icon name="Info" size={15} />
          Backend unreachable — showing sample cohort data. Metrics below reflect the sample.
        </div>
      )}

      <div className="card-stagger grid-kpi">
        <MetricCard label="Total Assessed" value={kpis.total.toLocaleString()} context="in current cohort view" />
        <MetricCard label="High Risk" value={kpis.high} suffix={`·${kpis.highPct.toFixed(1)}%`} context="flagged HIGH band" />
        <MetricCard label="Override Rate" value={`${kpis.overridePct.toFixed(1)}%`} context="of shown predictions" />
        <MetricCard label="Mean Risk Score" value={kpis.meanScore.toFixed(2)} context="across cohort view" />
      </div>

      <div className="card" style={{ padding: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <FilterLabel>Risk band</FilterLabel>
          <div className="pill-group">
            {["All", "Low", "Medium", "High"].map(b => (
              <button key={b} className={filters.band === b ? "active" : ""}
                onClick={() => { setFilters(f => ({ ...f, band: b })); setPage(1); }}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <FilterSelect label="Offence type" value={filters.offence} options={["All", ...offenceTypes]}
          onChange={v => { setFilters(f => ({ ...f, offence: v })); setPage(1); }} />
        <FilterSelect label="Region" value={filters.region} options={["All", ...regions]}
          onChange={v => { setFilters(f => ({ ...f, region: v })); setPage(1); }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
          <FilterLabel>Age range: <span className="mono" style={{ color: "var(--color-text-primary)" }}>{filters.age[0]}–{filters.age[1]}</span></FilterLabel>
          <DualRange value={filters.age} min={18} max={65}
            onChange={v => { setFilters(f => ({ ...f, age: v })); setPage(1); }} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setFilters({ band: "All", offence: "All", region: "All", age: [18, 65] }); setPage(1); }}
          className="btn btn-ghost" style={{ fontSize: 12, color: "var(--color-accent)" }}>
          Clear filters
        </button>
      </div>

      <div className="card card-flush">
        <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-divider)" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Showing <span className="mono" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
              {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)}
            </span> of <span className="mono" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{sorted.length}</span> offenders
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}><Icon name="Columns3" size={13} /> Columns</button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}><Icon name="SlidersHorizontal" size={13} /> View</button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <SortHeader label="Reference" k="id" sort={sort} setSort={setSortKey} />
              <SortHeader label="Risk Score" k="score" sort={sort} setSort={setSortKey} />
              <th>Risk band</th>
              <SortHeader label="Offence" k="offence" sort={sort} setSort={setSortKey} />
              <SortHeader label="Region" k="region" sort={sort} setSort={setSortKey} />
              <SortHeader label="Age" k="age" sort={sort} setSort={setSortKey} />
              <SortHeader label="Prior" k="priorOffences" sort={sort} setSort={setSortKey} />
              <SortHeader label="Last assessed" k="lastAssessed" sort={sort} setSort={setSortKey} />
            </tr>
          </thead>
          <tbody>
            {slice.map(r => {
              const color = r.band === "HIGH" ? "var(--color-risk-high)" : r.band === "MEDIUM" ? "var(--color-risk-medium)" : "var(--color-risk-low)";
              return (
                <tr key={r.id} onClick={() => navigate(`/case/${r.id}`)}>
                  <td className="mono" style={{ fontWeight: 500 }}>
                    {r.id}
                    {r.overridden && <span className="tag" style={{ marginLeft: 8 }}>override</span>}
                  </td>
                  <td className="mono" style={{ color, fontWeight: 600 }}>{r.score.toFixed(2)}</td>
                  <td><RiskBadge band={r.band} /></td>
                  <td>{r.offence}</td>
                  <td>{r.region}</td>
                  <td className="mono">{r.age}</td>
                  <td className="mono">{r.priorOffences}</td>
                  <td className="mono" style={{ color: "var(--color-text-tertiary)" }}>{r.lastAssessed}</td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)" }}>
                No offenders match the current filters.
              </td></tr>
            )}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Page <span className="mono">{page}</span> of <span className="mono">{totalPages}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-secondary" disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ opacity: page === 1 ? 0.4 : 1, fontSize: 12 }}>
              <Icon name="ChevronLeft" size={14} /> Prev
            </button>
            <button className="btn btn-secondary" disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ opacity: page >= totalPages ? 0.4 : 1, fontSize: 12 }}>
              Next <Icon name="ChevronRight" size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
