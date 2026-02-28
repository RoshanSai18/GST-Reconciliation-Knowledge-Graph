"""Chat router for GST reconciliation assistant."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.chatbot.gst_assistant import get_gst_assistant
from services.chatbot.history import ConversationHistory

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)

# Store conversation history per session (in production, use session IDs)
_conversations: dict[str, ConversationHistory] = {}


class ChatRequest(BaseModel):
    """Chat message request."""

    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    language: str = Field(
        default="en",
        description="Language code (en, hi, etc.)",
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Session ID for conversation continuity",
    )


class ChatResponse(BaseModel):
    """Chat message response."""

    response: str = Field(..., description="Assistant response")
    session_id: str = Field(..., description="Session ID for this conversation")
    message_count: int = Field(..., description="Total messages in session")


@router.post("/message")
async def chat(request: ChatRequest) -> ChatResponse:
    """Send message to GST assistant.

    Args:
        request: Chat message request with user message

    Returns:
        Assistant response with session_id for continuity

    Raises:
        HTTPException: If assistant unavailable or API error
    """
    try:
        # Get or create conversation
        session_id = request.session_id or f"session_{id(request)}"
        if session_id not in _conversations:
            _conversations[session_id] = ConversationHistory()

        history = _conversations[session_id]

        # Add user message
        history.add_message("user", request.message)
        logger.info(f"Session {session_id}: User message received")

        # Get assistant
        assistant = get_gst_assistant()
        if not assistant.is_available():
            raise HTTPException(
                status_code=503,
                detail="GST Assistant not available. GEMINI_API_KEY not configured.",
            )

        # Generate response
        context = history.get_context()
        response = assistant.answer(
            question=request.message,
            context=context,
            language=request.language,
            temperature=0.7,
        )

        # Add assistant message to history
        history.add_message("assistant", response)
        logger.info(f"Session {session_id}: Response generated ({len(response)} chars)")

        return ChatResponse(
            response=response,
            session_id=session_id,
            message_count=len(history.messages),
        )

    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        logger.exception("Chat error")
        # Surface quota / rate-limit errors as 429 so the UI can show a clear message
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
            raise HTTPException(
                status_code=429,
                detail="Gemini API quota exceeded. Please wait a moment and try again, or generate a new API key at https://aistudio.google.com/apikey",
            ) from e
        raise HTTPException(
            status_code=500,
            detail=f"Error generating response: {err_str}",
        ) from e


@router.delete("/session/{session_id}")
async def clear_session(session_id: str) -> dict:
    """Clear conversation history for session.

    Args:
        session_id: Session to clear

    Returns:
        Confirmation message
    """
    if session_id in _conversations:
        _conversations[session_id].clear()
        del _conversations[session_id]
        logger.info(f"Session {session_id}: Cleared")
        return {"message": f"Session {session_id} cleared"}

    return {"message": f"Session {session_id} not found"}


@router.get("/health")
async def health_check() -> dict:
    """Check chatbot availability.

    Returns:
        Health status and assistant availability
    """
    assistant = get_gst_assistant()
    return {
        "status": "healthy",
        "assistant_available": assistant.is_available(),
        "active_sessions": len(_conversations),
    }
