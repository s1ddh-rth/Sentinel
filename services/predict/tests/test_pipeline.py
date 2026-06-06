"""Unit tests for the scoring pipeline and synthetic data — no infrastructure required."""

from __future__ import annotations

from app import demo_data, pipeline


def test_score_in_unit_interval_and_banded() -> None:
    result = pipeline.score_features({"Prior_Arrest_Episodes_Violent": 4, "Age_at_Release": 34})
    assert 0.0 <= result["risk_score"] <= 1.0
    assert result["risk_band"] in {"LOW", "MEDIUM", "HIGH"}
    lo, hi = result["confidence_interval"]
    assert 0.0 <= lo <= result["risk_score"] <= hi <= 1.0


def test_more_priors_increase_risk() -> None:
    low = pipeline.score_features(
        {"Prior_Arrest_Episodes_Violent": 0, "Percent_Days_Employed": 0.9}
    )
    high = pipeline.score_features(
        {"Prior_Arrest_Episodes_Violent": 8, "Percent_Days_Employed": 0.1}
    )
    assert high["risk_score"] > low["risk_score"]


def test_shap_sorted_by_absolute_contribution() -> None:
    shap = pipeline.score_features({"Prior_Arrest_Episodes_Violent": 5})["shap_values"]
    mags = [abs(s["contribution"]) for s in shap]
    assert mags == sorted(mags, reverse=True)


def test_band_thresholds() -> None:
    assert pipeline.band_for(0.1) == "LOW"
    assert pipeline.band_for(0.45) == "MEDIUM"
    assert pipeline.band_for(0.8) == "HIGH"


def test_demo_data_deterministic_and_shaped() -> None:
    data = demo_data.DATA
    assert data["cohort"][0]["id"] == "OFN-2014-0847"
    assert len(data["cohort"]) == 48
    assert len(data["timeseries"]) == 7
    assert {m["name"] for m in data["fairness_current"]} == {"SPD", "DI", "EOD", "PED"}
    assert all("contribution" in s for s in data["shap"])
