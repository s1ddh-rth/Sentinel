"""Deterministic synthetic dataset backing the data endpoints until a real model is trained.

Mirrors the shapes in the design prototype's ``mock-data.js`` (and the API contract) so the React
pages render identically whether served from here or from real data later. A fixed seed makes every
process produce the same cohort, so IDs are stable across requests and restarts.
"""

from __future__ import annotations

from typing import Any

OFFENCE_TYPES = ["Theft", "Burglary", "Drug Possession", "Assault", "Fraud", "DUI", "Robbery"]
REGIONS = [
    "Atlanta Metro",
    "Savannah",
    "Augusta",
    "Macon",
    "Columbus",
    "Rural North",
    "Rural South",
]
RACES = ["White", "Black", "Hispanic", "Other"]
REASON_CODES = [
    "Stable employment",
    "Family support",
    "Clinical assessment",
    "New information",
    "Recent compliance",
    "Other",
]


class _Rng:
    """The same LCG used by the prototype, so cohorts match the design mock exactly."""

    def __init__(self, seed: int = 1337) -> None:
        self.seed = seed

    def rand(self) -> float:
        self.seed = (self.seed * 9301 + 49297) % 233280
        return self.seed / 233280

    def pick(self, arr: list[Any]) -> Any:
        return arr[int(self.rand() * len(arr))]

    def rng(self, lo: float, hi: float) -> float:
        return lo + self.rand() * (hi - lo)

    def rint(self, lo: int, hi: int) -> int:
        return int(self.rng(lo, hi + 1))


def band_for(score: float) -> str:
    if score < 0.3:
        return "LOW"
    if score < 0.6:
        return "MEDIUM"
    return "HIGH"


