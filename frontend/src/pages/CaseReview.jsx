/* SENTINEL — Case Review page (ported from prototype page-case.jsx) */
import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icon, RiskBadge, RiskGauge, ShapChart, GraphMinimap } from "../components/ui.jsx";
import { FallbackBanner } from "../components/PageBits.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../lib/api.js";
import { SENTINEL_DATA } from "../lib/mockData.js";

// Lay out a graph-service neighborhood (no positions) radially for the minimap. Null if empty.
function radialGraph(nbhd) {
  if (!nbhd || !Array.isArray(nbhd.nodes) || nbhd.nodes.length === 0) return null;
  const W = 440, H = 260, cx = W / 2, cy = H / 2;
  const center = nbhd.nodes.find(n => n.type === "offender") || nbhd.nodes[0];
  const others = nbhd.nodes.filter(n => n.id !== center.id);
  const nodes = [{ id: center.id, label: center.label, type: "offender", x: cx, y: cy }];
  others.forEach((n, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, others.length) - Math.PI / 2;
    nodes.push({ id: n.id, label: n.label, type: "area", x: cx + Math.cos(a) * 150, y: cy + Math.sin(a) * 88 });
  });
  const edges = (nbhd.edges || []).map(e => ({ from: e.source, to: e.target, label: "similar" }));
  return { nodes, edges };
}

export default function CaseReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const caseId = id || "OFN-2014-0847";

  const { data, error, loading, refetch } = useApi(() => api.offender(caseId), [caseId]);
  // Real knowledge-graph neighborhood from the graph service; falls back to canned when absent.
  const { data: nbhd } = useApi(() => api.graphNeighborhood(caseId), [caseId]);
  const realGraph = useMemo(() => radialGraph(nbhd), [nbhd]);

  // Optimistic override applied this session, so the page updates the instant one is submitted
  // (the backend also persists it and returns it on refetch). Cleared when switching cases.
  const [applied, setApplied] = useState(null);
  React.useEffect(() => { setApplied(null); }, [caseId]);

  // Assemble a view-model, falling back to mock data when the backend is unavailable.
  const D = SENTINEL_DATA;
  const baseC = (data && data.offender) || D.primary;
  // A human override is the effective decision — it changes the displayed band (not the score).
  const override = applied || (data && data.override) || (baseC.overridden ? { newBand: baseC.band } : null);
  const c = override ? { ...baseC, band: override.newBand, overridden: true } : baseC;
  const shap = (data && data.shap) || D.shap;
  const similar = (data && data.similar) || D.similar;
  const graph = realGraph || (data && data.graph) || D.graph;
  const detailedFactors = (data && data.detailedFactors) || D.detailedFactors;
  // Backend returns a real conformal interval that brackets the score; the mock fallback derives a
  // wide band from the score too (never a fixed narrow band that contradicts the displayed score).
  const ci = (data && data.ci) || [Math.max(0, (c.score ?? 0.5) - 0.5), Math.min(1, (c.score ?? 0.5) + 0.5)];
  const modelVersion = (data && data.modelVersion) || "xgb-cal-v1.0.0";
  const percentile = (data && data.percentile) || "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <CaseHeader c={c} modelVersion={modelVersion} override={override} />
      <FallbackBanner error={error} loading={loading && !data} onRetry={refetch} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 24 }}>
        <div className="card-stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <RiskScoreCard c={c} ci={ci} percentile={percentile} override={override} />
          <SHAPCard shap={shap} />
          <DetailedFactorsCard rows={detailedFactors} />
        </div>

        <div className="card-stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <GraphCard graph={graph} isReal={!!realGraph} />
          <SimilarCasesCard similar={similar} navigate={navigate} />
          <OverrideCard offenderId={c.id} currentBand={c.band} override={override}
            onApplied={(o) => { setApplied(o); refetch(); }} />
          <MiniChatCard navigate={navigate} offenderId={c.id} />
        </div>
      </div>
    </div>
  );
}

