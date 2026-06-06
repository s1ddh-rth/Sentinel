"""The SENTINEL GraphRAG assistant — a PydanticAI agent with structured output.

The model is selected by config: Ollama ``qwen2.5`` (primary, self-hosted, OpenAI-compatible API) or
the Anthropic API (portable fallback). Output is the ``AgentResponse`` schema — never free-text
parsed. Two tools are exposed: ``policy_search`` (dense retrieval over the domain pack) and
``risk_lookup`` (the predict service). Built lazily so the service can boot without a live LLM.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog
from pydantic_ai import Agent, RunContext

from . import hybrid, retriever, tools
from .config import settings
from .schemas import AgentResponse

log = structlog.get_logger()

SYSTEM_PROMPT = (
    "You are SENTINEL's assistant for criminal-justice risk assessment, answering policy and case "
    "questions for trained officers. Strict grounding rules:\n"
    "1. ALWAYS call `policy_search` before answering a substantive question. Base your answer ONLY "
    "on the returned passages — do not use outside knowledge or invent facts or numbers.\n"
    "2. Put every source you actually used in `citations`, copying its source and snippet verbatim "
    "from the search results. Never cite a source you did not retrieve.\n"
    "3. If the retrieved passages do not support an answer, say plainly that you don't have that "
    "information in the knowledge base — do not guess.\n"
    "4. When the user asks about a specific offender's risk, call `risk_lookup` and put the result "
    "in `risk_context`.\n"
    "5. Risk scores are advisory; a human makes the final decision and may override. Say so when "
    "relevant. Keep answers concise and factual."
)


@dataclass
class Deps:
    offender_id: str | None = None


_agent: Any = None


def _build_model() -> Any:
    if settings.agent_llm_provider == "anthropic":
        from pydantic_ai.models.anthropic import AnthropicModel  # noqa: PLC0415
        from pydantic_ai.providers.anthropic import AnthropicProvider  # noqa: PLC0415

        provider = AnthropicProvider(api_key=settings.anthropic_api_key)
        return AnthropicModel(settings.anthropic_model, provider=provider)

    # Default: Ollama via its OpenAI-compatible endpoint.
    from pydantic_ai.models.openai import OpenAIModel  # noqa: PLC0415
    from pydantic_ai.providers.openai import OpenAIProvider  # noqa: PLC0415

    provider = OpenAIProvider(base_url=f"{settings.ollama_url}/v1", api_key="ollama")
    return OpenAIModel(settings.ollama_model, provider=provider)


def get_agent() -> Any:
    """Construct (once) and return the configured agent."""
    global _agent
    if _agent is not None:
        return _agent

    agent = Agent(
        _build_model(),
        output_type=AgentResponse,
        deps_type=Deps,
        system_prompt=SYSTEM_PROMPT,
    )

    @agent.tool_plain
    def policy_search(query: str) -> list[dict[str, Any]]:
        """Search the policy/fairness knowledge base for passages relevant to the query."""
        if settings.rag_use_hybrid:
            return hybrid.hybrid_search(query, use_hyde=settings.rag_use_hyde)
        return retriever.search(query)

    @agent.tool
    def risk_lookup(ctx: RunContext[Deps], features: dict[str, Any]) -> dict[str, Any]:
        """Score an offender's feature dict via the calibrated risk model."""
        return tools.risk_lookup(features, ctx.deps.offender_id or "agent-query")

    _agent = agent
    log.info("agent.built", provider=settings.agent_llm_provider)
    return _agent


async def run_agent(message: str, offender_id: str | None = None) -> AgentResponse:
    result = await get_agent().run(message, deps=Deps(offender_id=offender_id))
    return result.output  # type: ignore[no-any-return]
