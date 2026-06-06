"""Pydantic request/response schemas for the predict service."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

RiskBand = Literal["LOW", "MEDIUM", "HIGH"]
Role = Literal["admin", "analyst", "case_officer"]


# --------------------------------------------------------------------------- auth
class SignupRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8)
    full_name: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    full_name: str | None
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --------------------------------------------------------------------------- predict
class ShapFeature(BaseModel):
    feature: str
    value: str
    contribution: float


class PredictRequest(BaseModel):
    offender_id: str
    features: dict[str, Any]
    include_explanation: bool = True


class PredictResponse(BaseModel):
    prediction_id: str
    offender_id: str
    risk_score: float = Field(ge=0.0, le=1.0)
    risk_band: RiskBand
    # Split-conformal interval (~90% marginal coverage) from held-out calibration residuals when a
    # trained model is loaded; falls back to a heuristic band only in no-artifact heuristic mode.
    confidence_interval: tuple[float, float] = Field(
        description="Split-conformal uncertainty interval around the risk score (~90% coverage)."
    )
    shap_values: list[ShapFeature] | None
    model_version: str
    timestamp: datetime


class OverrideRequest(BaseModel):
    offender_id: str
    prediction_id: str | None = None
    original_band: RiskBand
    new_band: RiskBand
    reason_code: str
    reason_text: str | None = None