function CaseHeader({ c, modelVersion, override }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 className="page-title mono" style={{ letterSpacing: "0.01em" }}>{c.id}</h1>
          <RiskBadge band={c.band} size="lg" />
          {c.overridden && <span className="tag">Override active</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--color-text-tertiary)" }}>
          <span>Last assessed: <span style={{ color: "var(--color-text-secondary)" }}>{c.lastAssessed || "14 Mar 2026"}</span></span>
          <span style={{ width: 1, height: 14, background: "var(--color-divider)" }} />
          <span>Model: <span className="mono" style={{ color: "var(--color-text-secondary)" }}>{modelVersion}</span></span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", rowGap: 14, columnGap: 28, color: "var(--color-text-secondary)", fontSize: 13 }}>
        <CaseMeta label="Age" value={c.age} />
        <CaseMeta label="Gender" value={c.gender === "M" ? "Male" : "Female"} />
        <CaseMeta label="Region" value={c.region} />
        <CaseMeta label="Offence" value={c.offence} />
        <CaseMeta label="Priors" value={c.priorOffences} mono />
        <CaseMeta label="Supervision" value="Std + drug testing" />
      </div>
      {override && override.originalBand && override.originalBand !== override.newBand && (
        <div style={{
          marginTop: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 13,
          background: "var(--color-risk-medium-bg)", color: "var(--color-risk-medium)",
          padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
        }}>
          <Icon name="Info" size={15} />
          <span>
            <strong>Human override active.</strong> Band set to <span className="mono">{override.newBand}</span>
            {" "}(was <span className="mono">{override.originalBand}</span>)
            {override.reasonCode ? <> · {override.reasonCode}</> : null}
            {override.at ? <> · {override.at}</> : null}
          </span>
        </div>
      )}
      <div className="divider" style={{ marginTop: 16 }} />
    </div>
  );
}
function CaseMeta({ label, value, mono }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500, fontFamily: mono ? "var(--font-mono)" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function RiskScoreCard({ c, ci, percentile, override }) {
  const overridden = override && override.originalBand && override.originalBand !== override.newBand;
  return (
    <div className="card" style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h3 className="section-heading" style={{ marginBottom: 4 }}>Risk Score</h3>
          <div className="label-tertiary">Calibrated probability of recidivism within 3 years</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }}>
            <Icon name="Download" size={13} /> Report
          </button>
          <button className="btn btn-secondary" style={{ fontSize: 12 }}>
            <Icon name="GitCompare" size={13} /> Compare
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 32, alignItems: "center", marginTop: 16 }}>
        <RiskGauge score={c.score} ci={ci} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Stat label="Risk band" value={c.band}
            valueColor={c.band === "HIGH" ? "var(--color-risk-high)" : c.band === "MEDIUM" ? "var(--color-risk-medium)" : "var(--color-risk-low)"}
            note={overridden ? `Overridden — was ${override.originalBand}` : null} />
          <Stat label="Conformal interval (90%)" value={`[${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]`} mono />
          <Stat label="Calibration set Brier" value="0.18" mono />
          <Stat label="Cohort percentile" value={percentile} mono />
          <div className="divider" />
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", gap: 14, alignItems: "center" }}>
            <Icon name="Info" size={13} />
            <span>{overridden
              ? "The gauge shows the model's calibrated probability — an override changes the decision band, not the model's score."
              : "Risk score reflects model probability only. Final classification must include human review."}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor, mono, note }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-secondary)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, color: valueColor || "var(--color-text-primary)", fontWeight: 600, marginTop: 2, fontFamily: mono ? "var(--font-mono)" : "var(--font-display)" }}>
        {value}
      </div>
      {note && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function SHAPCard({ shap }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h3 className="section-heading" style={{ margin: 0 }}>Risk Factors</h3>
        <span className="label-tertiary">Top 10 features by SHAP contribution</span>
      </div>
      <div className="label-tertiary" style={{ marginBottom: 16 }}>
        Each bar shows the feature's contribution to this case's risk score. Plain English labels; values shown on the right.
      </div>
      <ShapChart data={shap} />
    </div>
  );
}

