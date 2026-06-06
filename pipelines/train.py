"""Train the SENTINEL recidivism risk model.

Pipeline:
  1. Load (or synthesise) the NIJ-schema parquet from ``pipelines.data_prep``.
  2. Stratified 70/15/15 train/calibration/test split (stratified by target + Race for fairness).
  3. Preprocess (ColumnTransformer): one-hot for categoricals, passthrough for numerics. Race and
     Gender are excluded from features (fairness through unawareness) and used only for the audit.
  4. Train a single XGBoost classifier, Platt-calibrated via ``CalibratedClassifierCV`` on the
     held-out calibration split. A single tree model keeps TreeSHAP exact on the served model.
  5. Audit fairness per Race / Gender (Fairlearn ``MetricFrame``): SPD, DI, EOD, PED. The baseline
     model is expected to FAIL because proxy features leak race.
  6. Mitigate with Kamiran–Calders reweighing on Race, re-fit, and re-audit. The mitigated model is
     the production artifact; baseline numbers are retained for a before/after comparison.
  7. Evaluate on test: Brier, AUC-ROC, AUC-PR, log-loss, calibration curve, reliability bins.
  8. Compute exact SHAP global importance with ``shap.TreeExplainer`` on the XGBoost model.
  9. Persist artifacts to ``models/`` and write JSON metrics/fairness summaries the predict service serves.

Designed to run end-to-end on Google Colab Free (CPU is fine — entire run < 2 minutes).

Usage (locally):
    python -m pipelines.train

Usage (Colab):
    !git clone https://github.com/<you>/sentinel.git && cd sentinel
    !pip install -q xgboost scikit-learn pandas pyarrow shap fairlearn
    !python -m pipelines.data_prep
    !python -m pipelines.train
    # then download models/*.pkl and commit to the repo
"""

from __future__ import annotations

import json
import pickle
import sys
import warnings
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

DATA = Path("data/processed/offenders.parquet")
MODELS = Path("models")
METRICS = MODELS / "metrics.json"
FAIRNESS = MODELS / "fairness.json"

MODEL_VERSION = "xgb-cal-v1.0.0"
TARGET = "Recidivism_Within_3years"
# Race and Gender are deliberately NOT model features (fairness through unawareness). They remain in
# the dataframe only as sensitive attributes for the audit. Disparity still arises via proxies —
# that is the point, and what the mitigation step addresses.
CATEGORICAL = ["Education_Level", "Supervision_Level_First"]
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
PROTECTED = ["Race", "Gender"]


def _load() -> pd.DataFrame:
    if not DATA.exists():
        print("[train] no parquet — running data_prep first")
        from pipelines import data_prep  # noqa: PLC0415

        data_prep.main()
    df = pd.read_parquet(DATA)
    df["Gang_Affiliated"] = df["Gang_Affiliated"].astype(int)
    print(f"[train] loaded {len(df):,} rows · positive rate {df[TARGET].mean():.3f}")
    return df


def _split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    from sklearn.model_selection import train_test_split  # noqa: PLC0415

    strat = df[TARGET].astype(str) + "_" + df["Race"].astype(str)
    train, hold = train_test_split(df, test_size=0.30, random_state=42, stratify=strat)
    strat_h = hold[TARGET].astype(str) + "_" + hold["Race"].astype(str)
    calib, test = train_test_split(hold, test_size=0.50, random_state=42, stratify=strat_h)
    print(f"[train] split: train={len(train)}, calib={len(calib)}, test={len(test)}")
    return train.reset_index(drop=True), calib.reset_index(drop=True), test.reset_index(drop=True)


def _preprocessor() -> Any:
    from sklearn.compose import ColumnTransformer  # noqa: PLC0415
    from sklearn.preprocessing import OneHotEncoder  # noqa: PLC0415

    return ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
            ("num", "passthrough", NUMERIC),
        ]
    )


def _build_model() -> Any:
    """A single gradient-boosted model (XGBoost).

    A single tree model is a deliberate choice over a stacked ensemble: it is exactly explainable
    via TreeSHAP on the served model (a stacker's per-feature attributions would not decompose the
    final calibrated score), it is faster, and on this data it is within noise of a stacked
    ensemble. Fairness and explainability outrank a marginal AUC gain here.
    """
    from xgboost import XGBClassifier  # noqa: PLC0415

    return XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        n_jobs=-1,
        random_state=42,
        tree_method="hist",
        verbosity=0,
    )


def _pipeline() -> Any:
    from sklearn.pipeline import Pipeline  # noqa: PLC0415

    return Pipeline([("prep", _preprocessor()), ("model", _build_model())])


REWEIGH_GAMMA = 2.5  # strength: weights are raised to this power; >1 pushes harder toward parity


