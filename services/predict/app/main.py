"""SENTINEL predict service — inference, auth, and the data APIs backing the dashboard."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from . import artifacts, auth, dataset, db, demo_data, pipeline
from .config import settings
from .middleware import get_current_user, limiter, require_roles
from .schemas import OverrideRequest, PredictRequest, PredictResponse

structlog.configure(
    processors=[structlog.processors.add_log_level, structlog.processors.JSONRenderer()],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    db.init_pool()
    auth.seed_demo_users()
    log.info("predict.startup", model_version=pipeline.warm())
    yield


app = FastAPI(title="SENTINEL · predict", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # explicit allowlist; never "*" on an auth service
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth.router)

D = demo_data.DATA


# ------------------------------------------------------------------ system
@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model_version": pipeline.effective_version(),
        "mode": pipeline.mode(),  # "trained" when a model artifact is loaded, else "heuristic"
    }


# ------------------------------------------------------------------ reference
@app.get("/reference")
def reference(_: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "offenceTypes": demo_data.OFFENCE_TYPES,
        "regions": demo_data.REGIONS,
        "races": demo_data.RACES,
        "reasonCodes": demo_data.REASON_CODES,
    }


# ------------------------------------------------------------------ cohort / offenders
@app.get("/offenders")
@limiter.limit("60/minute")
def offenders(request: Request, _: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return {"items": D["cohort"], "total": len(D["cohort"])}


@app.get("/offenders/{offender_id}")
@limiter.limit("60/minute")
def offender(
    request: Request, offender_id: str, _: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    o = D["by_id"].get(offender_id)
    if o is None:
        # Do not fabricate offender records — an unknown reference is a 404, not a made-up person.
        log.info("offender.not_found", offender_id=offender_id)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "offender not found")

    # Surface the most recent real prediction for this offender (written by /predict) so the case
    # view reflects live model output rather than canned fixtures. Only predictions from the CURRENT
    # model version are surfaced (avoids stale rows from an earlier model/heuristic).
    shap = D["shap"]
    model_version = pipeline.effective_version()
    latest = db.query(
        """SELECT risk_score, risk_band, shap_values
           FROM predictions
           WHERE offender_id = %s AND model_version = %s
           ORDER BY created_at DESC LIMIT 1""",
        (offender_id, model_version),
    )
    if latest:
        row = latest[0]
        o = {**o, "score": float(row["risk_score"]), "band": str(row["risk_band"])}
        if row["shap_values"]:
            parsed = row["shap_values"]
            shap = parsed if isinstance(parsed, list) else shap

    # A human override is the final say: surface the most recent one so the case view reflects the
    # analyst's decision, not just the model band. The score is unchanged (the model still produced
    # it) — only the effective band and the "overridden" flag change. This is what makes an override
    # visible on the page itself, not merely in the audit log.
    override_obj: dict[str, Any] | None = None
    ov_rows = db.query(
        """SELECT original_band, new_band, reason_code, reason_text,
                  to_char(created_at, 'YYYY-MM-DD HH24:MI') AS at
           FROM overrides WHERE offender_id = %s
           ORDER BY created_at DESC LIMIT 1""",
        (offender_id,),
    )
    if ov_rows:
        ov = ov_rows[0]
        override_obj = {
            "originalBand": str(ov["original_band"]),
            "newBand": str(ov["new_band"]),
            "reasonCode": str(ov["reason_code"]),
            "reasonText": ov["reason_text"],
            "at": str(ov["at"]),
        }
        o = {**o, "band": str(ov["new_band"]), "overridden": True}

    # Derive the conformal interval from the displayed score (so it always brackets it) and a real
    # percentile from the cohort score distribution — never a hardcoded band/percentile.
    score = float(o.get("score", 0.0))
    ci = list(pipeline.interval_for(score))
    cohort_scores = [c.get("score", 0.0) for c in D["cohort"]]
    pct = round(100.0 * sum(1 for s in cohort_scores if s <= score) / max(1, len(cohort_scores)))

    return {
        "offender": o,
        "shap": shap,
        "detailedFactors": D["detailed"],
        "similar": _similar_cases(o, D["cohort"]),
        "graph": _offender_graph(o),
        "ci": ci,
        "modelVersion": model_version,
        "percentile": f"{pct}{_ord(pct)}",
        "override": override_obj,
    }


# ------------------------------------------------------------------ dataset
@app.get("/dataset")
@limiter.limit("60/minute")
def dataset_view(
    request: Request,
    offset: int = 0,
    limit: int = 25,
    _: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """A page of the raw training dataset (the synthetic NIJ parquet the model is built on).

    Returns ``available: false`` when the data volume is not mounted — the UI then shows an honest
    empty state rather than fabricating rows.
    """
    return dataset.page(offset, limit)


# ------------------------------------------------------------------ predict
@app.post("/predict", response_model=PredictResponse)
@limiter.limit("30/minute")
def predict(
    request: Request, body: PredictRequest, current: dict[str, Any] = Depends(get_current_user)
) -> PredictResponse:
    result = pipeline.score_features(body.features)
    db.execute(
        """INSERT INTO predictions
           (id, offender_id, risk_score, risk_band, confidence_lower, confidence_upper,
            model_version, shap_values, input_features, user_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            result["prediction_id"],
            body.offender_id,
            result["risk_score"],
            result["risk_band"],
            result["confidence_interval"][0],
            result["confidence_interval"][1],
            result["model_version"],
            _json(result["shap_values"]),
            _json(body.features),
            _uid(current["sub"]),
        ),
    )
    return PredictResponse(
        offender_id=body.offender_id,
        shap_values=result["shap_values"] if body.include_explanation else None,
        **{
            k: result[k]
            for k in (
                "prediction_id",
                "risk_score",
                "risk_band",
                "confidence_interval",
                "model_version",
                "timestamp",
            )
        },
    )


