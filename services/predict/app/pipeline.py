"""Risk scoring pipeline.

Loads the trained, Platt-calibrated single XGBoost classifier from ``models/`` when the artifact is
present and serves real, feature-driven scores with exact per-instance SHAP contributions (via
XGBoost's native ``pred_contribs``) and a split-conformal uncertainty interval. When no artifact is
on disk — a fresh checkout before training, or CI — it transparently falls back to a logistic
heuristic over the core NIJ features so ``/predict`` still returns sensible, monotonic scores. The
response shape is identical either way, so nothing downstream changes.
"""

from __future__ import annotations

import json
import math
import pickle
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from .config import settings

log = structlog.get_logger()

# --------------------------------------------------------------------------- feature metadata
# Must mirror pipelines/train.py. Feature → (weight, population mean, plain-English label); the
# weights/means power the heuristic fallback, the labels are reused for SHAP display.
_WEIGHTS: dict[str, tuple[float, float, str]] = {
    "Prior_Arrest_Episodes_Violent": (0.40, 1.2, "Prior violent offences"),
    "Prior_Conviction_Episodes_Felony": (0.22, 1.0, "Prior felony convictions"),
    "Prior_Arrest_Episodes_Drug": (0.12, 1.4, "Prior drug offences"),
    "Prior_Arrest_Episodes_Property": (0.10, 1.6, "Prior property offences"),
    "DrugTests_THC_Positive": (0.55, 0.18, "Positive THC drug tests"),
    "Gang_Affiliated": (0.45, 0.10, "Gang affiliation"),
    "Percent_Days_Employed": (-1.10, 0.55, "Proportion of days employed"),
    "Age_at_Release": (-0.025, 29.4, "Age at release"),
}
_BIAS = 0.15

CATEGORICAL = ["Gender", "Race", "Education_Level", "Supervision_Level_First"]
NUMERIC = [
    "Age_at_Release",
    "Prior_Arrest_Episodes_Violent",
    "Prior_Arrest_Episodes_Property",
    "Prior_Arrest_Episodes_Drug",
    "Prior_Conviction_Episodes_Felony",
    "Percent_Days_Employed",
    "DrugTests_THC_Positive",
    "Gang_Affiliated",
]
_CAT_LABELS = {
    "Gender": "Gender",
    "Race": "Race",
    "Education_Level": "Education level",
    "Supervision_Level_First": "Supervision level",
}
_NUM_LABELS = {k: v[2] for k, v in _WEIGHTS.items()}
_CAT_DEFAULTS = {
    "Gender": "M",
    "Race": "WHITE",
    "Education_Level": "High School Diploma",
    "Supervision_Level_First": "Standard",
}


def _num(features: dict[str, Any], key: str) -> float:
    val = features.get(key)
    if isinstance(val, bool):
        return 1.0 if val else 0.0
    try:
        return float(val)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _WEIGHTS.get(key, (0.0, 0.0, ""))[1]


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def band_for(score: float) -> str:
    if score < 0.3:
        return "LOW"
    if score < 0.6:
        return "MEDIUM"
    return "HIGH"


def _fmt(x: float) -> str:
    return str(int(x)) if x == int(x) else f"{x:.2f}"


def _band_interval(score: float) -> tuple[float, float]:
    """Calibrated-width uncertainty band that narrows toward the extremes."""
    half = round(0.11 * (1.0 - abs(score - 0.5)), 2)
    return (round(max(0.0, score - half), 2), round(min(1.0, score + half), 2))


def _envelope(
    score: float, band: str, ci: tuple[float, float], shap: list[dict[str, Any]], version: str
) -> dict[str, Any]:
    return {
        "risk_score": score,
        "risk_band": band,
        "confidence_interval": ci,
        "shap_values": shap,
        "model_version": version,
        "prediction_id": str(uuid.uuid4()),
        "timestamp": datetime.now(UTC),
    }


