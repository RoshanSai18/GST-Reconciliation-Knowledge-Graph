"""
WhatsApp router – send messages & formatted GST audit reports via Twilio.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from twilio.base.exceptions import TwilioRestException

from services.whatsapp import send_whatsapp, send_gst_report

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class SendMessageRequest(BaseModel):
    to: str = Field(..., description="Recipient phone number in E.164 format")
    message: str = Field(..., min_length=1, description="Message body")

class SendReportRequest(BaseModel):
    to: str = Field(..., description="Recipient phone number in E.164 format")
    analysis: dict[str, Any] = Field(default_factory=dict, description="GST analysis payload")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TWILIO_ERROR_MAP: dict[int, str] = {
    21211: "Invalid 'To' phone number",
    21608: "The number is not part of the Twilio WhatsApp sandbox. "
           "Send 'join <sandbox-code>' to +1 415 523 8886 first.",
    63007: "Message body exceeds the WhatsApp length limit",
}


def _handle_twilio_error(exc: TwilioRestException) -> HTTPException:
    """Map common Twilio error codes to user-friendly HTTP errors."""
    detail = TWILIO_ERROR_MAP.get(exc.code, f"Twilio error {exc.code}: {exc.msg}")
    status = 400 if exc.code in (21211,) else 502
    return HTTPException(status_code=status, detail=detail)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/send")
async def send_message(req: SendMessageRequest):
    """Send a plain WhatsApp message."""
    try:
        result = send_whatsapp(req.to, req.message)
        return {"success": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except TwilioRestException as exc:
        logger.error("Twilio error on /send: %s", exc)
        raise _handle_twilio_error(exc)
    except Exception as exc:
        logger.exception("Unexpected error on /send")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/send-report")
async def send_report(req: SendReportRequest):
    """Format a GST audit report and send it via WhatsApp."""
    try:
        result = send_gst_report(req.to, req.analysis)
        return {"success": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except TwilioRestException as exc:
        logger.error("Twilio error on /send-report: %s", exc)
        raise _handle_twilio_error(exc)
    except Exception as exc:
        logger.exception("Unexpected error on /send-report")
        raise HTTPException(status_code=500, detail=str(exc))