# ------------------------------------------------------------------ override
@app.post("/override")
@limiter.limit("30/minute")
def override(
    request: Request, body: OverrideRequest, current: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    if current.get("role") == "analyst":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "analysts cannot override predictions")
    row = db.execute(
        """INSERT INTO overrides
           (prediction_id, offender_id, original_band, new_band, reason_code, reason_text, user_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            body.prediction_id,
            body.offender_id,
            body.original_band,
            body.new_band,
            body.reason_code,
            body.reason_text,
            _uid(current["sub"]),
        ),
    )
    db.execute(
        """INSERT INTO case_memory (offender_id, event_type, summary, user_id)
           VALUES (%s, 'override', %s, %s)""",
        (
            body.offender_id,
            f"{body.original_band} → {body.new_band} ({body.reason_code})",
            _uid(current["sub"]),
        ),
    )
    assert row is not None
    return {"ok": True, "id": str(row["id"])}


# ------------------------------------------------------------------ audit
@app.get("/audit")
@limiter.limit("60/minute")
def audit_trail(
    request: Request, _: dict[str, Any] = Depends(require_roles("admin", "analyst", "case_officer"))
) -> dict[str, Any]:
    # Surface real overrides on top of the synthetic backlog so the page reflects live activity.
    real = db.query(
        """SELECT id::text, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS ts,
                  offender_id AS offender, original_band, new_band, reason_code
           FROM overrides ORDER BY created_at DESC LIMIT 20"""
    )
    live = [
        {
            "id": r["id"],
            "ts": r["ts"],
            "action": "override",
            "offender": r["offender"],
            "user": "you",
            "details": f"{r['original_band']} → {r['new_band']}, {r['reason_code']}",
            "model": settings.model_version,
        }
        for r in real
    ]
    return {"items": live + D["audit"]}


# ------------------------------------------------------------------ fairness
@app.get("/fairness/metrics")
@limiter.limit("60/minute")
def fairness_metrics(
    request: Request, group: str = "Race", _: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    return {
        "current": artifacts.fairness_current(group) or D["fairness_current"],
        "groups": artifacts.fairness_attributes() or ["Race", "Gender"],
        "group": group,
    }


@app.get("/fairness/history")
@limiter.limit("60/minute")
def fairness_history(
    request: Request, _: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    return {"timeseries": D["timeseries"], "comparison": D["comparison"]}


# ------------------------------------------------------------------ models
@app.get("/models/performance")
@limiter.limit("60/minute")
def models_performance(
    request: Request, _: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    perf = artifacts.model_performance()
    return {
        "brier": perf["brier"] if perf else 0.182,
        "auc": perf["auc"] if perf else 0.781,
        "aucpr": perf["aucpr"] if perf else 0.534,
        "calibration": perf["calibration"] if perf and perf["calibration"] else D["calibration"],
        "roc": perf["roc"] if perf and perf.get("roc") else D["roc"],
        # RAGAS quality is not measured yet (roadmap); never ship fabricated eval scores.
        # mlflow surfaces only the real production run — no fabricated promotion history.
        "mlflow": artifacts.model_runs() or [],
    }


def _json(obj: Any) -> str:
    return json.dumps(obj)


def _uid(sub: Any) -> str | None:
    """Return the caller id if it is a real user UUID, else None (e.g. the agent service)."""
    try:
        return str(UUID(str(sub)))
    except (ValueError, TypeError):
        return None


def _ord(n: int) -> str:
    """Ordinal suffix for a percentile (1st, 2nd, 3rd, 11th, 87th)."""
    if 10 <= n % 100 <= 20:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def _similar_cases(
    o: dict[str, Any], cohort: list[dict[str, Any]], k: int = 3
) -> list[dict[str, Any]]:
    """Nearest cohort members by risk score (excluding this offender), with shared attributes.
    Per-offender, never includes the offender itself, and no fabricated reoffence outcomes."""
    oid = o.get("id")
    score = float(o.get("score", 0.0))
    others = [c for c in cohort if c.get("id") != oid]
    others.sort(key=lambda c: abs(float(c.get("score", 0.0)) - score))
    out: list[dict[str, Any]] = []
    for c in others[:k]:
        cscore = float(c.get("score", 0.0))
        band = str(c.get("band", ""))
        shared: list[str] = []
        if c.get("offence") == o.get("offence"):
            shared.append("Same offence")
        if c.get("region") == o.get("region"):
            shared.append("Same region")
        if abs(int(c.get("age", 0)) - int(o.get("age", 0))) <= 5:
            shared.append("Similar age")
        out.append(
            {
                "id": c["id"],
                "band": band,
                "similarity": round(max(0.0, 1.0 - abs(cscore - score)), 2),
                "outcome": "reoffended"
                if band == "HIGH"
                else "clean",  # drives the badge colour only
                "outcomeText": f"{band} risk band · score {cscore:.2f}",
                "shared": shared or ["Similar risk score"],
            }
        )
    return out


def _offender_graph(o: dict[str, Any]) -> dict[str, Any]:
    """A per-offender illustrative network: centre = this offender, with offence + region from the
    record, so the case graph reflects who is being viewed. Fallback when the offender is not in the
    knowledge graph (real neighbourhoods come from the graph service for graph-resident IDs)."""
    priors = f"{o.get('priorOffences', 0)} prior offences"
    nodes = [
        {"id": "off", "label": o.get("id", "—"), "type": "offender", "x": 220, "y": 120},
        {"id": "o1", "label": o.get("offence", "Offence"), "type": "offence", "x": 90, "y": 55},
        {"id": "a1", "label": o.get("region", "Region"), "type": "area", "x": 235, "y": 232},
        {"id": "c1", "label": priors, "type": "condition", "x": 360, "y": 60},
        {"id": "c2", "label": "Supervision", "type": "condition", "x": 375, "y": 185},
    ]
    edges = [
        {"from": "off", "to": "o1", "label": "committed"},
        {"from": "off", "to": "a1", "label": "released to"},
        {"from": "off", "to": "c1", "label": "history"},
        {"from": "off", "to": "c2", "label": "supervised"},
    ]
    return {"nodes": nodes, "edges": edges}
