"""SENTINEL agent service — the GraphRAG assistant API.

Routed at ``/api/agent`` by Traefik in the full-profile stack. ``/chat`` runs the PydanticAI agent;
``/health`` reports liveness plus retrieval/provider status without requiring a live LLM call.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, status

from . import retriever
from .config import settings
from .schemas import AgentResponse, ChatRequest

structlog.configure(
    processors=[structlog.processors.add_log_level, structlog.processors.JSONRenderer()],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    if settings.logfire_token:
        try:
            import logfire  # noqa: PLC0415

            logfire.configure(token=settings.logfire_token)
            logfire.instrument_fastapi(app)
        except Exception as err:  # noqa: BLE001 - observability is best-effort
            log.warning("agent.logfire.failed", error=str(err))
    # Best-effort: make sure the policy index exists so the first query is fast.
    try:
        count = retriever.ensure_ingested()
        log.info("agent.startup", provider=settings.agent_llm_provider, indexed_chunks=count)
    except Exception as err:  # noqa: BLE001 - Qdrant may be down; /chat will report it
        log.warning("agent.ingest.skipped", error=str(err))
    yield


app = FastAPI(title="SENTINEL · agent", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "provider": settings.agent_llm_provider}


@app.post("/chat", response_model=AgentResponse)
async def chat(body: ChatRequest) -> AgentResponse:
    from .agent import run_agent  # noqa: PLC0415 - import here so /health never needs the LLM stack

    try:
        return await run_agent(body.message, offender_id=body.offender_id)
    except Exception as err:
        log.warning("agent.chat.failed", error=str(err))
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"assistant unavailable: {err}"
        ) from err
