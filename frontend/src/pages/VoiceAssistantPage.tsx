import { VoiceAssistant } from "../components/VoiceAssistant";
import { sendMessageToChatbot } from "../lib/chatbot";

/**
 * Voice Assistant Page
 * 
 * Full integration example showing how to use the VoiceAssistant component
 * with the chatbot API.
 * 
 * Features:
 * - Speak queries
 * - See real-time transcript
 * - AI responses
 * - Hear responses read aloud
 * - Multi-language support
 */
export function VoiceAssistantPage() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <h1 className="text-2xl font-bold text-gray-900">Voice Assistant</h1>
        <p className="mt-1 text-sm text-gray-600">
          Speak your GST questions and get instant AI-powered answers with voice feedback
        </p>
      </div>

      {/* Voice Assistant Component */}
      <div className="flex-1 p-6 overflow-hidden">
        <VoiceAssistant sendMessageToChatbot={sendMessageToChatbot} />
      </div>

      {/* Help Section */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
        <details className="cursor-pointer">
          <summary className="font-medium text-gray-900 select-none hover:text-blue-600">
            💡 How to use the Voice Assistant
          </summary>
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>
              <strong>1. Select Language:</strong> Choose English, Hindi, or Telugu from the dropdown.
            </p>
            <p>
              <strong>2. Start Listening:</strong> Click the microphone button and speak your question clearly.
            </p>
            <p>
              <strong>3. Send Message:</strong> Your speech will be converted to text. Click "Send" to submit it to the AI.
            </p>
            <p>
              <strong>4. Hear Response:</strong> Enable "Auto" to have the response read aloud automatically, or click the speaker icon to hear it.
            </p>
            <p>
              <strong>Example Questions:</strong> "What is GST reconciliation?", "How do I claim ITC?", "What are GSTR-1 and GSTR-2B?"
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
