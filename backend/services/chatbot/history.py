"""Conversation history management for chatbot."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Message(BaseModel):
    """Single message in conversation."""

    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ConversationHistory:
    """Manages conversation state and history."""

    def __init__(self, max_history: int = 20):
        """Initialize conversation.

        Args:
            max_history: Maximum messages to keep in memory
        """
        self.messages: list[Message] = []
        self.max_history = max_history

    def add_message(self, role: str, content: str) -> Message:
        """Add message to history.

        Args:
            role: 'user' or 'assistant'
            content: Message text

        Returns:
            Created message

        Raises:
            ValueError: If role is not 'user' or 'assistant'
        """
        if role not in ("user", "assistant"):
            raise ValueError(f"Invalid role: {role}. Must be 'user' or 'assistant'")

        message = Message(role=role, content=content)
        self.messages.append(message)

        # Keep only recent messages
        if len(self.messages) > self.max_history:
            self.messages = self.messages[-self.max_history :]

        return message

    def get_context(self) -> str:
        """Get formatted conversation context for system prompt.

        Returns:
            Formatted conversation history
        """
        if not self.messages:
            return "No previous conversation."

        lines = ["Recent conversation:"]
        for msg in self.messages[-6:]:  # Last 6 messages for context
            role = "You" if msg.role == "user" else "Assistant"
            lines.append(f"{role}: {msg.content}")

        return "\n".join(lines)

    def clear(self) -> None:
        """Clear conversation history."""
        self.messages.clear()

    def summary(self) -> dict:
        """Get conversation summary for debugging."""
        return {
            "message_count": len(self.messages),
            "first_message": (
                self.messages[0].timestamp if self.messages else None
            ),
            "last_message": (
                self.messages[-1].timestamp if self.messages else None
            ),
            "context_preview": self.get_context()[:200] + "...",
        }
