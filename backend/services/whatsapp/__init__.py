"""
WhatsApp messaging service via Twilio.

Provides helpers for sending plain messages and formatted GST audit reports
through the Twilio WhatsApp API.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Twilio client (initialised lazily)
# ---------------------------------------------------------------------------
_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        if not config.TWILIO_ACCOUNT_SID or not config.TWILIO_AUTH_TOKEN:
            raise RuntimeError(
                "Twilio credentials not configured. "
                "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env"
            )
        _client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
        logger.info("Twilio client initialised (SID: %s…)", config.TWILIO_ACCOUNT_SID[:8])
    return _client


# ---------------------------------------------------------------------------
# Phone validation
# ---------------------------------------------------------------------------
PHONE_RE = re.compile(r"^\+?[1-9]\d{1,14}$")


def validate_phone(number: str) -> str:
    """Return the cleaned phone number or raise ValueError."""
    cleaned = number.replace(" ", "").replace("-", "")
    if not PHONE_RE.match(cleaned):
        raise ValueError(
            "Invalid phone number format. Use international format: +91XXXXXXXXXX"
        )
    return cleaned


# ---------------------------------------------------------------------------
# Report formatter
# ---------------------------------------------------------------------------
def format_gst_report(analysis: dict[str, Any]) -> str:
    """
    Turn a GST reconciliation analysis dict into a compact WhatsApp message.

    Expected shape (all fields optional):
        {
            "overallScore": 72,
            "audit": [
                {"category": "ITC Match", "score": 85, "status": "OK"},
                {"category": "Filing", "score": 45, "status": "Critical"},
                ...
            ]
        }
    """
    if not analysis:
        return "GST reconciliation report not available."

    msg = "📊 *GST RECONCILIATION REPORT*\n\n"

    # Overall score
    score = analysis.get("overallScore")
    if score is not None:
        emoji = "🟢" if score >= 80 else "🟡" if score >= 60 else "🔴"
        msg += f"{emoji} Score: {score}/100\n\n"

    # Top categories
    audit = analysis.get("audit")
    if isinstance(audit, list) and audit:
        msg += "*Top Areas:*\n"
        for i, cat in enumerate(audit[:5], 1):
            status = cat.get("status", "")
            icon = (
                "❌" if status == "Critical"
                else "⚠️" if status == "Warning"
                else "✅"
            )
            msg += f"{i}. {icon} {cat.get('category', '?')}: {cat.get('score', '?')}/100\n"

    msg += "\n💬 Open the dashboard for full details"
    return msg


# ---------------------------------------------------------------------------
# Send helpers
# ---------------------------------------------------------------------------
def send_whatsapp(to: str, body: str) -> dict[str, Any]:
    """Send a plain WhatsApp message.  Returns Twilio response dict."""
    cleaned = validate_phone(to)
    client = _get_client()

    logger.info("Sending WhatsApp to %s from %s", cleaned, config.TWILIO_WHATSAPP_NUMBER)
    message = client.messages.create(
        from_=config.TWILIO_WHATSAPP_NUMBER,
        to=f"whatsapp:{cleaned}",
        body=body,
    )
    logger.info("WhatsApp sent — SID: %s, status: %s", message.sid, message.status)
    return {"sid": message.sid, "status": message.status}


def send_gst_report(to: str, analysis: dict[str, Any]) -> dict[str, Any]:
    """Format a GST report and send it via WhatsApp."""
    body = format_gst_report(analysis)
    return send_whatsapp(to, body)