def _build() -> dict[str, Any]:
    r = _Rng()
    cohort: list[dict[str, Any]] = []
    for _ in range(48):
        score = round(r.rand(), 2)
        oid = f"OFN-{2014 + r.rint(0, 9)}-{r.rint(100, 9999):04d}"
        cohort.append(
            {
                "id": oid,
                "score": score,
                "band": band_for(score),
                "offence": r.pick(OFFENCE_TYPES),
                "region": r.pick(REGIONS),
                "age": r.rint(19, 64),
                "race": r.pick(RACES),
                "gender": "F" if r.rand() > 0.85 else "M",
                "lastAssessed": f"2026-{r.rint(1, 3):02d}-{r.rint(1, 28):02d}",
                "priorOffences": r.rint(0, 7),
                "overridden": r.rand() < 0.08,
            }
        )
    # Pin a known primary case (matches the design).
    cohort[0] = {
        "id": "OFN-2014-0847",
        "score": 0.73,
        "band": "HIGH",
        "offence": "Burglary",
        "region": "Atlanta Metro",
        "age": 34,
        "race": "Black",
        "gender": "M",
        "lastAssessed": "2026-03-14",
        "priorOffences": 4,
        "overridden": False,
    }

    # SHAP / detailed factors use the REAL model's features (mirrors pipelines/train.py NUMERIC +
    # the one-hot categoricals), so what the case view shows matches what the model actually uses.
    shap = [
        {"feature": "Prior violent offences", "value": "4", "contribution": 0.18},
        {"feature": "Gang affiliation", "value": "Yes", "contribution": 0.12},
        {"feature": "Positive THC drug tests", "value": "0.42", "contribution": 0.09},
        {"feature": "Prior felony convictions", "value": "2", "contribution": 0.07},
        {"feature": "Prior drug offences", "value": "3", "contribution": 0.05},
        {"feature": "Prior property offences", "value": "2", "contribution": 0.04},
        {"feature": "Education level", "value": "High School Diploma", "contribution": -0.03},
        {"feature": "Supervision level", "value": "High", "contribution": -0.04},
        {"feature": "Age at release", "value": "34", "contribution": -0.06},
        {"feature": "Proportion of days employed", "value": "0.45", "contribution": -0.10},
    ]
    detailed = [
        {"name": "Prior violent offences", "val": "4", "contrib": 0.18, "avg": "1.2"},
        {"name": "Gang affiliation", "val": "Yes", "contrib": 0.12, "avg": "10%"},
        {"name": "Positive THC drug tests", "val": "0.42", "contrib": 0.09, "avg": "0.18"},
        {"name": "Prior felony convictions", "val": "2", "contrib": 0.07, "avg": "1.0"},
        {"name": "Prior drug offences", "val": "3", "contrib": 0.05, "avg": "1.4"},
        {"name": "Prior property offences", "val": "2", "contrib": 0.04, "avg": "1.6"},
        {"name": "Education level", "val": "High School Diploma", "contrib": -0.03, "avg": "—"},
        {"name": "Supervision level", "val": "High", "contrib": -0.04, "avg": "—"},
        {"name": "Age at release", "val": "34", "contrib": -0.06, "avg": "29.4"},
        {"name": "Proportion of days employed", "val": "0.45", "contrib": -0.10, "avg": "0.55"},
    ]
    # Similar cases reference REAL cohort members so clicking through opens a live case (not a 404).
    similar = [
        {
            "id": cohort[5]["id"],
            "band": cohort[5]["band"],
            "similarity": 0.91,
            "outcome": "reoffended",
            "outcomeText": "Reoffended within 14 months",
            "shared": ["Prior violent × 3", "Drug history", "Same region"],
        },
        {
            "id": cohort[12]["id"],
            "band": cohort[12]["band"],
            "similarity": 0.87,
            "outcome": "reoffended",
            "outcomeText": "Reoffended within 22 months",
            "shared": ["Prior felony × 2", "Unemployment 6+ mo", "Age band"],
        },
        {
            "id": cohort[20]["id"],
            "band": cohort[20]["band"],
            "similarity": 0.83,
            "outcome": "clean",
            "outcomeText": "No reoffence (3 years)",
            "shared": ["Stable employment", "Lower priors", "Same supervision level"],
        },
    ]
    graph = {
        "nodes": [
            {"id": "off", "label": "OFN-2014-0847", "type": "offender", "x": 220, "y": 120},
            {"id": "o1", "label": "Burglary", "type": "offence", "x": 90, "y": 50},
            {"id": "o2", "label": "Theft", "type": "offence", "x": 60, "y": 150},
            {"id": "o3", "label": "Drug Poss.", "type": "offence", "x": 90, "y": 210},
            {"id": "c1", "label": "Curfew 10pm", "type": "condition", "x": 360, "y": 60},
            {"id": "c2", "label": "Drug testing", "type": "condition", "x": 380, "y": 180},
            {"id": "a1", "label": "Atlanta Metro", "type": "area", "x": 230, "y": 230},
        ],
        "edges": [
            {"from": "off", "to": "o1", "label": "committed"},
            {"from": "off", "to": "o2", "label": "committed"},
            {"from": "off", "to": "o3", "label": "committed"},
            {"from": "off", "to": "c1", "label": "supervised"},
            {"from": "off", "to": "c2", "label": "supervised"},
            {"from": "off", "to": "a1", "label": "released to"},
        ],
    }

    fairness_current = [
        {
            "name": "SPD",
            "full": "Statistical Parity Difference",
            "value": -0.06,
            "threshold": 0.10,
            "pass": True,
            "direction": "abs",
        },
        {
            "name": "DI",
            "full": "Disparate Impact",
            "value": 0.92,
            "threshold": [0.80, 1.25],
            "pass": True,
            "direction": "range",
        },
        {
            "name": "EOD",
            "full": "Equal Opportunity Difference",
            "value": -0.08,
            "threshold": 0.10,
            "pass": True,
            "direction": "abs",
        },
        {
            "name": "PED",
            "full": "Predictive Equality Difference",
            "value": 0.11,
            "threshold": 0.10,
            "pass": False,
            "direction": "abs",
        },
    ]
    dates = ["Sep '25", "Oct '25", "Nov '25", "Dec '25", "Jan '26", "Feb '26", "Mar '26"]
    timeseries = [
        {
            "date": d,
            "SPD": round(-0.04 - i * 0.005 + (i % 2) * 0.01, 3),
            "DI": round(0.97 - i * 0.008 + (i % 3) * 0.012, 3),
            "EOD": round(-0.05 - i * 0.006 + (i % 2) * 0.012, 3),
            "PED": round(0.07 + i * 0.007 + (i % 2) * 0.008, 3),
        }
        for i, d in enumerate(dates)
    ]
    comparison = [
        {"group": "White", "unconstrained": 0.42, "debiased": 0.45},
        {"group": "Black", "unconstrained": 0.61, "debiased": 0.51},
        {"group": "Hispanic", "unconstrained": 0.55, "debiased": 0.49},
        {"group": "Other", "unconstrained": 0.48, "debiased": 0.47},
    ]

    rc = _Rng(99)
    calibration = []
    for i in range(11):
        p = i / 10
        calibration.append(
            {
                "predicted": p,
                "actual": round(max(0, min(1, p - 0.03 + (rc.rand() - 0.5) * 0.05)), 3),
            }
        )
    roc = []
    for i in range(21):
        fpr = i / 20
        roc.append(
            {"fpr": round(fpr, 3), "tpr": round(min(1, fpr**0.42), 3), "baseline": round(fpr, 3)}
        )
    ragas = [
        {"metric": "Faithfulness", "value": 0.89, "target": 0.85},
        {"metric": "Answer Relevance", "value": 0.86, "target": 0.80},
        {"metric": "Context Precision", "value": 0.82, "target": 0.80},
        {"metric": "Context Recall", "value": 0.77, "target": 0.80},
    ]
    mlflow = [
        {
            "runId": "a3f1c2b",
            "date": "2026-03-12",
            "brier": 0.182,
            "auc": 0.781,
            "spd": -0.06,
            "di": 0.92,
            "status": "production",
        },
        {
            "runId": "9b87d04",
            "date": "2026-03-05",
            "brier": 0.189,
            "auc": 0.776,
            "spd": -0.07,
            "di": 0.91,
            "status": "staging",
        },
        {
            "runId": "f12e8a1",
            "date": "2026-02-26",
            "brier": 0.193,
            "auc": 0.769,
            "spd": -0.09,
            "di": 0.88,
            "status": "archived",
        },
        {
            "runId": "5c9d3a7",
            "date": "2026-02-19",
            "brier": 0.201,
            "auc": 0.762,
            "spd": -0.11,
            "di": 0.84,
            "status": "archived",
        },
        {
            "runId": "1bf6e22",
            "date": "2026-02-12",
            "brier": 0.207,
            "auc": 0.755,
            "spd": -0.13,
            "di": 0.81,
            "status": "archived",
        },
    ]

    ra = _Rng(7)
    actions = ["prediction", "override", "feedback", "promotion"]
    users = ["m.albright", "j.okafor", "system", "r.singh", "k.lewis", "system"]
    audit = []
    for i in range(56):
        action = ra.pick(actions)
        off = cohort[ra.rint(0, len(cohort) - 1)]
        date = f"2026-03-{14 - i // 6:02d}"
        t = f"{ra.rint(7, 18):02d}:{ra.rint(0, 59):02d}:{ra.rint(0, 59):02d}"
        if action == "prediction":
            details = f"Risk {off['score']:.2f} ({off['band']})"
        elif action == "override":
            details = (
                f"{ra.pick(['LOW', 'MEDIUM', 'HIGH'])} → {off['band']}, {ra.pick(REASON_CODES)}"
            )
        elif action == "feedback":
            details = "Disposition recorded"
        else:
            details = "staging → production, brier −0.007"
        audit.append(
            {
                "id": f"a{i}",
                "ts": f"{date} {t}",
                "action": action,
                "offender": "—" if action == "promotion" else off["id"],
                "user": ra.pick(users),
                "details": details,
                "model": "xgb-cal-v1.0.0",
            }
        )

    return {
        "cohort": cohort,
        "by_id": {o["id"]: o for o in cohort},
        "shap": shap,
        "detailed": detailed,
        "similar": similar,
        "graph": graph,
        "fairness_current": fairness_current,
        "timeseries": timeseries,
        "comparison": comparison,
        "calibration": calibration,
        "roc": roc,
        "ragas": ragas,
        "mlflow": mlflow,
        "audit": audit,
    }


DATA: dict[str, Any] = _build()
