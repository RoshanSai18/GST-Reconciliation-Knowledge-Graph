import { MessageCircle, Bot, Volume2, Loader } from "lucide-react";
import { useState, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatMessageProps {
  message: Message;
  language?: string;
}

export function ChatMessage({ message, language = "en" }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Language to voice code mapping
  const getLanguageCode = (lang: string): string => {
    const langMap: Record<string, string> = {
      en: "en-IN",
      hi: "hi-IN",
      te: "te-IN",
      hi_IN: "hi-IN",
      te_IN: "te-IN",
    };
    return langMap[lang] || "en-US";
  };

  const handleSpeak = () => {
    // Cancel existing speech
    window.speechSynthesis.cancel();

    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }

    try {
      // Stop any ongoing speech first
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      // Create fresh utterance with full message
      const utterance = new SpeechSynthesisUtterance(message.content);

      const langCode = getLanguageCode(language);
      console.log("🎤 Speech Language:", language, "→ Code:", langCode);

      utterance.lang = langCode;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Log available voices
      const voices = window.speechSynthesis.getVoices();
      const matchingVoices = voices.filter((v) =>
        v.lang.includes(langCode.split("-")[0])
      );
      console.log(`📢 Found ${matchingVoices.length} voices for ${langCode}`);
      if (matchingVoices.length > 0) {
        utterance.voice = matchingVoices[0];
        console.log(`✓ Using voice: ${matchingVoices[0].name}`);
      }

      utterance.onstart = () => {
        console.log("📢 Speaking:", message.content.substring(0, 50) + "...");
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        console.log("✓ Finished speaking");
        setIsSpeaking(false);
      };

      utterance.onerror = (event) => {
        console.error("❌ Speech error:", event.error);
        setIsSpeaking(false);
      };

      // Begin speaking
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("Error in handleSpeak:", error);
      setIsSpeaking(false);
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex items-start gap-3 max-w-md group`}>
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Bot className="w-4 h-4 text-blue-600" />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div
            className={`${
              isUser
                ? "bg-blue-600 text-white rounded-2xl rounded-tr-none"
                : "bg-gray-100 text-gray-900 rounded-2xl rounded-tl-none"
            } px-4 py-3 break-words`}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
            <p
              className={`text-xs mt-2 ${
                isUser ? "text-blue-100" : "text-gray-500"
              }`}
            >
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {!isUser && (
            <button
              onClick={handleSpeak}
              className="self-start ml-0 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors flex items-center gap-2 text-xs font-medium"
              title={isSpeaking ? "Stop" : "Read aloud"}
            >
              {isSpeaking ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  <span>Playing...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Read aloud</span>
                </>
              )}
            </button>
          )}
        </div>

        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
