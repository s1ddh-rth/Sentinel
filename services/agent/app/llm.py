"""Minimal text-generation helper used for HyDE (hypothetical document embeddings).

This is a single non-structured completion call, separate from the PydanticAI agent, so the hybrid
retriever can ask for a hypothetical passage without spinning up the full agent. Talks to whichever
provider is configured; returns ``""`` on any failure so HyDE degrades to a no-op.
"""

from __future__ import annotations

import httpx
import structlog

from .config import settings

log = structlog.get_logger()


def generate(prompt: str, max_tokens: int = 200) -> str:
    """Return a short completion for ``prompt``, or "" if the provider is unavailable."""
    try:
        if settings.agent_llm_provider == "anthropic":
            return _anthropic(prompt, max_tokens)
        return _ollama(prompt, max_tokens)
    except Exception as err:  # noqa: BLE001 - HyDE is best-effort
        log.info("llm.generate.failed", error=str(err))
        return ""


def _ollama(prompt: str, max_tokens: int) -> str:
    resp = httpx.post(
        f"{settings.ollama_url}/api/generate",
        json={
            "model": settings.ollama_model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens},
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return str(resp.json().get("response", "")).strip()


def _anthropic(prompt: str, max_tokens: int) -> str:
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": settings.anthropic_model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    blocks = resp.json().get("content", [])
    return "".join(b.get("text", "") for b in blocks).strip()
