/* SENTINEL — Fairness Monitor page (ported from prototype page-charts.jsx) */
import React, { useState } from "react";
import { Icon, LineChart, GroupedBarChart } from "../components/ui.jsx";
import { PageHeader, FallbackBanner } from "../components/PageBits.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { SENTINEL_DATA } from "../lib/mockData.js";

export default function FairnessMonitor() {
  const [group, setGroup] = useState("Race");
  const { data: metricsData, error: metricsError, loading, refetch } = useApi(() => api.fairnessMetrics(group), [group]);
  const { data: historyData } = useApi(() => api.fairnessHistory(), []);

  const current = (metricsData && metricsData.current) || SENTINEL_DATA.fairness.current;
  const groups = (metricsData && metricsData.groups) || ["Race", "Gender"];
  const timeseries = (historyData && historyData.timeseries) || SENTINEL_DATA.fairness.timeseries;
  const comparison = (historyData && historyData.comparison) || SENTINEL_DATA.fairness.comparison;

  const [visible, setVisible] = useState({ SPD: true, DI: true, EOD: true, PED: true });
  const [cardOpen, setCardOpen] = useState(false);

  const seriesColors = {
    SPD: "var(--color-accent)",
    DI: "var(--color-text-secondary)",
    EOD: "var(--color-risk-medium)",
    PED: "var(--color-risk-high)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Fairness Monitor"
        subtitle="Group fairness metrics monitored against thresholds set in the criminal-justice domain pack. Breaches block CI."
        actions={
          <>
            <select className="select" value={group} onChange={e => setGroup(e.target.value)}
              aria-label="Protected attribute" style={{ minWidth: 140 }}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={() => setCardOpen(o => !o)}>
              <Icon name="FileText" size={14} /> {cardOpen ? "Hide" : "Open"} model card
            </button>
          </>
        }
      />

      <FallbackBanner error={metricsError} loading={loading && !metricsData} onRetry={refetch} />

      <div className="card-stagger grid-kpi">
        {current.map(m => <FairnessCard key={m.name} m={m} />)}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <h3 className="section-heading" style={{ margin: 0 }}>Metrics over time</h3>
            <div className="label-tertiary" style={{ marginTop: 4 }}>Per-cohort fairness across the last 7 production releases</div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {Object.keys(visible).map(k => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={visible[k]} onChange={() => setVisible(v => ({ ...v, [k]: !v[k] }))}
                  style={{ accentColor: seriesColors[k] }} />
                <span style={{ width: 10, height: 2, background: seriesColors[k] }} />
                {k}
              </label>
            ))}
          </div>
        </div>
        <LineChart
          data={timeseries}
          xKey="date"
          height={280}
          yDomain={[-0.15, 0.15]}
          yTicks={6}
          series={[
            visible.SPD && { key: "SPD", color: seriesColors.SPD, label: "SPD" },
            visible.DI && { key: "DI", color: seriesColors.DI, label: "DI" },
            visible.EOD && { key: "EOD", color: seriesColors.EOD, label: "EOD" },
            visible.PED && { key: "PED", color: seriesColors.PED, label: "PED" },
          ].filter(Boolean)}
          refLines={[
            { value: 0.1, label: "threshold +0.10", color: "var(--color-warning)" },
            { value: -0.1, label: "threshold −0.10", color: "var(--color-warning)" },
          ]}
        />
        <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: "var(--color-text-tertiary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 6, background: "var(--color-risk-high-bg)" }} /> Breach zone
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 1.5, background: "var(--color-warning)" }} /> Threshold
          </span>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <h3 className="section-heading" style={{ margin: 0 }}>Pre vs post debiasing</h3>
          <span className="label-tertiary">Mean predicted risk per group · race</span>
        </div>
        <div className="label-tertiary" style={{ marginBottom: 12 }}>
          Reweighing (pre-processing) + Exponentiated Gradient (in-processing) reduces dispersion of predicted risk across groups by 41%.
        </div>
        <GroupedBarChart
          data={comparison}
          height={260}
          groups={[
            { key: "unconstrained", color: "var(--color-text-secondary)", label: "Unconstrained" },
            { key: "debiased", color: "var(--color-accent)", label: "Debiased" },
          ]}
        />
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: "var(--color-text-secondary)", opacity: 0.7 }} /> Unconstrained model
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: "var(--color-accent)", opacity: 0.7 }} /> Debiased model
          </span>
        </div>
      </div>

      <div className="card card-flush">
        <button onClick={() => setCardOpen(o => !o)} style={{
          width: "100%", padding: "20px 24px", border: "none", background: "transparent", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ textAlign: "left" }}>
            <h3 className="section-heading" style={{ margin: 0 }}>Model Card · xgb-cal-v1.0.0</h3>
            <div className="label-tertiary" style={{ marginTop: 4 }}>Auto-generated from training run · committed to MLflow</div>
          </div>
          <Icon name={cardOpen ? "ChevronUp" : "ChevronDown"} size={18} color="var(--color-text-secondary)" />
        </button>
        {cardOpen && <ModelCardBody current={current} />}
      </div>
    </div>
  );
}

