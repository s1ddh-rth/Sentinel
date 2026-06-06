/* SENTINEL — Model Performance page (ported from prototype page-charts.jsx) */
import React from "react";
import { Icon, MetricCard, LineChart } from "../components/ui.jsx";
import { PageHeader } from "../components/PageBits.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { SENTINEL_DATA } from "../lib/mockData.js";

export default function ModelPerformance() {
  const { data } = useApi(() => api.modelsPerformance(), []);

  const calibration = (data && data.calibration) || SENTINEL_DATA.calibration;
  const roc = (data && data.roc) || SENTINEL_DATA.roc;
  // Only ever show the real production run(s); never the fabricated promotion history.
  const mlflow = (data && data.mlflow) || [];
  const brier = data ? data.brier : 0.224;
  const auc = data ? data.auc : 0.670;
  const aucpr = data ? data.aucpr : 0.598;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Model Performance"
        subtitle="Production model metrics and calibration, read from the latest training run."
        actions={
          <select className="select" defaultValue="prod" style={{ minWidth: 200 }} aria-label="Model version">
            <option value="prod">Production model · xgb-cal-v1.0.0</option>
          </select>
        }
      />

      <div className="card-stagger grid-kpi">
        <MetricCard label="Brier Score" value={brier.toFixed(3)} context="lower is better · primary metric" />
        <MetricCard label="AUC-ROC" value={auc.toFixed(3)} context="ranking quality" />
        <MetricCard label="AUC-PR" value={aucpr.toFixed(3)} context="precision–recall area" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <h3 className="section-heading" style={{ margin: 0 }}>Calibration</h3>
            <div className="label-tertiary" style={{ marginTop: 4 }}>
              Reliability diagram · how closely predicted probabilities match observed reoffence rates.
            </div>
          </div>
          <LineChart
            data={calibration}
            xKey="predicted"
            height={260}
            yDomain={[0, 1]}
            xTicksEvery={2}
            series={[
              { key: "predicted", color: "var(--color-text-tertiary)", dashed: true },
              { key: "actual", color: "var(--color-accent)" },
            ]}
          />
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 2, background: "var(--color-text-tertiary)", borderTop: "1px dashed var(--color-text-tertiary)" }} />
              Perfect calibration
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 2, background: "var(--color-accent)" }} />
              Production model
            </span>
          </div>
        </div>

        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <h3 className="section-heading" style={{ margin: 0 }}>ROC Curve</h3>
              <span className="mono label-tertiary" style={{ whiteSpace: "nowrap" }}>AUC {auc.toFixed(3)}</span>
            </div>
            <div className="label-tertiary" style={{ marginTop: 4 }}>
              True positive rate versus false positive rate across the discrimination threshold.
            </div>
          </div>
          <LineChart
            data={roc}
            xKey="fpr"
            height={260}
            yDomain={[0, 1]}
            xTicksEvery={4}
            series={[
              { key: "baseline", color: "var(--color-text-tertiary)", dashed: true },
              { key: "tpr", color: "var(--color-accent)" },
            ]}
            areaKey="tpr"
          />
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <h3 className="section-heading" style={{ margin: 0 }}>Retrieval pipeline</h3>
          <span className="label-tertiary">assistant · hybrid GraphRAG</span>
        </div>
        <div className="label-tertiary" style={{ marginBottom: 16 }}>
          The assistant grounds answers in the policy corpus through a multi-stage retriever. Automated
          RAGAS quality evaluation (faithfulness, context precision) is on the roadmap.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Dense", "sentence-transformers MiniLM embeddings, Qdrant vector search"],
            ["Sparse", "BM25 lexical retrieval over the same chunks"],
            ["HyDE", "hypothetical-document expansion (needs the LLM)"],
            ["Fusion", "reciprocal-rank fusion of dense + sparse + HyDE"],
            ["Graph", "1-hop expansion over a chunk-similarity graph"],
            ["Rerank", "cross-encoder ms-marco-MiniLM rescoring"],
          ].map(([stage, desc]) => (
            <div key={stage} style={{ display: "grid", gridTemplateColumns: "90px 1fr", alignItems: "baseline", gap: 12 }}>
              <span className="tag" style={{ justifySelf: "start" }}>{stage}</span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-flush">
        <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 className="section-heading" style={{ margin: 0 }}>MLflow Runs</h3>
          <span className="label-tertiary">Latest 5 training runs</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Run ID</th><th>Date</th><th>Brier</th><th>AUC-ROC</th><th>SPD</th><th>DI</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {mlflow.map(r => {
              const isProd = r.status === "production";
              return (
                <tr key={r.runId} style={isProd ? { background: "var(--color-accent-subtle)" } : null}>
                  <td className="mono" style={{ fontWeight: 600 }}>{r.runId}</td>
                  <td className="mono" style={{ color: "var(--color-text-tertiary)" }}>{r.date}</td>
                  <td className="mono">{r.brier.toFixed(3)}</td>
                  <td className="mono">{r.auc.toFixed(3)}</td>
                  <td className="mono">{r.spd > 0 ? "+" : ""}{r.spd.toFixed(2)}</td>
                  <td className="mono">{r.di.toFixed(2)}</td>
                  <td>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.06em", padding: "2px 8px", borderRadius: "var(--radius-sm)",
                      color: isProd ? "var(--color-risk-low)" : r.status === "staging" ? "var(--color-risk-medium)" : "var(--color-text-tertiary)",
                      background: isProd ? "var(--color-risk-low-bg)" : r.status === "staging" ? "var(--color-risk-medium-bg)" : "var(--color-bg-elevated)",
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === "staging" && (
                      <button className="btn btn-primary" style={{ fontSize: 11, padding: "5px 10px" }}>
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
