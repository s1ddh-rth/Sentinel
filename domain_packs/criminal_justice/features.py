"""Domain-specific derived features for the criminal-justice pack.

These transform raw NIJ columns into the engineered features the model consumes. Kept pure and
dependency-light (pandas only) so they run inside training, the predict service, and tests alike.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

NUMERIC_FEATURES: list[str] = [
    "Age_at_Release",
    "Prior_Arrest_Episodes_Violent",
    "Prior_Arrest_Episodes_Property",
    "Prior_Arrest_Episodes_Drug",
    "Prior_Conviction_Episodes_Felony",
    "Percent_Days_Employed",
    "DrugTests_THC_Positive",
]


def derive_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add engineered columns to a frame of raw NIJ rows.

    Returns a new frame; does not mutate the input.
    """
    out = df.copy()

    # Total prior arrest episodes across categories.
    prior_cols = [
        "Prior_Arrest_Episodes_Violent",
        "Prior_Arrest_Episodes_Property",
        "Prior_Arrest_Episodes_Drug",
    ]
    present = [c for c in prior_cols if c in out.columns]
    out["prior_total"] = out[present].sum(axis=1) if present else 0

    # Share of priors that are violent — a strong, interpretable risk signal.
    if "Prior_Arrest_Episodes_Violent" in out.columns:
        out["violent_ratio"] = (
            out["Prior_Arrest_Episodes_Violent"] / out["prior_total"].replace(0, 1)
        ).clip(0, 1)

    # Unemployment proxy (1 - employed share).
    if "Percent_Days_Employed" in out.columns:
        out["unemployment_share"] = (1.0 - out["Percent_Days_Employed"].fillna(0.0)).clip(0, 1)

    # Young-at-release flag — recidivism risk is elevated for younger releasees.
    if "Age_at_Release" in out.columns:
        out["young_at_release"] = (out["Age_at_Release"] < 25).astype(int)

    return out


def features_to_vector(features: dict[str, Any]) -> dict[str, float]:
    """Project a single offender's feature dict onto the numeric vector used for scoring.

    Missing values default to neutral. Used by the predict service for ad-hoc inference.
    """
    row = pd.DataFrame([features])
    derived = derive_features(row).iloc[0]
    keys = [
        *NUMERIC_FEATURES,
        "prior_total",
        "violent_ratio",
        "unemployment_share",
        "young_at_release",
    ]
    vec: dict[str, float] = {}
    for k in keys:
        val = derived.get(k)
        try:
            vec[k] = float(val) if val is not None and not pd.isna(val) else 0.0
        except (TypeError, ValueError):
            vec[k] = 0.0
    return vec
