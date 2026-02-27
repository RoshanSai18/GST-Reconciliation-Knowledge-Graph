import { api } from "./api";

/**
 * Send a message to the GST chatbot
 * Handles the API call and error handling
 */
export async function sendMessageToChatbot(
  message: string,
  language: string
): Promise<string> {
  if (!message.trim()) {
    throw new Error("Message cannot be empty");
  }

  try {
    const response = await api.post("/chat/message", {
      message: message.trim(),
      language: language,
    });

    if (!response.data.response) {
      throw new Error("No response from chatbot");
    }

    return response.data.response;
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to get response from chatbot";

    console.error("Chatbot API error:", error);
    throw new Error(errorMessage);
  }
}

/**
 * Send a message with optional session ID (for conversation continuity)
 */
export async function sendMessageWithSession(
  message: string,
  language: string,
  sessionId?: string
): Promise<{ response: string; sessionId: string }> {
  if (!message.trim()) {
    throw new Error("Message cannot be empty");
  }

  try {
    const response = await api.post("/chat/message", {
      message: message.trim(),
      language: language,
      session_id: sessionId || undefined,
    });

    if (!response.data.response) {
      throw new Error("No response from chatbot");
    }

    return {
      response: response.data.response,
      sessionId: response.data.session_id,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to get response from chatbot";

    console.error("Chatbot API error:", error);
    throw new Error(errorMessage);
  }
}
