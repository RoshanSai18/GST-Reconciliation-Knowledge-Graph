import { useEffect, useRef, useState } from "react";
import { Send, AlertCircle, Loader, Mic, Square } from "lucide-react";
import { api } from "../lib/api";
import { ChatMessage } from "./ChatMessage";
import { useVoiceRecognition } from "../hooks/useVoiceRecognition";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Language code mapping for Web Speech API
  const languageMap: Record<string, string> = {
    en: "en-IN",
    hi: "hi-IN",
    te: "te-IN",
  };

  const { isListening, transcript, toggleListening, clearTranscript } =
    useVoiceRecognition({ language: languageMap[language] || "en-IN" });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update input when transcript changes (voice input)
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    clearTranscript(); // Clear voice transcript after sending
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await api.post("/chat/message", {
        message: input,
        language,
        session_id: sessionId,
      });

      // Update session ID for continuity
      if (response.data.session_id) {
        setSessionId(response.data.session_id);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.response,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to send message";
      setError(errorMsg);
      console.error("Chat error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!sessionId) return;

    try {
      await api.delete(`/chat/session/${sessionId}`);
      setMessages([]);
      setSessionId(null);
      setError(null);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            GST Reconciliation Assistant
          </h2>
          <p className="text-sm text-gray-500">
            Ask questions about GST reconciliation and invoice matching
          </p>
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="en">English</option>
          <option value="hi">हिंदी</option>
          <option value="te">తెలుగు</option>
        </select>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm mt-2">
                Ask a question about GST reconciliation to get started
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} language={language} />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-3 max-w-md">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200">
          <div className="flex items-gap-2 gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="px-6 py-4 border-t border-gray-200 space-y-3">
        {messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="w-full text-sm py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
          >
            Clear History
          </button>
        )}
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <button
            type="button"
            onClick={toggleListening}
            disabled={loading}
            className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
              isListening
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isListening ? "Stop listening" : "Start listening"}
          >
            {isListening ? (
              <>
                <Square className="w-4 h-4" />
                <span className="text-sm font-medium">Stop</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span className="text-sm font-medium">Voice</span>
              </>
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about GST reconciliation or speak..."
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