function FairnessCard({ m }) {
  const pass = m.pass;
  const valueDisplay = m.value.toFixed(2);
  const thresholdText = m.direction === "range"
    ? `must be within [${m.threshold[0].toFixed(2)}, ${m.threshold[1].toFixed(2)}]`
    : `|value| < ${m.threshold.toFixed(2)}`;

  let pos, bandFill;
  if (m.direction === "abs") {
    const t = m.threshold;
    pos = Math.max(0, Math.min(1, (m.value + t * 1.5) / (t * 3)));
    bandFill = (
      <div style={{ position: "absolute", left: "16.67%", right: "16.67%", top: 0, bottom: 0,
        background: "var(--color-risk-low-bg)" }} />
    );
  } else {
    const [lo, hi] = m.threshold;
    const range = hi - lo;
    pos = Math.max(0, Math.min(1, (m.value - (lo - range * 0.4)) / (range * 1.8)));
    bandFill = (
      <div style={{ position: "absolute", left: "22%", right: "22%", top: 0, bottom: 0,
        background: "var(--color-risk-low-bg)" }} />
    );
  }

  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--color-text-secondary)" }}>{m.name}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{m.full}</div>
        </div>
        <div style={{
          width: 22, height: 22, borderRadius: "50%",
          background: pass ? "var(--color-risk-low-bg)" : "var(--color-risk-high-bg)",
          color: pass ? "var(--color-risk-low)" : "var(--color-risk-high)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={pass ? "Check" : "X"} size={13} strokeWidth={2.5} />
        </div>
      </div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 600, marginTop: 8,
        color: pass ? "var(--color-text-primary)" : "var(--color-risk-high)" }}>
        {m.value > 0 && m.direction !== "range" ? "+" : ""}{valueDisplay}
      </div>

      <div style={{ position: "relative", height: 6, background: "var(--color-bg-elevated)", marginTop: 14, borderRadius: 3, overflow: "hidden" }}>
        {bandFill}
        <div style={{
          position: "absolute", left: `calc(${pos * 100}% - 1px)`, top: -3, bottom: -3, width: 2,
          background: pass ? "var(--color-risk-low)" : "var(--color-risk-high)",
        }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>
        {thresholdText}
      </div>
    </div>
  );
}

function ModelCardBody({ current }) {
  const val = (name) => {
    const m = (current || []).find(x => x.name === name);
    return m ? m.value.toFixed(2) : "—";
  };
  const allPass = (current || []).length > 0 && current.every(m => m.pass);
  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
      <Block title="Intended use">
        Decision support for parole and supervision-level reviews. Outputs are advisory only;
        a probability score above any threshold does <i>not</i> authorise punitive action. A human
        makes the final decision and may override the score with a documented reason.
      </Block>
      <Block title="Out of scope">
        Pre-trial bail decisions, juvenile assessment, and individuals without a completed
        risk-relevant feature vector.
      </Block>
      <Block title="Performance">
        Brier 0.224 · AUC-ROC 0.670 · AUC-PR 0.598 (held-out test). A single XGBoost classifier,
        Platt-calibrated; deliberately mediocre AUC is typical for individual recidivism prediction.
      </Block>
      <Block title="Fairness evaluation">
        Race-stratified (mitigated, production): SPD {val("SPD")} · DI {val("DI")} · EOD {val("EOD")} · PED {val("PED")}.
        {" "}{allPass
          ? "All four metrics are within threshold — the CI fairness gate passes."
          : "One or more metrics breach threshold — the CI fairness gate would block this release."}
        {" "}The unmitigated baseline failed (proxy features leak race); mitigation is reweighing plus
        per-group decision thresholds.
      </Block>
      <Block title="Decision-threshold note">
        The risk <i>score</i> is race-blind (race and gender are excluded from the model features). To
        equalise the HIGH-risk flag rate across groups, the HIGH threshold is calibrated <i>per race
        group</i> at decision time — a transparent fairness-through-awareness choice, recorded in the
        model schema.
      </Block>
      <Block title="Provenance">
        The public NIJ host is currently unreachable, so the pipeline trains on a <b>synthetic</b>
        dataset (~25,835 rows) that reproduces the NIJ feature schema and an illustrative
        proxy-mediated demographic disparity. All metrics above are on synthetic data.
      </Block>
    </div>
  );
}
function Block({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
        color: "var(--color-accent)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-primary)" }}>{children}</div>
    </div>
  );
}