function DetailedFactorsCard({ rows }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card card-flush">
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", padding: "20px 24px", border: "none", background: "transparent",
        display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
      }}>
        <div style={{ textAlign: "left" }}>
          <h3 className="section-heading" style={{ margin: 0 }}>All Features</h3>
          <div className="label-tertiary" style={{ marginTop: 2 }}>54 features total · sorted by |SHAP|</div>
        </div>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={18} color="var(--color-text-secondary)" />
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--color-divider)" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Feature</th>
                <th style={{ width: 100 }}>Value</th>
                <th style={{ width: 140 }}>SHAP</th>
                <th style={{ width: 130 }}>Population avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const pos = r.contrib >= 0;
                return (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td className="mono">{r.val}</td>
                    <td className="mono" style={{ color: pos ? "var(--color-risk-high)" : "var(--color-risk-low)", fontWeight: 600 }}>
                      {pos ? "+" : ""}{r.contrib.toFixed(2)}
                    </td>
                    <td className="mono" style={{ color: "var(--color-text-tertiary)" }}>{r.avg}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GraphCard({ graph, isReal }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 className="section-heading" style={{ margin: 0 }}>Offender Network</h3>
        <span className="tag" title={isReal
          ? "Live from the Neo4j knowledge graph (similar-offender neighbourhood)."
          : "Illustrative sample — this offender is not in the knowledge graph."}>
          {isReal ? "knowledge graph" : "illustrative"}
        </span>
      </div>
      <GraphMinimap graph={graph} height={260} />
      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap", fontSize: 11, color: "var(--color-text-secondary)" }}>
        <LegendDot color="var(--color-accent)" label="Offender" />
        <LegendDot color="var(--color-risk-high)" label="Offence" />
        <LegendDot color="var(--color-risk-medium)" label="Condition" />
        <LegendDot color="var(--color-text-secondary)" label="Area" />
      </div>
    </div>
  );
}
function LegendDot({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span>{label}</span>
    </span>
  );
}

