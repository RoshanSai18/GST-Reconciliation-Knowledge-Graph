"""
routers/auth.py — JWT authentication endpoints.

POST /auth/token   → LoginRequest → TokenResponse
GET  /auth/me      → CurrentUser  (requires Bearer token)

This replaces the temporary bearer-string guard used in Phases 5-8.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

import config
from models.schemas import CurrentUser, LoginRequest, TokenResponse

logger = logging.getLogger(__name__)
router = APIRouter()

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _create_token(username: str, role: str = "admin") -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub":  username,
        "role": role,
        "exp":  expire,
        "iat":  datetime.now(timezone.utc),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=[config.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# Dependency: require valid JWT
# ---------------------------------------------------------------------------

def require_jwt(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    """FastAPI dependency — validates Bearer JWT and returns CurrentUser."""
    if creds is None:
        # Fallback: accept the legacy static secret so old calls still work
        # during the transition.  Remove this branch after full migration.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No credentials provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Allow legacy static secret (backwards compat during hackathon)
    if creds.credentials == config.JWT_SECRET:
        return CurrentUser(username="admin", role="admin")

    payload = _decode_token(creds.credentials)
    return CurrentUser(
        username = payload.get("sub", "unknown"),
        role     = payload.get("role", "user"),
    )


# ---------------------------------------------------------------------------
# POST /auth/token
# ---------------------------------------------------------------------------

@router.post(
    "/token",
    summary="Login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
)
def login(body: LoginRequest) -> TokenResponse:
    """
    Authenticate with username/password.
    Returns a JWT access token.
    """
    if (
        body.username != config.ADMIN_USERNAME
        or body.password != config.ADMIN_PASSWORD
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    token = _create_token(username=body.username, role="admin")
    logger.info("Login: user=%s issued JWT", body.username)

    return TokenResponse(
        access_token = token,
        token_type   = "bearer",
        expires_in   = config.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

@router.get(
    "/me",
    summary="Current User",
    response_model=CurrentUser,
)
def me(current_user: CurrentUser = Depends(require_jwt)) -> CurrentUser:
    """Return the currently authenticated user (requires Bearer token)."""
    return current_user
