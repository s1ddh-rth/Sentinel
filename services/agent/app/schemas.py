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


class AgentResponse(BaseModel):
    """Structured agent output — never free-form parsed. This is the PydanticAI ``output_type``."""

    answer: str = Field(description="The assistant's answer, grounded in the cited sources.")
    citations: list[Citation] = Field(default_factory=list)
    risk_context: RiskContext | None = None


class ChatRequest(BaseModel):
    message: str
    offender_id: str | None = None
    session_id: str | None = None
