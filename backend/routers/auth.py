"""
routers/auth.py — Clerk JWT authentication.

GET  /auth/me  → CurrentUser  (requires Clerk Bearer session token)

Clerk issues RS256-signed JWTs (session tokens). We verify them by:
  1. Fetching Clerk's public JWKS from CLERK_JWKS_URL
  2. Matching the JWT's `kid` header to a JWK entry
  3. Decoding and verifying the token with python-jose

Set CLERK_JWKS_URL in your .env file:
  https://<your-frontend-api>/.well-known/jwks.json
"""

from __future__ import annotations

import logging
from functools import lru_cache

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

import config
from models.schemas import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter()

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# JWKS helpers
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    """
    Fetch and memory-cache Clerk's JWKS.
    Cache is cleared on process restart (suitable for hackathon use).
    """
    if not config.CLERK_JWKS_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CLERK_JWKS_URL is not configured on the server.",
        )
    with httpx.Client(timeout=10.0) as client:
        response = client.get(config.CLERK_JWKS_URL)
        response.raise_for_status()
    return response.json()


def _verify_clerk_token(token: str) -> dict:
    """Verify a Clerk session JWT against the JWKS, return the payload."""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed token header: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    kid = unverified_header.get("kid")
    jwks = _get_jwks()

    # Find the matching public key by key ID
    matching_key: dict | None = next(
        (k for k in jwks.get("keys", []) if k.get("kid") == kid),
        None,
    )
    if matching_key is None:
        # Key not in cache — could be a key rotation; bust the cache and retry
        _get_jwks.cache_clear()
        refreshed = _get_jwks()
        matching_key = next(
            (k for k in refreshed.get("keys", []) if k.get("kid") == kid),
            None,
        )

    if matching_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No matching public key found for this token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            matching_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk tokens have no `aud` by default
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Clerk token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# Dependency: require valid Clerk JWT
# ---------------------------------------------------------------------------

def require_jwt(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    """FastAPI dependency — validates a Clerk Bearer JWT and returns CurrentUser."""
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No credentials provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _verify_clerk_token(creds.credentials)

    # Clerk tokens use `sub` as the Clerk user ID; email is in `email`
    user_id:  str = payload.get("sub", "")
    username: str = (
        payload.get("email")
        or payload.get("primary_email_address")
        or user_id
        or "unknown"
    )
    return CurrentUser(username=username, user_id=user_id, role="admin")


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

@router.get(
    "/me",
    summary="Current User",
    response_model=CurrentUser,
)
def me(current_user: CurrentUser = Depends(require_jwt)) -> CurrentUser:
    """Return the currently authenticated Clerk user (requires Bearer session token)."""
    return current_user
