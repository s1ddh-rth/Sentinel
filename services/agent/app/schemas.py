"""Request/response schemas for the agent service. The agent's output is a structured model."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Citation(BaseModel):
    """A retrieved source supporting part of the answer."""

    source: str
    snippet: str
    score: float


class RiskContext(BaseModel):
    """Risk information pulled from the predict service for an offender mentioned in the query."""

    offender_id: str
    risk_score: float
    risk_band: str


class GraphContext(BaseModel):
    """Graph-derived context (community + similar offenders) pulled from the graph service.

    Field set mirrors the graph service's ``GraphFeatures`` so the model can copy the tool result
    verbatim into this structured field without tripping strict additional-property validation.
    """

    offender_id: str
    in_graph: bool | None = None
    degree: int | None = None
    pagerank: float | None = None
    community: int | None = None
    community_size: int | None = None
    similar_ids: list[str] = Field(default_factory=list)


class AgentResponse(BaseModel):
    """Structured agent output — never free-form parsed. This is the PydanticAI ``output_type``."""

    answer: str = Field(description="The assistant's answer, grounded in the cited sources.")
    citations: list[Citation] = Field(default_factory=list)
    risk_context: RiskContext | None = None
    graph_context: GraphContext | None = None


class ChatRequest(BaseModel):
    message: str
    offender_id: str | None = None
    session_id: str | None = None
