"""Read-only inspection of the training dataset for the Dataset page.

This parquet is the SAME synthetic dataset the model, fairness audit, and graph are all built on —
the NIJ Recidivism Forecasting Challenge schema, synthesised locally because the OJP host is
unreachable from the dev environment. We expose a paginated sample plus summary distributions so a
reviewer can see exactly what the model was trained on. Nothing here is fabricated: if the parquet
is absent (e.g. the data volume is not mounted) the endpoint reports ``available=False`` and the UI
says so rather than inventing rows.

The DataFrame and the derived summary stats are loaded once and cached for the process lifetime —
the file is read-only and ~26k rows, so a single load is cheap and avoids re-reading per request.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import structlog

log = structlog.get_logger()


def _candidates() -> list[Path]:
    """Possible parquet locations: the container mount first, then the repo layout for local runs.

    The repo-relative path is computed defensively — inside the container the module lives at
    ``/app/app/dataset.py`` which has fewer parents than the source tree, so we walk up looking
    for a ``data/processed`` dir rather than indexing a fixed depth.
    """
    paths = [Path("/app/data/processed/offenders.parquet")]
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "data" / "processed" / "offenders.parquet"
        if candidate not in paths:
            paths.append(candidate)
    return paths


# Plain-English labels for the raw NIJ schema columns (shown as table headers in the UI).
COLUMN_LABELS: dict[str, str] = {
    "ID": "Reference",
    "Gender": "Gender",
    "Race": "Race",
    "Age_at_Release": "Age at release",
    "Gang_Affiliated": "Gang affiliated",
    "Education_Level": "Education level",
    "Prior_Arrest_Episodes_Violent": "Prior violent arrests",
    "Prior_Arrest_Episodes_Property": "Prior property arrests",
    "Prior_Arrest_Episodes_Drug": "Prior drug arrests",
    "Prior_Conviction_Episodes_Felony": "Prior felony convictions",
    "Supervision_Level_First": "Supervision level",
    "Percent_Days_Employed": "Proportion days employed",
    "DrugTests_THC_Positive": "Positive THC tests",
    "Residence_PUMA": "Residence PUMA",
    "Recidivism_Within_3years": "Recidivism (3yr)",
}

_TARGET = "Recidivism_Within_3years"
_MAX_LIMIT = 1000  # cap a single page so an unbounded request can't pull the whole frame

_df: pd.DataFrame | None = None
_stats: dict[str, Any] | None = None
_loaded = False


def _path() -> Path | None:
    for p in _candidates():
        if p.exists():
            return p
    return None


def _load() -> pd.DataFrame | None:
    """Lazily load and cache the training parquet; ``None`` if it isn't mounted."""
    global _df, _loaded
    if _loaded:
        return _df
    _loaded = True
    path = _path()
    if path is None:
        log.warning("dataset.parquet_missing", candidates=[str(c) for c in _candidates()])
        return None
    _df = pd.read_parquet(path)
    log.info("dataset.loaded", path=str(path), rows=len(_df))
    return _df


def _dist(series: pd.Series, top: int = 8) -> list[dict[str, Any]]:
    """Top-N value distribution as ``[{label, pct}]`` percentages (descending)."""
    counts = series.value_counts(normalize=True)
    return [{"label": str(k), "pct": round(float(v) * 100, 1)} for k, v in counts.head(top).items()]


def available() -> bool:
    return _load() is not None


def stats() -> dict[str, Any] | None:
    """Summary distributions over the full dataset (cached)."""
    global _stats
    df = _load()
    if df is None:
        return None
    if _stats is not None:
        return _stats
    target = df[_TARGET]
    _stats = {
        "rows": len(df),
        "columns": int(df.shape[1]),
        "recidivismRate": round(float(target.mean()) * 100, 1),
        "ageMean": round(float(df["Age_at_Release"].mean()), 1),
        "ageMin": int(df["Age_at_Release"].min()),
        "ageMax": int(df["Age_at_Release"].max()),
        "gangPct": round(float(df["Gang_Affiliated"].mean()) * 100, 1),
        "employedMean": round(float(df["Percent_Days_Employed"].mean()) * 100, 1),
        "byRace": _dist(df["Race"]),
        "byGender": _dist(df["Gender"]),
        "byEducation": _dist(df["Education_Level"]),
        "bySupervision": _dist(df["Supervision_Level_First"]),
    }
    return _stats


def _native(value: Any) -> Any:
    """numpy/pandas scalar -> JSON-safe python primitive."""
    item = getattr(value, "item", None)
    return item() if callable(item) else value


def page(offset: int = 0, limit: int = 25) -> dict[str, Any]:
    """A page of raw rows plus dataset metadata and summary stats.

    Args:
        offset: zero-based row offset into the dataset.
        limit: number of rows to return (clamped to ``[1, 1000]``).

    Returns:
        A dict with ``available`` False when the parquet is not mounted, otherwise the page rows,
        column labels, summary stats, and pagination metadata.
    """
    df = _load()
    if df is None:
        return {"available": False}
    total = len(df)
    offset = max(0, offset)
    limit = max(1, min(limit, _MAX_LIMIT))
    chunk = df.iloc[offset : offset + limit]
    rows: list[dict[str, Any]] = [
        {k: _native(v) for k, v in record.items()} for record in chunk.to_dict("records")
    ]
    return {
        "available": True,
        "synthetic": True,
        "source": "NIJ Recidivism Forecasting Challenge schema (synthesised locally)",
        "target": _TARGET,
        "columns": [{"key": c, "label": COLUMN_LABELS.get(c, c)} for c in df.columns],
        "stats": stats(),
        "offset": offset,
        "limit": limit,
        "total": total,
        "rows": rows,
    }
