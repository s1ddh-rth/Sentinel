// SENTINEL — Mock data (ported from prototype mock-data.js).
// Used as a fallback so the UI is never blank when the backend is unavailable.

const offenceTypes = ["Theft", "Burglary", "Drug Possession", "Assault", "Fraud", "DUI", "Robbery"];
const regions = ["Atlanta Metro", "Savannah", "Augusta", "Macon", "Columbus", "Rural North", "Rural South"];
const races = ["White", "Black", "Hispanic", "Other"];
const reasonCodes = ["Stable employment", "Family support", "Clinical assessment", "New information", "Recent compliance", "Other"];

// Deterministic pseudo-random
let seed = 1337;
function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function range(min, max) { return min + rand() * (max - min); }
function rint(min, max) { return Math.floor(range(min, max + 1)); }

function bandFor(score) {
  if (score < 0.3) return "LOW";
  if (score < 0.6) return "MEDIUM";
  return "HIGH";
}

// ===== Offender cohort =====
const cohort = [];
for (let i = 0; i < 48; i++) {
  const score = +rand().toFixed(2);
  const id = `OFN-${2014 + rint(0, 9)}-${String(rint(100, 9999)).padStart(4, "0")}`;
  cohort.push({
    id,
    score,
    band: bandFor(score),
    offence: pick(offenceTypes),
    region: pick(regions),
    age: rint(19, 64),
    race: pick(races),
    gender: rand() > 0.85 ? "F" : "M",
    lastAssessed: `2026-${String(rint(1, 3)).padStart(2, "0")}-${String(rint(1, 28)).padStart(2, "0")}`,
    priorOffences: rint(0, 7),
    overridden: rand() < 0.08,
  });
}
// Force a known case as primary
cohort[0] = {
  id: "OFN-2014-0847",
  score: 0.73,
  band: "HIGH",
  offence: "Burglary",
  region: "Atlanta Metro",
  age: 34,
  race: "Black",
  gender: "M",
  lastAssessed: "2026-03-14",
  priorOffences: 4,
  overridden: false,
};

// ===== SHAP factors for primary case =====
const shap = [
  { feature: "Prior violent offences", value: "4", contribution: 0.18 },
  { feature: "Age at release", value: "34", contribution: 0.11 },
  { feature: "Months without employment", value: "9", contribution: 0.09 },
  { feature: "Drug dependency flag", value: "Yes", contribution: 0.08 },
  { feature: "Education (years)", value: "10", contribution: 0.06 },
  { feature: "Area poverty rate", value: "0.28", contribution: 0.05 },
  { feature: "Supervision conditions met", value: "8/12", contribution: -0.04 },
  { feature: "Stable address (12+ months)", value: "Yes", contribution: -0.06 },
  { feature: "Family contact frequency", value: "Weekly", contribution: -0.07 },
  { feature: "Program participation", value: "3", contribution: -0.09 },
];

// ===== Detailed factors (All Features table) =====
const detailedFactors = [
  { name: "Prior violent offences", val: "4", contrib: 0.18, avg: "1.2" },
  { name: "Age at release", val: "34", contrib: 0.11, avg: "29.4" },
  { name: "Months without employment", val: "9", contrib: 0.09, avg: "4.2" },
  { name: "Drug dependency flag", val: "Yes", contrib: 0.08, avg: "—" },
  { name: "Education (years)", val: "10", contrib: 0.06, avg: "11.7" },
  { name: "Area poverty rate", val: "0.28", contrib: 0.05, avg: "0.18" },
  { name: "Supervision conditions met", val: "8/12", contrib: -0.04, avg: "10/12" },
  { name: "Stable address (12+ mo)", val: "Yes", contrib: -0.06, avg: "—" },
  { name: "Family contact frequency", val: "Weekly", contrib: -0.07, avg: "Monthly" },
  { name: "Program participation", val: "3", contrib: -0.09, avg: "1.4" },
];

// ===== Similar cases =====
const similar = [
  { id: "OFN-2017-3251", band: "HIGH", similarity: 0.91, outcome: "reoffended", outcomeText: "Reoffended within 14 months", shared: ["Prior violent × 3", "Drug history", "Same region"] },
  { id: "OFN-2015-1126", band: "HIGH", similarity: 0.87, outcome: "reoffended", outcomeText: "Reoffended within 22 months", shared: ["Burglary", "Unemployment 6+ mo", "Age band"] },
  { id: "OFN-2018-4720", band: "MEDIUM", similarity: 0.83, outcome: "clean", outcomeText: "No reoffence (3 years)", shared: ["Family support", "Program completion", "Burglary"] },
];

// ===== Knowledge graph minimap =====
const graph = {
  nodes: [
    { id: "off", label: "OFN-2014-0847", type: "offender", x: 220, y: 120 },
    { id: "o1", label: "Burglary", type: "offence", x: 90, y: 50 },
    { id: "o2", label: "Theft", type: "offence", x: 60, y: 150 },
    { id: "o3", label: "Drug Poss.", type: "offence", x: 90, y: 210 },
    { id: "c1", label: "Curfew 10pm", type: "condition", x: 360, y: 60 },
    { id: "c2", label: "Drug testing", type: "condition", x: 380, y: 180 },
    { id: "a1", label: "Atlanta Metro", type: "area", x: 230, y: 230 },
  ],
  edges: [
    { from: "off", to: "o1", label: "committed" },
    { from: "off", to: "o2", label: "committed" },
    { from: "off", to: "o3", label: "committed" },
    { from: "off", to: "c1", label: "supervised" },
    { from: "off", to: "c2", label: "supervised" },
    { from: "off", to: "a1", label: "released to" },
  ],
};

