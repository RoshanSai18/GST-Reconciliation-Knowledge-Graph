"""
routers/session.py — Per-user session / data lifecycle.

DELETE /session   Wipes ALL Neo4j nodes (and their relationships) owned by
                  the calling Clerk user.  Called by the frontend immediately
                  before clerk.signOut() so data does not persist after logout.

The user_id stored on every node matches the Clerk JWT `sub` claim, which is
injected during upload via graph_builder.*_batch(…, user_id=…).
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from database.neo4j_client import run_write_query
from models.schemas import CurrentUser
from routers.auth import require_jwt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Session"])

_AuthDep = Annotated[CurrentUser, Depends(require_jwt)]

# ---------------------------------------------------------------------------
# DELETE /session
# ---------------------------------------------------------------------------

_DELETE_USER_DATA = """
MATCH (n {user_id: $uid})
DETACH DELETE n
"""


@router.delete(
    "/",
    summary="Delete all data for the calling user",
    status_code=status.HTTP_200_OK,
)
def delete_session(current_user: _AuthDep) -> dict:
    """
    Permanently delete every Neo4j node (Taxpayer, Invoice, GSTR1, GSTR2B,
    GSTR3B, TaxPayment) that belongs to the authenticated user, along with
    all relationships attached to those nodes.

    This endpoint is called by the frontend during logout to ensure no user
    data lingers in the database after sign-out.
    """
    uid = current_user.user_id

    if not uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot resolve user identity — Clerk sub claim is missing.",
        )

    try:
        run_write_query(_DELETE_USER_DATA, {"uid": uid})
        logger.info("Deleted all graph data for user_id=%s", uid)
    except Exception as exc:
        logger.exception("Session delete failed for user_id=%s: %s", uid, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database delete failed: {exc}",
        ) from exc

    return {"deleted": True, "user_id": uid}
