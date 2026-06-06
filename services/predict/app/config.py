"""Service configuration, loaded from environment variables."""

from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_SECRETS = {"", "dev-insecure-change-me", "change-me-to-a-random-64-char-hex-string"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "development" (default) keeps the local `docker compose up` demo working with insecure
    # defaults; set ENVIRONMENT=production on a real deployment to enforce a real JWT secret.
    environment: str = "development"

    database_url: str = "postgresql://sentinel:sentinel@postgres:5432/sentinel"
    mlflow_tracking_uri: str = "http://mlflow:5000"
    graph_service_url: str = "http://graph:8002"

    # Comma-separated allowlist of browser origins permitted by CORS. Never "*" on an auth service.
    cors_origins: str = "http://localhost"

    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 7

    demo_password: str = "sentinel-demo-2026"
    model_version: str = "xgb-cal-v1.0.0"
    # Directory holding trained artifacts (model.pkl, pipeline.pkl, metrics.json, fairness.json,
    # schema.json). Mounted read-only into the container at /app/models. When the directory is empty
    # the predict service falls back to the transparent logistic heuristic.
    models_dir: str = "models"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def _fail_loud_in_production(self) -> Settings:
        """In production, refuse to start with an insecure/unset JWT secret."""
        if self.environment.lower() == "production" and self.jwt_secret in _INSECURE_SECRETS:
            raise ValueError(
                "JWT_SECRET must be set to a strong value in production "
                "(ENVIRONMENT=production with an insecure default is refused)."
            )
        return self


settings = Settings()