// ===== Fairness metrics =====
const fairness = {
  current: [
    { name: "SPD", full: "Statistical Parity Difference", value: -0.06, threshold: 0.1, pass: true, direction: "abs" },
    { name: "DI", full: "Disparate Impact", value: 0.92, threshold: [0.8, 1.25], pass: true, direction: "range" },
    { name: "EOD", full: "Equal Opportunity Difference", value: -0.08, threshold: 0.1, pass: true, direction: "abs" },
    { name: "PED", full: "Predictive Equality Difference", value: 0.11, threshold: 0.1, pass: false, direction: "abs" },
  ],
  timeseries: (function () {
    const dates = ["Sep '25", "Oct '25", "Nov '25", "Dec '25", "Jan '26", "Feb '26", "Mar '26"];
    return dates.map((d, i) => ({
      date: d,
      SPD: +(-0.04 - i * 0.005 + (i % 2) * 0.01).toFixed(3),
      DI: +(0.97 - i * 0.008 + (i % 3) * 0.012).toFixed(3),
      EOD: +(-0.05 - i * 0.006 + (i % 2) * 0.012).toFixed(3),
      PED: +(0.07 + i * 0.007 + (i % 2) * 0.008).toFixed(3),
    }));
  })(),
  comparison: [
    { group: "White", unconstrained: 0.42, debiased: 0.45 },
    { group: "Black", unconstrained: 0.61, debiased: 0.51 },
    { group: "Hispanic", unconstrained: 0.55, debiased: 0.49 },
    { group: "Other", unconstrained: 0.48, debiased: 0.47 },
  ],
};

// ===== Model performance =====
const calibration = (function () {
  const out = [];
  for (let i = 0; i <= 10; i++) {
    const p = i / 10;
    out.push({ predicted: p, actual: +Math.max(0, Math.min(1, p - 0.03 + (rand() - 0.5) * 0.05)).toFixed(3) });
  }
  return out;
})();
const roc = (function () {
  const out = [];
  for (let i = 0; i <= 20; i++) {
    const fpr = i / 20;
    const tpr = Math.min(1, Math.pow(fpr, 0.42));
    out.push({ fpr: +fpr.toFixed(3), tpr: +tpr.toFixed(3), baseline: +fpr.toFixed(3) });
  }
  return out;
})();
const ragas = [
  { metric: "Faithfulness", value: 0.89, target: 0.85 },
  { metric: "Answer Relevance", value: 0.86, target: 0.8 },
  { metric: "Context Precision", value: 0.82, target: 0.8 },
  { metric: "Context Recall", value: 0.77, target: 0.8 },
];
const mlflow = [
  { runId: "a3f1c2b", date: "2026-03-12", brier: 0.182, auc: 0.781, spd: -0.06, di: 0.92, status: "production" },
  { runId: "9b87d04", date: "2026-03-05", brier: 0.189, auc: 0.776, spd: -0.07, di: 0.91, status: "staging" },
  { runId: "f12e8a1", date: "2026-02-26", brier: 0.193, auc: 0.769, spd: -0.09, di: 0.88, status: "archived" },
  { runId: "5c9d3a7", date: "2026-02-19", brier: 0.201, auc: 0.762, spd: -0.11, di: 0.84, status: "archived" },
  { runId: "1bf6e22", date: "2026-02-12", brier: 0.207, auc: 0.755, spd: -0.13, di: 0.81, status: "archived" },
];

// ===== Audit trail =====
const audit = [];
const actions = ["prediction", "override", "feedback", "promotion"];
for (let i = 0; i < 56; i++) {
  const action = pick(actions);
  const off = cohort[rint(0, cohort.length - 1)];
  const date = `2026-03-${String(14 - Math.floor(i / 6)).padStart(2, "0")}`;
  const t = `${String(rint(7, 18)).padStart(2, "0")}:${String(rint(0, 59)).padStart(2, "0")}:${String(rint(0, 59)).padStart(2, "0")}`;
  audit.push({
    id: `a${i}`,
    ts: `${date} ${t}`,
    action,
    offender: action === "promotion" ? "—" : off.id,
    user: pick(["m.albright", "j.okafor", "system", "r.singh", "k.lewis", "system"]),
    details: action === "prediction" ? `Risk ${off.score.toFixed(2)} (${off.band})`
      : action === "override" ? `${pick(["LOW", "MEDIUM", "HIGH"])} → ${off.band}, ${pick(reasonCodes)}`
      : action === "feedback" ? `Disposition recorded`
      : `staging → production, brier −0.007`,
    model: "xgb-cal-v1.0.0",
  });
}

export const SENTINEL_DATA = {
  offenceTypes, regions, races, reasonCodes,
  cohort, primary: cohort[0], shap, detailedFactors, similar, graph,
  fairness, calibration, roc, ragas, mlflow,
  audit,
  metrics: {
    totalAssessed: 3412,
    highRisk: 614,
    overrideRate: 0.082,
    meanScore: 0.41,
    brier: 0.182, auc: 0.781, aucpr: 0.534,
  },
};

export default SENTINEL_DATA;
