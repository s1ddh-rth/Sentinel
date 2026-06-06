"""Auth dependency, RBAC role checker, and the slowapi rate limiter."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import Depends, HTTPException, status

if TYPE_CHECKING:
    from collections.abc import Callable
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import settings

limiter = Limiter(key_func=get_remote_address)
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Validate the Bearer token and return its claims (sub, role, username)."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        payload: dict[str, Any] = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token") from err
    return payload


def require_roles(*roles: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """Dependency factory that enforces the caller holds one of the given roles."""

    def checker(current: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if current.get("role") not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return current

    return checker
