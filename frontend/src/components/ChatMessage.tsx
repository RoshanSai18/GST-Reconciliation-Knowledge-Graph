import { ShieldCheck, Volume2, Loader, UserCircle } from "lucide-react";
import { useState } from "react";

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

  const getLanguageCode = (lang: string): string => {
    const langMap: Record<string, string> = {
      en: "en-IN", hi: "hi-IN", te: "te-IN",
      hi_IN: "hi-IN", te_IN: "te-IN",
    };
    return langMap[lang] || "en-US";
  };

  const handleSpeak = () => {
    window.speechSynthesis.cancel();
    if (isSpeaking) { setIsSpeaking(false); return; }
    try {
      const utterance = new SpeechSynthesisUtterance(message.content);
      const langCode = getLanguageCode(language);
      utterance.lang = langCode;
      utterance.rate = 0.9;
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.lang.includes(langCode.split("-")[0]));
      if (match) utterance.voice = match;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch { setIsSpeaking(false); }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className="flex items-start gap-2.5 max-w-[75%]">
        {/* Advisor avatar */}
        {!isUser && (
          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent-lt border border-accent/20 flex items-center justify-center mt-0.5">
            <ShieldCheck size={13} className="text-accent" />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {/* Label */}
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
            isUser ? "text-right text-muted" : "text-muted"
          }`}>
            {isUser ? "You" : "GST Advisory"}
          </span>

          {/* Bubble */}
          <div className={`px-4 py-3 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? "bg-accent text-white rounded-tr-sm"
              : "bg-surface border border-[#E4E4E7] text-foreground rounded-tl-sm shadow-sm"
          }`}>
            {message.content}
          </div>

          {/* Footer row */}
          <div className={`flex items-center gap-2 ${ isUser ? "justify-end" : "justify-start" }`}>
            <span className="text-[10px] text-subtle">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            {!isUser && (
              <button
                onClick={handleSpeak}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted hover:text-accent hover:bg-accent-lt transition-all"
                title={isSpeaking ? "Stop" : "Read aloud"}
              >
                {isSpeaking ? (
                  <><Loader size={10} className="animate-spin" /><span>Playing</span></>
                ) : (
                  <><Volume2 size={10} /><span>Read aloud</span></>
                )}
              </button>
            )}
          </div>
        </div>

        {/* User avatar */}
        {isUser && (
          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent flex items-center justify-center mt-0.5">
            <UserCircle size={13} className="text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
