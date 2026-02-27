"""Google Gemini API client for chatbot."""

import os
import logging
from typing import Optional

try:
    import google.generativeai as genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)


class GeminiClient:
    """Wrapper for Google Gemini API."""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize Gemini client.
        
        Args:
            api_key: Google Gemini API key. If None, reads from GEMINI_API_KEY env var.
        """
        if genai is None:
            logger.warning("google-generativeai not installed. Install with: pip install google-generativeai")
            self.client = None
            return

        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            self.client = None
            return

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        self.client = True
        logger.info("Gemini client initialized")

    def is_available(self) -> bool:
        """Check if Gemini API is available."""
        return self.client is not None

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
            full_prompt = f"{system_prompt}\n\nUser: {message}"
            response = self.model.generate_content(
                full_prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise
