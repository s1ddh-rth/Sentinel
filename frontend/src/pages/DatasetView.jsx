/* SENTINEL — Dataset inspection page.
   Exposes the raw training dataset (the synthetic NIJ parquet the model, fairness audit, and graph
   are all built on) so a reviewer can see exactly what the model was trained on. No mock fallback:
   if the backend can't serve the data we show an honest empty state rather than fabricating rows. */
import React, { useState } from "react";
import { Icon, MetricCard } from "../components/ui.jsx";
import { PageHeader } from "../components/PageBits.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";

const PAGE_SIZE = 25;

// Render a raw cell value readably without hiding what it actually is.
function formatCell(key, value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "Recidivism_Within_3years") return value === 1 ? "Reoffended" : "No";
  if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(3);
  return String(value);
}

function DistributionBars({ title, data }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="card" style={{ flex: 1, minWidth: 240 }}>
      <h3 className="section-heading" style={{ margin: 0, marginBottom: 14 }}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 48px", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <div style={{ height: 8, background: "var(--color-bg-elevated)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${d.pct}%`, height: "100%", background: "var(--color-accent)", opacity: 0.8 }} />
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "right" }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DatasetView() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi(() => api.dataset((page - 1) * PAGE_SIZE, PAGE_SIZE), [page]);

  const available = data?.available;
  const stats = data?.stats;
  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Download a 1,000-row sample of the raw data as CSV (built client-side from a wider fetch).
  const exportCsv = async () => {
    const d = await api.dataset(0, 1000);
    if (!d?.available) return;
    const cols = d.columns.map((c) => c.key);
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(","), ...d.rows.map((r) => cols.map((c) => esc(r[c])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel-training-sample-${d.rows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Training Dataset"
        subtitle="The exact data the model, fairness audit, and similarity graph are computed on. Race and gender are present here for auditing but are excluded from the model's feature set."
        actions={
          <button className="btn btn-secondary" onClick={exportCsv} disabled={!available}
            style={{ opacity: available ? 1 : 0.5 }}>
            <Icon name="Download" size={14} /> Download sample CSV
          </button>
        }
      />

      {/* Provenance — this is synthetic data, said plainly. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, fontSize: 13,
        background: "var(--color-risk-medium-bg)", color: "var(--color-risk-medium)",
        padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
      }}>
        <Icon name="Info" size={15} />
        <span>
          <strong>Synthetic data.</strong> {data?.source || "NIJ Recidivism Forecasting Challenge schema, synthesised locally"} —
          the public OJP host is unreachable from this environment. The schema is faithful to the real
          challenge; the values are generated. Swap in the real parquet and retrain to use live data.
        </span>
      </div>

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
          <Icon name="Loader2" size={18} /> Loading dataset…
        </div>
      )}

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          background: "var(--color-risk-high-bg)", color: "var(--color-risk-high)",
          padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
        }}>
          <Icon name="AlertTriangle" size={14} /> Backend unreachable — the dataset is served by the predict service.
        </div>
      )}

      {data && !available && !error && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
          <Icon name="Database" size={22} />
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--color-text-secondary)" }}>
            The training parquet is not mounted on the server.
          </div>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            Run <span className="mono">pipelines/data_prep.py</span> to generate it, then restart the predict service.
          </div>
        </div>
      )}

      {available && stats && (
        <>
          <div className="card-stagger grid-kpi">
            <MetricCard label="Total rows" value={stats.rows.toLocaleString()} context="parolees in the dataset" />
            <MetricCard label="Recidivism rate" value={stats.recidivismRate} suffix="%" context="reoffended within 3 years" />
            <MetricCard label="Mean age at release" value={stats.ageMean} context={`range ${stats.ageMin}–${stats.ageMax}`} />
            <MetricCard label="Gang affiliated" value={stats.gangPct} suffix="%" context="of the population" />
            <MetricCard label="Mean days employed" value={stats.employedMean} suffix="%" context="proportion of supervision" />
            <MetricCard label="Columns" value={stats.columns} context="features + identifiers + target" />
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <DistributionBars title="By race" data={stats.byRace} />
            <DistributionBars title="By gender" data={stats.byGender} />
            <DistributionBars title="By supervision level" data={stats.bySupervision} />
          </div>

          <div className="card card-flush">
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-divider)", fontSize: 13, color: "var(--color-text-secondary)" }}>
              Showing <span className="mono" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
              </span> of <span className="mono" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{total.toLocaleString()}</span> rows
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>{columns.map((c) => <th key={c.key} style={{ whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ID || i}>
                      {columns.map((c) => (
                        <td key={c.key} className={c.key === "ID" ? "mono" : undefined}
                          style={c.key === "ID" ? { fontWeight: 500, whiteSpace: "nowrap" } : { whiteSpace: "nowrap" }}>
                          {formatCell(c.key, r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                Page <span className="mono">{page}</span> of <span className="mono">{totalPages.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-secondary" disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ opacity: page === 1 ? 0.4 : 1, fontSize: 12 }}>
                  <Icon name="ChevronLeft" size={14} /> Prev
                </button>
                <button className="btn btn-secondary" disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ opacity: page >= totalPages ? 0.4 : 1, fontSize: 12 }}>
                  Next <Icon name="ChevronRight" size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
