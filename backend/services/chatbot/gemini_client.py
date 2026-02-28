"""Google Gemini API client for chatbot."""

import os
import logging
from typing import Optional

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None
    genai_types = None

logger = logging.getLogger(__name__)


class GeminiClient:
    """Wrapper for Google Gemini API (google-genai SDK)."""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize Gemini client.

        Args:
            api_key: Google Gemini API key. If None, reads from GEMINI_API_KEY env var.
        """
        if genai is None:
            logger.warning("google-genai not installed. Run: pip install google-genai")
            self._client = None
            return

        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            self._client = None
            return

        self._client = genai.Client(api_key=self.api_key)
        self._model = "models/gemma-3-27b-it"
        logger.info("Gemini client initialized (model: %s)", self._model)

    def is_available(self) -> bool:
        """Check if Gemini API is available."""
        return self._client is not None

    def generate_response(
        self,
        message: str,
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        """Generate response from Gemini model.

        Args:
            message: User message
            system_prompt: System prompt for context
            temperature: Response creativity (0-1)
            max_tokens: Max response length

        Returns:
            Generated response text

        Raises:
            Exception: If API call fails
        """
        if not self.is_available():
            raise RuntimeError("Gemini API not configured. Set GEMINI_API_KEY environment variable.")

        try:
            # Gemma models don't support system_instruction — prepend it to the prompt
            full_prompt = f"{system_prompt}\n\n---\n\nUser: {message}\n\nAssistant:"
            response = self._client.models.generate_content(
                model=self._model,
                contents=full_prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )
            text = response.text
            if text:
                return text.strip()
            return "I'm unable to generate a response for that query. Please try rephrasing."
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise
