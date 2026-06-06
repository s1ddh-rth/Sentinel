"""Agent service configuration, loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM provider: "ollama" (primary, self-hosted) or "anthropic" (portable fallback).
    agent_llm_provider: str = "ollama"
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Retrieval
    embed_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    qdrant_url: str = "http://qdrant:6333"
    qdrant_collection: str = "sentinel"
    domain_pack: str = "criminal_justice"
    rag_top_k: int = 4
    rag_use_hybrid: bool = True  # dense + BM25 + HyDE + RRF + cross-encoder rerank
    rag_use_hyde: bool = True  # HyDE leg needs the LLM; degrades to no-op if unavailable

    # Inter-service
    predict_service_url: str = "http://predict:8000"
    graph_service_url: str = "http://graph:8002"
    # Shared JWT secret so the agent can mint a short-lived service token to call predict.
    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"

    # Observability
    logfire_token: str = ""


settings = Settings()