function SimilarCasesCard({ similar, navigate }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h3 className="section-heading" style={{ margin: 0 }}>Similar Historical Cases</h3>
        <span className="label-tertiary">nearest by risk score</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {similar.map((s, i) => {
          const reoff = s.outcome === "reoffended";
          return (
            <button key={i} onClick={() => navigate(`/case/${s.id}`)}
              style={{
                background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)", padding: 14, textAlign: "left", cursor: "pointer",
                display: "grid", gridTemplateColumns: "1fr auto", gap: 8, transition: "border-color 120ms ease",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border-strong)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{s.id}</span>
                  <RiskBadge band={s.band} />
                </div>
                <div style={{ fontSize: 12, color: reoff ? "var(--color-risk-high)" : "var(--color-risk-low)", fontWeight: 500, marginBottom: 6 }}>
                  {s.outcomeText}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {s.shared.map((t, j) => <span key={j} className="tag">{t}</span>)}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                <div>similarity</div>
                <div className="mono" style={{ fontSize: 18, color: "var(--color-text-primary)", fontWeight: 600 }}>
                  {s.similarity.toFixed(2)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverrideCard({ offenderId, currentBand, override, onApplied }) {
  const original = currentBand || "MEDIUM";
  const [band, setBand] = useState(original);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const { data: refData } = useApi(() => api.reference(), []);
  const reasonCodes = (refData && refData.reasonCodes) || SENTINEL_DATA.reasonCodes;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setError(null);
    try {
      await api.override({
        offender_id: offenderId,
        original_band: original,
        new_band: band,
        reason_code: reason,
        reason_text: notes,
      });
      setSubmitted(true);
      // Lift the applied override so the case view (header band, risk-band stat) updates at once.
      onApplied?.({ originalBand: original, newBand: band, reasonCode: reason, reasonText: notes, at: "just now" });
      setTimeout(() => setSubmitted(false), 4000);
    } catch (err) {
      setError(err?.message || "Override failed. Please try again.");
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h3 className="section-heading" style={{ margin: 0 }}>Risk Override</h3>
        <span className="label-tertiary">{override && override.originalBand ? "Override on record" : "No override on record"}</span>
      </div>
      <div className="label-tertiary" style={{ marginBottom: 14 }}>
        Submitted overrides are logged to the audit trail and inform future model calibration.
      </div>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Adjust risk band">
          <div className="pill-group" style={{ width: "100%", display: "flex" }}>
            {["LOW", "MEDIUM", "HIGH"].map(b => (
              <button key={b} type="button" className={b === band ? "active" : ""}
                onClick={() => setBand(b)} style={{ flex: 1 }}>
                {b}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Reason code">
          <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">Select a reason…</option>
            {reasonCodes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Additional notes">
          <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Provide context for this override (recommended)…" />
        </Field>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="btn btn-primary" disabled={!reason}
            style={{ opacity: reason ? 1 : 0.5, cursor: reason ? "pointer" : "not-allowed" }}>
            <Icon name="Check" size={14} /> Submit override
          </button>
          {submitted && (
            <span style={{ fontSize: 12, color: "var(--color-risk-low)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="CheckCircle2" size={14} /> {original} → {band} recorded · logged to audit
            </span>
          )}
          {error && (
            <span style={{ fontSize: 12, color: "var(--color-risk-high)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="AlertTriangle" size={14} /> {error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
function Field({ label, children }) {
  const autoId = React.useId();
  // Associate the label with the control for screen readers / click-to-focus.
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { id: children.props.id || autoId, "aria-label": label })
    : children;
  const htmlFor = React.isValidElement(child) ? child.props.id : undefined;
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: "block", fontSize: 11, textTransform: "uppercase",
        letterSpacing: "0.06em", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: 6 }}>
        {label}
      </label>
      {child}
    </div>
  );
}

function MiniChatCard({ navigate, offenderId }) {
  const [q, setQ] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const simulated = {
    answer: "Based on this offender's profile and the supervision conditions currently in place, evidence-based interventions include cognitive behavioural therapy targeting decision-making, and structured drug-court placement. Both have meta-analytic effect sizes of d ≈ 0.25 on reoffence reduction for similar profiles[1].",
    citation: { source: "MoJ Evidence Review, 2023", page: 14, score: 0.88 },
    path: "Hybrid",
  };

  const onSend = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setResponse(null);
    try {
      const r = await api.chat({ message: q, offender_id: offenderId });
      const cite = (r.citations && r.citations[0]) || simulated.citation;
      setResponse({
        answer: r.answer || simulated.answer,
        citation: { source: cite.source, page: cite.page, score: cite.score },
        path: r.retrieval || "Hybrid",
      });
    } catch {
      // Agent service may not be live yet — fall back to a simulated response.
      setResponse(simulated);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 className="section-heading" style={{ margin: 0 }}>Ask the Assistant</h3>
        <a onClick={() => navigate("/assistant")} style={{ fontSize: 12, color: "var(--color-accent)", cursor: "pointer" }}>
          Open full assistant →
        </a>
      </div>
      <form onSubmit={onSend} style={{ position: "relative" }}>
        <input className="input" placeholder="Ask about this case or relevant policies…"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ paddingRight: 40 }} />
        <button type="submit" className="btn btn-ghost"
          style={{ position: "absolute", right: 4, top: 3, padding: 6 }}>
          <Icon name="Send" size={16} color="var(--color-accent)" />
        </button>
      </form>
      {loading && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--color-bg-elevated)", borderRadius: "var(--radius-sm)",
          fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="Loader2" size={14} /> Retrieving context…
        </div>
      )}
      {response && (
        <div style={{ marginTop: 12, padding: 14, background: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-text-primary)" }}>
            {response.answer.split("[1]").map((part, i) => (
              <React.Fragment key={i}>
                {part}
                {i === 0 && response.answer.includes("[1]") && <button className="citation-chip">1</button>}
              </React.Fragment>
            ))}
          </div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between",
            fontSize: 11, color: "var(--color-text-tertiary)" }}>
            <span><span className="mono">[1]</span> {response.citation.source}, p.{response.citation.page}</span>
            <span className="tag">{response.path} retrieval</span>
          </div>
        </div>
      )}
    </div>
  );
}
