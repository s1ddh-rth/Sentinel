"""Download and prepare the NIJ Recidivism Forecasting Challenge dataset.

Tries the OJP Socrata export first; if the host is unreachable (it has moved hosts before) or the
download fails, it synthesises a realistic dataset matching the NIJ schema so the rest of the
pipeline can run end-to-end offline. Output: ``data/processed/offenders.parquet``.

Run:  python -m pipelines.data_prep
"""

from __future__ import annotations

import io
import sys
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import pandas as pd

RAW = Path("data/raw/nij_recidivism.csv")
OUT = Path("data/processed/offenders.parquet")
# Primary then fallback hosts (OJP migrated data.ojp.usdoj.gov → data.ojp.gov at points).
SOURCES = [
    "https://data.ojp.usdoj.gov/api/views/ynf5-u8nk/rows.csv?accessType=DOWNLOAD",
    "https://data.ojp.gov/api/views/ynf5-u8nk/rows.csv?accessType=DOWNLOAD",
]

RACES = ["WHITE", "BLACK", "HISPANIC", "OTHER"]
EDU = ["Less than HS diploma", "High School Diploma", "At least some college"]
SUP = ["Standard", "High", "Specialized"]

# Structural-disadvantage factor per race group, in [0, 1]. This does NOT enter the recidivism
# target directly — instead it shifts the distributions of *proxy* features (employment, prior
# arrests, neighbourhood) the way real structural inequity does. A model trained on those proxies
# then reproduces demographic disparity even though race is never a feature: the canonical
# "fairness through unawareness is not enough" failure mode. The values are illustrative.
DISADVANTAGE = {"WHITE": 0.0, "OTHER": 0.09, "HISPANIC": 0.26, "BLACK": 0.40}
# Residential segregation: each group concentrates in a different PUMA range (geographic proxy).
PUMA_BANDS = {
    "WHITE": (1301, 1320),
    "OTHER": (1361, 1399),
    "HISPANIC": (1325, 1338),
    "BLACK": (1340, 1360),
}


def _download() -> pd.DataFrame | None:
    if RAW.exists() and RAW.stat().st_size > 10_000:
        print(f"[data_prep] using cached {RAW}")
        return pd.read_csv(RAW)
    for url in SOURCES:
        try:
            print(f"[data_prep] downloading {url}")
            with urlopen(url, timeout=120) as resp:
                raw = resp.read()
            RAW.parent.mkdir(parents=True, exist_ok=True)
            RAW.write_bytes(raw)
            return pd.read_csv(io.BytesIO(raw))
        except Exception as err:  # noqa: BLE001 - any network/parse failure → fall back
            print(f"[data_prep] source failed: {err}")
    return None


def _beta_with_mean(rng: np.random.Generator, mean: np.ndarray, conc: float = 6.0) -> np.ndarray:
    """Draw Beta samples whose per-element mean is ``mean`` (concentration ``conc``)."""
    mean = np.clip(mean, 0.02, 0.98)
    return rng.beta(mean * conc, (1.0 - mean) * conc)


def _synthesize(n: int = 25_835, seed: int = 42) -> pd.DataFrame:
    """Generate a NIJ-schema dataset with proxy-mediated demographic disparity.

    Race is sampled independently and never enters the recidivism target. Disadvantage instead
    shifts the *proxy* features (employment, prior-arrest counts, gang affiliation, drug tests,
    neighbourhood), so the target — a function of those proxies only — ends up correlated with race
    through them. This is deliberate: it gives the fairness audit a real disparity to detect and the
    mitigation step a real job to do, rather than a result that is green by construction.
    """
    rng = np.random.default_rng(seed)
    race = rng.choice(RACES, n, p=[0.42, 0.45, 0.08, 0.05])
    disadv = np.array([DISADVANTAGE[r] for r in race])

    age = rng.integers(18, 65, n)
    # Prior-arrest counts rise with disadvantage (over-policing / surveillance proxy).
    prior_violent = rng.poisson(1.0 + 0.45 * disadv)
    prior_property = rng.poisson(1.4 + 0.6 * disadv)
    prior_drug = rng.poisson(1.2 + 0.55 * disadv)
    prior_felony = rng.poisson(0.8 + 0.5 * disadv)
    # Employment falls with disadvantage; THC-positive rate and gang affiliation rise.
    pct_employed = _beta_with_mean(rng, 0.60 - 0.20 * disadv)
    thc_pos = _beta_with_mean(rng, 0.15 + 0.09 * disadv, conc=5.0)
    gang = rng.binomial(1, np.clip(0.05 + 0.09 * disadv, 0, 1))
    # Residential segregation: PUMA band depends on race.
    puma = np.array([rng.integers(*PUMA_BANDS[r]) for r in race])

    df = pd.DataFrame(
        {
            "ID": [f"OFN-{2014 + (i % 3)}-{i:05d}" for i in range(n)],
            "Gender": rng.choice(["M", "F"], n, p=[0.86, 0.14]),
            "Race": race,
            "Age_at_Release": age,
            "Gang_Affiliated": gang.astype(bool),
            "Education_Level": rng.choice(EDU, n),
            "Prior_Arrest_Episodes_Violent": prior_violent,
            "Prior_Arrest_Episodes_Property": prior_property,
            "Prior_Arrest_Episodes_Drug": prior_drug,
            "Prior_Conviction_Episodes_Felony": prior_felony,
            "Supervision_Level_First": rng.choice(SUP, n),
            "Percent_Days_Employed": pct_employed.round(3),
            "DrugTests_THC_Positive": thc_pos.round(3),
            "Residence_PUMA": puma.astype(str),
        }
    )
    # Target depends ONLY on proxy features — never on race or gender directly.
    logit = (
        0.10
        + 0.40 * (prior_violent - 1.2)
        + 0.18 * (prior_felony - 1.0)
        + 0.10 * (prior_property - 1.6)
        + 0.10 * (prior_drug - 1.4)
        + 0.55 * (thc_pos - 0.18)
        + 0.45 * (gang - 0.1)
        - 1.20 * (pct_employed - 0.55)
        - 0.025 * (age - 29.4)
    )
    p = 1 / (1 + np.exp(-logit))
    df["Recidivism_Within_3years"] = (rng.random(n) < p).astype(int)
    return df


def main() -> None:
    df = _download()
    if df is None:
        print("[data_prep] download unavailable — synthesising NIJ-schema dataset")
        df = _synthesize()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT, index=False)
    print(f"[data_prep] wrote {OUT} — {len(df):,} rows, {df.shape[1]} columns")


if __name__ == "__main__":
    sys.exit(main())
