import { useState } from "react";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Copy,
  Trash2,
  Loader,
} from "lucide-react";
import { useVoiceRecognition } from "../hooks/useVoiceRecognition";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";

interface VoiceAssistantProps {
  sendMessageToChatbot: (message: string, language: string) => Promise<string>;
  title?: string;
}

/**
 * VoiceAssistant Component
 *
 * A voice-enabled chat interface that allows users to:
 * 1. Speak queries using their microphone
 * 2. See live transcript
 * 3. Send to chatbot
 * 4. Hear responses read aloud
 *
 * Features:
 * - Multi-language support (English, Hindi, Telugu)
 * - Real-time speech recognition
 * - Automatic or manual text-to-speech
 * - Visual feedback (listening indicator, loading state)
 * - Error handling and user-friendly messages
 */
export function VoiceAssistant({
  sendMessageToChatbot,
  title = "Voice Assistant",
}: VoiceAssistantProps) {
  // State management
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Language configuration
  const languages = [
    { code: "en", label: "English", voiceCode: "en-IN" },
    { code: "hi", label: "हिंदी", voiceCode: "hi-IN" },
    { code: "te", label: "తెలుగు", voiceCode: "te-IN" },
  ];

  // Voice recognition hook
  const {
    isListening,
    transcript,
    isSupported: isSpeechRecognitionSupported,
    toggleListening,
    clearTranscript,
  } = useVoiceRecognition({
    language: languages.find((l) => l.code === selectedLanguage)?.voiceCode || "en-IN",
    onTranscript: (finalTranscript) => {
      console.log("Final transcript:", finalTranscript);
    },
    onError: (errorMsg) => {
      setError(errorMsg);
      console.error("Voice error:", errorMsg);
    },
  });

  // Speech synthesis hook
  const {
    isSpeaking,
    isSupported: isSpeechSynthesisSupported,
    speak,
    stop: stopSpeaking,
  } = useSpeechSynthesis({
    language: languages.find((l) => l.code === selectedLanguage)?.voiceCode || "en-IN",
  });

  /**
   * Handle sending transcript to chatbot
   */
  const handleSendMessage = async () => {
    if (!transcript.trim()) {
      setError("Please speak something or type a message");
      return;
    }

    setLoading(true);
    setError("");
    setResponse("");

    try {
      const chatResponse = await sendMessageToChatbot(transcript, selectedLanguage);
      setResponse(chatResponse);

      // Auto-speak response if toggle is ON
      if (autoSpeak && isSpeechSynthesisSupported) {
        speak(chatResponse);
      }

      // Clear transcript after successful submission
      clearTranscript();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send message";
      setError(errorMessage);
      console.error("Chatbot error:", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle language change
   */
  const handleLanguageChange = (newLanguage: string) => {
    setSelectedLanguage(newLanguage);
    // Stop any ongoing speech synthesis when language changes
    if (isSpeaking) {
      stopSpeaking();
    }
  };

  /**
   * Copy response to clipboard
   */
  const copyToClipboard = () => {
    if (response) {
      navigator.clipboard.writeText(response);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    }
  };

  // Browser support check
  if (!isSpeechRecognitionSupported || !isSpeechSynthesisSupported) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">
          ⚠️ Voice features are not supported in your browser. Please use Chrome, Edge, or Safari.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Speak naturally • See transcript • Get AI response • Hear it back
        </p>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Language Selector */}
        <div className="flex items-center gap-3">
          <label htmlFor="language" className="text-sm font-medium text-gray-700">
            Language:
          </label>
          <select
            id="language"
            value={selectedLanguage}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Microphone Section */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">Microphone</label>
          <div className="flex gap-2">
            <button
              onClick={toggleListening}
              aria-label={isListening ? "Stop listening" : "Start listening"}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Start Listening
                </>
              )}
            </button>
          </div>

          {/* Listening Indicator */}
          {isListening && (
            <div className="flex items-center gap-2 text-red-600">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse delay-100"></div>
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse delay-200"></div>
              </div>
              <span className="text-sm font-medium">Listening...</span>
            </div>
          )}
        </div>

        {/* Transcript Area */}
        {transcript && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Your Message</label>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-gray-900">{transcript}</p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Response Area */}
        {response && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">AI Response</label>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg max-h-48 overflow-y-auto">
              <p className="text-gray-900 whitespace-pre-wrap">{response}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with Controls */}
      <div className="border-t border-gray-200 px-6 py-4 space-y-3">
        {/* Controls Row 1: Send, Auto-speak, Response controls */}
        <div className="flex gap-2">
          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={!transcript.trim() || loading}
            aria-label="Send message to chatbot"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>

          {/* Auto-speak Toggle */}
          <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <Volume2 className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">Auto</span>
          </label>

          {/* Manual Speak Button */}
          <button
            onClick={() => {
              if (isSpeaking) {
                stopSpeaking();
              } else if (response) {
                speak(response);
              }
            }}
            disabled={!response}
            aria-label={isSpeaking ? "Stop speaking" : "Speak response"}
            className={`px-3 py-2 rounded-lg font-medium transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed ${
              isSpeaking
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-800"
            }`}
          >
            {isSpeaking ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Controls Row 2: Copy, Clear */}
        {(transcript || response) && (
          <div className="flex gap-2">
            {response && (
              <button
                onClick={copyToClipboard}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copiedToClipboard ? "Copied!" : "Copy Response"}
              </button>
            )}
            {transcript && (
              <button
                onClick={clearTranscript}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
