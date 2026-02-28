import { useEffect, useRef, useState } from "react";
import { Send, AlertCircle, Loader, Mic, Square, ShieldCheck, Trash2, FileSearch } from "lucide-react";
import { api } from "../lib/api";
import { ChatMessage } from "./ChatMessage";
import { useVoiceRecognition } from "../hooks/useVoiceRecognition";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const QUICK_QUERIES = [
  "Why is my ITC claim mismatching with GSTR-2B?",
  "How do I resolve invoice amendments in GSTR-1?",
  "What causes GSTR-3B vs GSTR-1 discrepancy?",
  "Explain reverse charge mechanism under GST",
  "How to identify circular trading patterns?",
]

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const languageMap: Record<string, string> = { en: "en-IN", hi: "hi-IN", te: "te-IN" };
  const { isListening, transcript, toggleListening, clearTranscript } =
    useVoiceRecognition({ language: languageMap[language] || "en-IN" });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMessage: Message = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    clearTranscript();
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const response = await api.post("/chat/message", { message: text, language, session_id: sessionId });
      if (response.data.session_id) setSessionId(response.data.session_id);
      setMessages(prev => [...prev, { role: "assistant", content: response.data.response, timestamp: new Date().toISOString() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process query");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  const handleClearHistory = async () => {
    if (!sessionId) return;
    try {
      await api.delete(`/chat/session/${sessionId}`);
      setMessages([]); setSessionId(null); setError(null);
    } catch { /* ignore */ }
  };

  return (
    <div className="h-full flex flex-col bg-surface rounded-2xl" style={{ border: '1px solid #E4E4E7' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E4E4E7' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent-lt border border-accent/20 flex items-center justify-center">
            <ShieldCheck size={15} className="text-accent" />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-foreground leading-tight">GST Compliance Query</h2>
            <p className="text-[11px] text-muted">Reconciliation · ITC · Returns · Compliance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted hover:text-foreground hover:bg-bg transition-all"
              style={{ border: '1px solid #E4E4E7' }}
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-bg text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
            style={{ border: '1px solid #E4E4E7' }}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="te">తెలుగు</option>
          </select>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 py-8">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-accent-lt border border-accent/20 flex items-center justify-center">
              <FileSearch size={24} className="text-accent" />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold text-foreground">GST Compliance Advisory</p>
              <p className="text-[12px] text-muted mt-1">Query reconciliation issues, ITC mismatches, filing disputes, and more.</p>
            </div>

            {/* Quick query chips */}
            <div className="w-full max-w-lg flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle text-center mb-1">Common Queries</p>
              {QUICK_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-[12px] text-foreground bg-bg hover:bg-accent-lt hover:text-accent font-medium transition-all"
                  style={{ border: '1px solid #E4E4E7' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} language={language} />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-accent-lt border border-accent/20 flex items-center justify-center mt-0.5">
                    <ShieldCheck size={13} className="text-accent" />
                  </div>
                  <div className="px-4 py-3 rounded-xl rounded-tl-sm bg-surface border text-[13px] text-muted flex items-center gap-2" style={{ borderColor: '#E4E4E7' }}>
                    <Loader size={13} className="animate-spin text-accent" />
                    <span>Processing query…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-5 mb-3 flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-[12px]" style={{ border: '1px solid #FCA5A5' }}>
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-5 pb-5" style={{ borderTop: '1px solid #E4E4E7', paddingTop: '1rem' }}>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Voice */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={loading}
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isListening
                ? "bg-red-500 text-white shadow-sm"
                : "bg-bg text-muted hover:text-foreground hover:bg-accent-lt"
            } disabled:opacity-40`}
            style={{ border: '1px solid #E4E4E7' }}
            title={isListening ? "Stop voice input" : "Start voice input"}
          >
            {isListening ? <Square size={14} /> : <Mic size={14} />}
          </button>

          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={isListening ? "Listening…" : "Enter your GST query…"}
            disabled={loading}
            className="flex-1 h-9 px-4 text-[13px] text-foreground placeholder:text-subtle bg-bg rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50 transition-all"
            style={{ border: '1px solid #E4E4E7' }}
          />

          {/* Send */}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center shadow-glow hover:bg-accent-h hover:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