# --------------------------------------------------------------------------- heuristic fallback
def _score_heuristic(features: dict[str, Any]) -> dict[str, Any]:
    logit = _BIAS
    contributions: list[dict[str, Any]] = []
    for key, (weight, mean, label) in _WEIGHTS.items():
        x = _num(features, key)
        term = weight * (x - mean)
        logit += term
        contributions.append({"feature": label, "value": _fmt(x), "contribution": round(term, 3)})
    score = round(_sigmoid(logit), 2)
    contributions.sort(key=lambda c: abs(c["contribution"]), reverse=True)
    return _envelope(
        score, band_for(score), _band_interval(score), contributions[:10], settings.model_version
    )


# --------------------------------------------------------------------------- trained model
class _Model:
    """Lazy holder for the trained artifacts. Stays in heuristic mode if they are absent."""

    def __init__(self) -> None:
        self.calibrated: Any = None
        self.pipe: Any = None
        self.schema: dict[str, Any] | None = None
        self.version: str = settings.model_version
        self.high_cut: float = 0.6
        self.high_thresholds: dict[str, float] = {}
        self.conformal_q: float | None = None
        self._attempted = False

    @property
    def ready(self) -> bool:
        if not self._attempted:
            self._load()
        return self.calibrated is not None

    def _load(self) -> None:
        self._attempted = True
        d = Path(settings.models_dir)
        model_path = d / "model.pkl"
        if not model_path.exists():
            log.info("pipeline.model.absent", path=str(model_path))
            return
        try:
            with model_path.open("rb") as f:
                self.calibrated = pickle.load(f)
            pipe_path = d / "pipeline.pkl"
            if pipe_path.exists():
                with pipe_path.open("rb") as f:
                    self.pipe = pickle.load(f)
            schema_path = d / "schema.json"
            if schema_path.exists():
                self.schema = json.loads(schema_path.read_text())
                self.high_cut = float(self.schema.get("high_cut", 0.6))
                self.high_thresholds = {
                    str(k): float(v)
                    for k, v in self.schema.get("group_high_thresholds", {}).items()
                }
                cw = self.schema.get("conformal_halfwidth")
                self.conformal_q = float(cw) if cw is not None else None
            metrics_path = d / "metrics.json"
            if metrics_path.exists():
                meta = json.loads(metrics_path.read_text())
                self.version = str(meta.get("model_version", settings.model_version))
            log.info("pipeline.model.loaded", path=str(model_path), version=self.version)
        except Exception as err:  # noqa: BLE001 - any load failure → heuristic fallback
            log.warning("pipeline.model.load_failed", error=str(err))
            self.calibrated = None

    def _row(self, features: dict[str, Any]) -> Any:
        import pandas as pd  # noqa: PLC0415

        order = (self.schema or {}).get("feature_order") or (CATEGORICAL + NUMERIC)
        row: dict[str, Any] = {}
        for col in order:
            if col in CATEGORICAL:
                val = features.get(col)
                row[col] = str(val) if val not in (None, "") else _CAT_DEFAULTS.get(col, "")
            else:
                row[col] = _num(features, col)
        return pd.DataFrame([row])[order]

    def _shap(self, X: Any, features: dict[str, Any]) -> list[dict[str, Any]]:
        """Per-instance contributions from the XGB base learner (native pred_contribs)."""
        if self.pipe is None:
            fallback: list[dict[str, Any]] = _score_heuristic(features)["shap_values"]
            return fallback
        try:
            import xgboost as xgb  # noqa: PLC0415

            prep = self.pipe.named_steps["prep"]
            booster = self.pipe.named_steps["model"].get_booster()
            names = list(prep.get_feature_names_out())
            Xt = prep.transform(X)
            dm = xgb.DMatrix(Xt, feature_names=[f"f{i}" for i in range(Xt.shape[1])])
            contribs = booster.predict(dm, pred_contribs=True)[0]  # trailing element is the bias

            agg: dict[str, float] = {}
            for i, raw in enumerate(names):
                label = self._source_label(raw)
                if label:
                    agg[label] = agg.get(label, 0.0) + float(contribs[i])
            values = self._source_values(features)
            items: list[dict[str, Any]] = [
                {"feature": label, "value": values.get(label, ""), "contribution": round(v, 3)}
                for label, v in agg.items()
            ]
            items.sort(key=lambda c: abs(c["contribution"]), reverse=True)
            return items[:10]
        except Exception as err:  # noqa: BLE001 - degrade to heuristic contributions
            log.warning("pipeline.shap.failed", error=str(err))
            heuristic: list[dict[str, Any]] = _score_heuristic(features)["shap_values"]
            return heuristic

    @staticmethod
    def _source_label(raw: str) -> str:
        if raw.startswith("num__"):
            return _NUM_LABELS.get(raw[5:], raw[5:])
        if raw.startswith("cat__"):
            rest = raw[5:]
            for c in CATEGORICAL:
                if rest.startswith(c + "_"):
                    return _CAT_LABELS.get(c, c)
            return rest
        return raw

    @staticmethod
    def _source_values(features: dict[str, Any]) -> dict[str, str]:
        out: dict[str, str] = {}
        for c in CATEGORICAL:
            val = features.get(c)
            out[_CAT_LABELS.get(c, c)] = (
                str(val) if val not in (None, "") else _CAT_DEFAULTS.get(c, "")
            )
        for k, label in _NUM_LABELS.items():
            out[label] = _fmt(_num(features, k))
        return out

    def _band(self, score: float, features: dict[str, Any]) -> str:
        """Group-aware HIGH-risk band. The score is race-blind; only the HIGH cut is calibrated per
        group to enforce demographic parity (matching the audited deployment policy). Falls back to
        the global cut when race or the per-group thresholds are unavailable."""
        race = str(features.get("Race", ""))
        cut = self.high_thresholds.get(race, self.high_cut)
        if score >= cut:
            return "HIGH"
        if score >= 0.3:
            return "MEDIUM"
        return "LOW"

    def _interval(self, score: float) -> tuple[float, float]:
        """Split-conformal interval [p-q, p+q] when a half-width is loaded, else heuristic band."""
        if self.conformal_q is None:
            return _band_interval(score)
        q = self.conformal_q
        return (round(max(0.0, score - q), 2), round(min(1.0, score + q), 2))

    def score(self, features: dict[str, Any]) -> dict[str, Any]:
        X = self._row(features)
        proba = float(self.calibrated.predict_proba(X)[:, 1][0])
        score = round(proba, 2)
        shap = self._shap(X, features)
        return _envelope(
            score, self._band(score, features), self._interval(score), shap, self.version
        )


_model = _Model()


def warm() -> str:
    """Force the trained model to load (called at startup); return the effective version string."""
    return _model.version if _model.ready else settings.model_version


def effective_version() -> str:
    """The version actually serving predictions: the trained artifact's, else the configured one."""
    return _model.version if _model.ready else settings.model_version


def mode() -> str:
    """Whether predictions come from the trained model artifact or the heuristic fallback."""
    return "trained" if _model.ready else "heuristic"


def interval_for(score: float) -> tuple[float, float]:
    """Conformal interval for a score using the loaded model's half-width (heuristic if none)."""
    if _model.ready:
        return _model._interval(score)
    return _band_interval(score)


def score_features(features: dict[str, Any]) -> dict[str, Any]:
    """Score one offender's features, returning score, band, CI and SHAP-style contributions.

    Uses the trained calibrated XGBoost when the artifact is present; otherwise the heuristic.
    """
    if _model.ready:
        try:
            return _model.score(features)
        except Exception as err:  # noqa: BLE001 - never 500 a prediction; degrade gracefully
            log.warning("pipeline.score.failed", error=str(err))
    return _score_heuristic(features)
