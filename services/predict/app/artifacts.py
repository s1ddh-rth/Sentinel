"""Read trained-model summaries (``metrics.json`` / ``fairness.json``) for the dashboard APIs.

When a model has been trained, ``/models/performance`` and ``/fairness/metrics`` surface these real
numbers; when the directory is empty the routes fall back to ``demo_data`` so the dashboard still
renders. Returns ``None`` whenever the artifact is absent or unreadable.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog

from .config import settings

log = structlog.get_logger()


def _read(name: str) -> dict[str, Any] | None:
    path = Path(settings.models_dir) / name
    if not path.exists():
        return None
    try:
        data: dict[str, Any] = json.loads(path.read_text())
        return data
    except (OSError, json.JSONDecodeError) as err:
        log.warning("artifacts.read_failed", file=name, error=str(err))
        return None


def model_performance() -> dict[str, Any] | None:
    """Real Brier / AUC / calibration from ``metrics.json``, shaped for the Models page."""
    m = _read("metrics.json")
    if not m:
        return None
    calibration = [
        {"predicted": round(c["mean_predicted"], 3), "actual": round(c["fraction_positive"], 3)}
        for c in m.get("calibration", [])
    ]
    return {
        "brier": round(m["brier"], 3),
        "auc": round(m["auc_roc"], 3),
        "aucpr": round(m["auc_pr"], 3),
        "calibration": calibration,
        "roc": m.get("roc", []),
    }


def model_runs() -> list[dict[str, Any]] | None:
    """The production training run as a single real row for the Models page (no fake history)."""
    m = _read("metrics.json")
    f = _read("fairness.json")
    if not m:
        return None
    race = (f or {}).get("Race", {})
    return [
        {
            "runId": str(m.get("model_version", "model")),
            "date": str(m.get("trained_at", "")),
            "brier": round(m["brier"], 3),
            "auc": round(m["auc_roc"], 3),
            "spd": round(race.get("spd", 0.0), 3),
            "di": round(race.get("disparate_impact", 0.0), 3),
            "status": "production",
        }
    ]


def fairness_attributes() -> list[str]:
    """The protected attributes available in the fairness report (e.g. Race, Gender)."""
    f = _read("fairness.json")
    if not f:
        return []
    return [k for k, v in f.items() if isinstance(v, dict) and "spd" in v]


def fairness_current(attr: str = "Race") -> list[dict[str, Any]] | None:
    """Real per-group fairness metrics from ``fairness.json`` for one protected attribute.

    Each card carries the mitigated value plus the unmitigated ``baseline``, so the dashboard can
    show the before/after effect of the debiasing step.
    """
    f = _read("fairness.json")
    if not f:
        return None
    rep = f.get(attr) or f.get("Race")
    rep = rep or next((v for k, v in f.items() if isinstance(v, dict) and "spd" in v), None)
    if not rep:
        return None
    base = rep.get("baseline", {})
    cards = [
        ("SPD", "Statistical Parity Difference", "spd", "pass_spd", 0.10, "abs"),
        ("DI", "Disparate Impact", "disparate_impact", "pass_di", [0.80, 1.25], "range"),
        ("EOD", "Equal Opportunity Difference", "eod", "pass_eod", 0.10, "abs"),
        ("PED", "Predictive Equality Difference", "ped", "pass_ped", 0.10, "abs"),
    ]
    return [
        {
            "name": name,
            "full": full,
            "value": round(rep[key], 3),
            "baseline": round(base[key], 3) if key in base else None,
            "threshold": thr,
            "pass": bool(rep[passkey]),
            "direction": direction,
        }
        for name, full, key, passkey, thr, direction in cards
    ]
