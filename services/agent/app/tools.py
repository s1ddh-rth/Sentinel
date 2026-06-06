"""Inter-service helpers used by the agent's tools.

``risk_lookup`` calls the predict service (minting a short-lived service JWT from the shared secret)
and ``graph_lookup`` calls the graph service. Kept separate from the agent definition so they can be
unit-tested without an LLM.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from jose import jwt

from .config import settings

log = structlog.get_logger()


def _service_token() -> str:
    """Mint a short-lived admin token so the agent can call the authenticated predict service."""
    payload = {
        "sub": "agent-service",
        "role": "admin",
        "username": "agent",
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    return str(jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm))


def risk_lookup(features: dict[str, Any], offender_id: str = "agent-query") -> dict[str, Any]:
    """Score features via the predict service. Returns score + band, or an error dict."""
    try:
        resp = httpx.post(
            f"{settings.predict_service_url}/predict",
            json={"offender_id": offender_id, "features": features, "include_explanation": False},
            headers={"Authorization": f"Bearer {_service_token()}"},
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "offender_id": offender_id,
            "risk_score": data["risk_score"],
            "risk_band": data["risk_band"],
        }
    except Exception as err:  # noqa: BLE001 - tool failures are reported to the model, not raised
        log.warning("tools.risk_lookup.failed", error=str(err))
        return {"error": f"risk lookup unavailable: {err}"}


def graph_lookup(offender_id: str) -> dict[str, Any]:
    """Fetch graph-derived features for an offender from the graph service."""
    try:
        resp = httpx.get(f"{settings.graph_service_url}/features/{offender_id}", timeout=10.0)
        resp.raise_for_status()
        return dict(resp.json())
    except Exception as err:  # noqa: BLE001
        log.warning("tools.graph_lookup.failed", error=str(err))
        return {"error": f"graph lookup unavailable: {err}"}