def _reweigh(y: pd.Series, s: pd.Series, gamma: float = REWEIGH_GAMMA) -> np.ndarray:
    """Kamiran–Calders reweighing for demographic parity (strength-tunable).

    Returns per-sample weights ``[P(S=s) P(Y=y) / P(S=s, Y=y)] ** gamma`` that rebalance the training
    distribution so the outcome base rate is independent of the sensitive attribute. Passed as
    ``sample_weight`` to the booster, so the served model is still a plain, exactly-explainable
    XGBoost — no sensitive attribute is needed at inference time. ``gamma`` > 1 amplifies the
    correction (the standard weights are gamma = 1); we use a stronger setting because the proxy
    features carry enough race signal that the vanilla weights under-correct selection-rate parity.
    """
    y_arr = np.asarray(y)
    s_arr = np.asarray(s)
    n = len(y_arr)
    w = np.ones(n, dtype=float)
    for sv in np.unique(s_arr):
        for yv in np.unique(y_arr):
            mask = (s_arr == sv) & (y_arr == yv)
            p_sy = mask.mean()
            if p_sy > 0:
                w[mask] = ((s_arr == sv).mean() * (y_arr == yv).mean() / p_sy) ** gamma
    return w


def _evaluate(model: Any, X: pd.DataFrame, y: pd.Series) -> dict[str, Any]:
    from sklearn.calibration import calibration_curve  # noqa: PLC0415
    from sklearn.metrics import (  # noqa: PLC0415
        average_precision_score,
        brier_score_loss,
        log_loss,
        roc_auc_score,
        roc_curve,
    )

    proba = model.predict_proba(X)[:, 1]
    frac_pos, mean_pred = calibration_curve(y, proba, n_bins=10, strategy="quantile")
    fpr, tpr, _ = roc_curve(y, proba)
    # Downsample the ROC to ~25 evenly-spaced points for a compact chart payload.
    step = max(1, len(fpr) // 25)
    roc = [
        {"fpr": float(fpr[i]), "tpr": float(tpr[i]), "baseline": float(fpr[i])}
        for i in range(0, len(fpr), step)
    ]
    if roc[-1]["fpr"] != 1.0:
        roc.append({"fpr": 1.0, "tpr": 1.0, "baseline": 1.0})
    return {
        "brier": float(brier_score_loss(y, proba)),
        "auc_roc": float(roc_auc_score(y, proba)),
        "auc_pr": float(average_precision_score(y, proba)),
        "log_loss": float(log_loss(y, proba)),
        "calibration": [
            {"mean_predicted": float(m), "fraction_positive": float(f)}
            for m, f in zip(mean_pred, frac_pos, strict=False)
        ],
        "roc": roc,
    }


HIGH_CUT = 0.5  # global probability threshold above which an offender is flagged HIGH risk
# ("more likely than not"). A higher flag rate keeps the parity ratios stable.


def _fairness_from_decision(y: pd.Series, decision: np.ndarray, X: pd.DataFrame) -> dict[str, Any]:
    """Per-group fairness for a binary HIGH-risk decision, reported with the four platform metrics.

    SPD (statistical parity difference), DI (disparate impact), EOD (equal-opportunity difference =
    TPR gap), PED (predictive-equality difference = FPR gap). SPD/EOD/PED are the signed gap of the
    most-disadvantaged group (lowest selection rate) versus the reference group (highest).
    """
    from fairlearn.metrics import (  # noqa: PLC0415
        MetricFrame,
        false_positive_rate,
        selection_rate,
        true_positive_rate,
    )
    from sklearn.metrics import accuracy_score  # noqa: PLC0415

    out: dict[str, Any] = {}
    for attr in PROTECTED:
        mf = MetricFrame(
            metrics={
                "selection_rate": selection_rate,
                "tpr": true_positive_rate,
                "fpr": false_positive_rate,
                "accuracy": accuracy_score,
            },
            y_true=y,
            y_pred=decision,
            sensitive_features=X[attr],
        )
        sr = mf.by_group["selection_rate"]
        ref, dis = sr.idxmax(), sr.idxmin()
        spd = float(sr[dis] - sr[ref])
        di = float(sr[dis] / sr[ref]) if sr[ref] > 0 else 0.0
        eod = float(mf.by_group["tpr"][dis] - mf.by_group["tpr"][ref])
        ped = float(mf.by_group["fpr"][dis] - mf.by_group["fpr"][ref])
        out[attr] = {
            "by_group": mf.by_group.to_dict(orient="index"),
            "reference_group": str(ref),
            "spd": spd,
            "disparate_impact": di,
            "eod": eod,
            "ped": ped,
            "pass_spd": abs(spd) <= 0.10,
            "pass_di": 0.80 <= di <= 1.25,
            "pass_eod": abs(eod) <= 0.10,
            "pass_ped": abs(ped) <= 0.10,
        }
    return out


def _group_high_thresholds(
    scores: np.ndarray, race: pd.Series, target_rate: float
) -> dict[str, float]:
    """Per-race HIGH-risk thresholds that equalise the flag rate at ``target_rate`` (demographic
    parity post-processing). The score itself is race-blind; only this decision cut is group-aware."""
    race_arr = np.asarray(race)
    thr: dict[str, float] = {}
    for g in np.unique(race_arr):
        s = scores[race_arr == g]
        thr[str(g)] = float(np.quantile(s, 1.0 - target_rate)) if len(s) else HIGH_CUT
    return thr


def _apply_group_decision(scores: np.ndarray, race: pd.Series, thr: dict[str, float]) -> np.ndarray:
    race_arr = np.asarray(race)
    cuts = np.array([thr.get(str(g), HIGH_CUT) for g in race_arr])
    return (scores >= cuts).astype(int)


def _shap_summary(model: Any, X: pd.DataFrame, n: int = 500) -> list[dict[str, Any]]:
    """Global SHAP importance on a sample, using the XGB base learner via TreeExplainer."""
    import shap  # noqa: PLC0415

    sample = X.sample(min(n, len(X)), random_state=42)
    prep = model.named_steps["prep"]
    Xs = prep.transform(sample)
    feature_names = prep.get_feature_names_out()
    xgb = model.named_steps["model"]
    explainer = shap.TreeExplainer(xgb)
    sv = explainer.shap_values(Xs)
    importance = np.abs(sv).mean(axis=0)
    order = np.argsort(importance)[::-1][:15]
    return [
        {"feature": str(feature_names[i]), "mean_abs_shap": float(importance[i])} for i in order
    ]


def _fit_calibrated(
    X_tr: pd.DataFrame,
    y_tr: pd.Series,
    X_ca: pd.DataFrame,
    y_ca: pd.Series,
    sample_weight: np.ndarray | None = None,
) -> tuple[Any, Any]:
    """Fit the XGBoost pipeline (optionally reweighed) and Platt-calibrate on the held-out split.

    Returns ``(raw_pipeline, calibrated_model)``. The raw pipeline is kept so the predict service can
    compute exact per-instance TreeSHAP from the single XGBoost it contains.
    """
    from sklearn.calibration import CalibratedClassifierCV  # noqa: PLC0415

    pipe = _pipeline()
    fit_kw = {} if sample_weight is None else {"model__sample_weight": sample_weight}
    pipe.fit(X_tr, y_tr, **fit_kw)
    try:
        # sklearn >= 1.6: ``cv="prefit"`` is removed; freeze the fitted pipe so the calibrator fits
        # on the held-out split without refitting the model.
        from sklearn.frozen import FrozenEstimator  # noqa: PLC0415

        calibrated = CalibratedClassifierCV(FrozenEstimator(pipe), method="sigmoid")
    except ImportError:  # sklearn < 1.6 (e.g. an older Colab image)
        calibrated = CalibratedClassifierCV(estimator=pipe, method="sigmoid", cv="prefit")
    calibrated.fit(X_ca, y_ca)
    return pipe, calibrated


def _print_fairness(tag: str, report: dict[str, Any]) -> None:
    for attr, rep in report.items():
        print(
            f"[train]   {tag} {attr}: SPD={rep['spd']:+.3f} DI={rep['disparate_impact']:.3f} "
            f"EOD={rep['eod']:+.3f} PED={rep['ped']:+.3f} "
            f"(spd ok={rep['pass_spd']}, di ok={rep['pass_di']})"
        )


def main() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    df = _load()
    train, calib, test = _split(df)

    X_tr, y_tr = train.drop(columns=[TARGET]), train[TARGET]
    X_ca, y_ca = calib.drop(columns=[TARGET]), calib[TARGET]
    X_te, y_te = test.drop(columns=[TARGET]), test[TARGET]

    # --- Baseline: no mitigation, single global HIGH-risk cut. Expected to FAIL: the proxies leak
    #     race, so a race-blind model still flags disadvantaged groups at a far higher rate. ---
    print("[train] fitting BASELINE model (no mitigation)...")
    _, base_cal = _fit_calibrated(X_tr, y_tr, X_ca, y_ca)
    base_metrics = _evaluate(base_cal, X_te, y_te)
    base_decision = (base_cal.predict_proba(X_te)[:, 1] >= HIGH_CUT).astype(int)
    base_fair = _fairness_from_decision(y_te, base_decision, X_te)
    print(
        f"[train]   baseline Brier={base_metrics['brier']:.3f} AUC-ROC={base_metrics['auc_roc']:.3f}"
    )
    _print_fairness("baseline", base_fair)

    # --- Mitigated (production): two layers — (1) Kamiran–Calders reweighing on Race during fit to
    #     reduce learned disparity, then (2) per-group HIGH-risk thresholds calibrated to equalise
    #     the flag rate (demographic-parity post-processing). The risk score stays race-blind and
    #     exactly TreeSHAP-explainable; race informs only the decision cut. ---
    print("[train] fitting MITIGATED model (reweighing + group-calibrated thresholds)...")
    weights = _reweigh(y_tr, X_tr["Race"])
    mit_pipe, mit_cal = _fit_calibrated(X_tr, y_tr, X_ca, y_ca, sample_weight=weights)
    metrics = _evaluate(mit_cal, X_te, y_te)

    # Calibrate group thresholds on the held-out calibration split, to the global HIGH-risk rate.
    score_ca = mit_cal.predict_proba(X_ca)[:, 1]
    target_rate = float((score_ca >= HIGH_CUT).mean())
    high_thresholds = _group_high_thresholds(score_ca, X_ca["Race"], target_rate)

    # Split-conformal interval half-width: the (1-alpha) quantile of absolute residuals on the
    # held-out calibration split. The band [p - q, p + q] then has ~90% marginal coverage of the
    # outcome — a real coverage guarantee, unlike the previous fixed-width heuristic band.
    conformal_level = 0.90
    residuals = np.abs(y_ca.to_numpy() - score_ca)
    conformal_q = float(np.quantile(residuals, conformal_level))
    print(f"[train]   conformal half-width q={conformal_q:.3f} (level {conformal_level})")
    score_te = mit_cal.predict_proba(X_te)[:, 1]
    mit_decision = _apply_group_decision(score_te, X_te["Race"], high_thresholds)
    fairness = _fairness_from_decision(y_te, mit_decision, X_te)
    print(
        f"[train]   mitigated Brier={metrics['brier']:.3f} AUC-ROC={metrics['auc_roc']:.3f} "
        f"target_high_rate={target_rate:.3f}"
    )
    _print_fairness("mitigated", fairness)

    # Attach the baseline numbers under each attribute for the dashboard's before/after view.
    keys = ("spd", "disparate_impact", "eod", "ped", "pass_spd", "pass_di", "pass_eod", "pass_ped")
    for attr in fairness:
        fairness[attr]["baseline"] = {k: base_fair[attr][k] for k in keys}
    fairness["policy"] = {
        "high_cut": HIGH_CUT,
        "target_high_rate": round(target_rate, 4),
        "group_high_thresholds": {g: round(t, 4) for g, t in high_thresholds.items()},
        "method": "reweighing (Kamiran-Calders) + per-group threshold (demographic-parity post-processing)",
    }

    print("[train] computing SHAP global importance (mitigated model)...")
    shap_top = _shap_summary(mit_pipe, X_tr)

    print("[train] persisting artifacts to models/...")
    with (MODELS / "model.pkl").open("wb") as f:
        pickle.dump(mit_cal, f)
    # Raw (uncalibrated) pipeline kept alongside for exact per-instance TreeSHAP at inference time.
    with (MODELS / "pipeline.pkl").open("wb") as f:
        pickle.dump(mit_pipe, f)
    with (MODELS / "schema.json").open("w") as f:
        json.dump(
            {
                "categorical": CATEGORICAL,
                "numeric": NUMERIC,
                "target": TARGET,
                "feature_order": CATEGORICAL + NUMERIC,
                "protected": PROTECTED,
                "mitigation": "kamiran-calders reweighing on Race + per-group HIGH threshold",
                "high_cut": HIGH_CUT,
                "group_high_thresholds": {g: round(t, 4) for g, t in high_thresholds.items()},
                "conformal_halfwidth": round(conformal_q, 4),
                "conformal_level": conformal_level,
            },
            f,
            indent=2,
        )
    METRICS.write_text(
        json.dumps(
            {
                "model_version": MODEL_VERSION,
                "trained_at": datetime.now(UTC).date().isoformat(),
                **metrics,
                "baseline_auc_roc": base_metrics["auc_roc"],
                "baseline_brier": base_metrics["brier"],
                "shap_top_global": shap_top,
            },
            indent=2,
        )
    )
    FAIRNESS.write_text(json.dumps(fairness, indent=2, default=str))
    print(
        f"[train] done — wrote {MODELS}/"
        "{model.pkl, pipeline.pkl, schema.json, metrics.json, fairness.json}"
    )


if __name__ == "__main__":
    sys.exit(main())
