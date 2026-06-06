"""Authentication: bcrypt password hashing, JWT issuance/validation, and auth routes.

Implements signup / login / refresh / me / logout per the API contract. Refresh tokens are stored
hashed in PostgreSQL so they can be revoked on logout.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import jwt
from passlib.context import CryptContext

from . import db
from .config import settings
from .middleware import get_current_user, limiter
from .schemas import (
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
    UserOut,
)

log = structlog.get_logger()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
router = APIRouter(prefix="/auth", tags=["auth"])

# The refresh token is also returned in an httpOnly cookie so a browser refresh can silently
# re-establish the session WITHOUT persisting any token in JS-readable storage (localStorage /
# sessionStorage are forbidden by design). httpOnly keeps it out of reach of page scripts; the
# access token continues to live only in React memory. Scoped to the auth routes and marked Secure
# in production (the cookie is dropped over plain HTTP, so it stays off in local development).
_REFRESH_COOKIE = "sentinel_refresh"
_COOKIE_PATH = "/api/auth"  # browser-facing path (Traefik strips /api before the backend sees it)


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        _REFRESH_COOKIE,
        token,
        max_age=settings.jwt_refresh_expire_days * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.environment.lower() == "production",
        path=_COOKIE_PATH,
    )


DEMO_USERS = [
    ("admin@sentinel.demo", "admin", "Admin User", "admin"),
    ("analyst@sentinel.demo", "analyst", "Data Analyst", "analyst"),
    ("officer@sentinel.demo", "officer", "Case Officer", "case_officer"),
]


# --------------------------------------------------------------------------- hashing
def hash_password(password: str) -> str:
    return str(pwd_context.hash(password))


def verify_password(plain: str, hashed: str) -> bool:
    return bool(pwd_context.verify(plain, hashed))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --------------------------------------------------------------------------- jwt
def create_access_token(user: dict[str, Any]) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_expire_minutes)
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "username": user["username"],
        "exp": expire,
    }
    token: str = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token


def create_refresh_token(user_id: str) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expire = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_expire_days)
    db.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
        (user_id, _hash_token(token), expire),
    )
    return token


# --------------------------------------------------------------------------- seeding
def seed_demo_users() -> None:
    """Idempotently insert the three demo accounts."""
    for email, username, full_name, role in DEMO_USERS:
        existing = db.query("SELECT id FROM users WHERE username = %s", (username,))
        if existing:
            continue
        db.execute(
            """INSERT INTO users (email, username, hashed_password, full_name, role)
               VALUES (%s, %s, %s, %s, %s)""",
            (email, username, hash_password(settings.demo_password), full_name, role),
        )
        log.info("auth.seed.user", username=username, role=role)


def _user_out(row: dict[str, Any]) -> UserOut:
    return UserOut(
        id=str(row["id"]),
        username=row["username"],
        email=row["email"],
        full_name=row.get("full_name"),
        role=row["role"],
    )


# --------------------------------------------------------------------------- routes
@router.post("/signup", response_model=TokenResponse)
@limiter.limit("5/minute")
def signup(request: Request, response: Response, body: SignupRequest) -> TokenResponse:
    if db.query(
        "SELECT 1 FROM users WHERE username = %s OR email = %s", (body.username, body.email)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "username or email already registered")
    row = db.execute(
        """INSERT INTO users (email, username, hashed_password, full_name, role)
           VALUES (%s, %s, %s, %s, 'case_officer')
           RETURNING id, username, email, full_name, role""",
        (body.email, body.username, hash_password(body.password), body.full_name),
    )
    assert row is not None
    return _issue_tokens(row, response)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, response: Response, body: LoginRequest) -> TokenResponse:
    rows = db.query(
        "SELECT id, username, email, full_name, role, hashed_password "
        "FROM users WHERE username = %s",
        (body.username,),
    )
    if not rows or not verify_password(body.password, rows[0]["hashed_password"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    db.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (rows[0]["id"],))
    return _issue_tokens(rows[0], response)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
def refresh(
    request: Request, response: Response, body: RefreshRequest | None = None
) -> TokenResponse:
    """Rotate the refresh token: the presented token is consumed and a fresh pair is issued.

    The token may arrive in the request body (in-app rotation) or in the httpOnly cookie (a browser
    refresh, where React state — and any in-memory token — has been wiped). Rotation gives basic
    reuse detection: once a token is spent it is deleted, so a stolen copy used afterwards fails.
    """
    presented = body.refresh_token if body else request.cookies.get(_REFRESH_COOKIE)
    if not presented:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no refresh token provided")
    token_hash = _hash_token(presented)
    rows = db.query(
        """SELECT u.id, u.username, u.email, u.full_name, u.role FROM refresh_tokens rt
           JOIN users u ON u.id = rt.user_id
           WHERE rt.token_hash = %s AND rt.expires_at > NOW()""",
        (token_hash,),
    )
    if not rows:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired refresh token")
    # Consume the presented token, then issue a fresh access + refresh pair.
    db.execute("DELETE FROM refresh_tokens WHERE token_hash = %s", (token_hash,))
    return _issue_tokens(rows[0], response)


@router.get("/me", response_model=UserOut)
def me(current: dict[str, Any] = Depends(get_current_user)) -> UserOut:
    rows = db.query(
        "SELECT id, username, email, full_name, role FROM users WHERE id = %s", (current["sub"],)
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    return _user_out(rows[0])


@router.post("/logout")
def logout(
    response: Response, current: dict[str, Any] = Depends(get_current_user)
) -> dict[str, bool]:
    db.execute("DELETE FROM refresh_tokens WHERE user_id = %s", (current["sub"],))
    response.delete_cookie(_REFRESH_COOKIE, path=_COOKIE_PATH)
    return {"ok": True}


def _issue_tokens(row: dict[str, Any], response: Response) -> TokenResponse:
    access = create_access_token(row)
    refresh_token = create_refresh_token(str(row["id"]))
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access, refresh_token=refresh_token, user=_user_out(row))
