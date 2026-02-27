import { useEffect, useRef, useState } from "react";

interface UseSpeechSynthesisProps {
  language?: string;
}

export function useSpeechSynthesis({ language = "en-IN" }: UseSpeechSynthesisProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Initialize Speech Synthesis on mount
  useEffect(() => {
    const synth = window.speechSynthesis;

    if (!synth) {
      setIsSupported(false);
      console.error("Speech Synthesis not supported in this browser");
      return;
    }

    synthRef.current = synth;

    return () => {
      if (synth.speaking) {
        synth.cancel();
      }
    };
  }, []);

  /**
   * Speak the provided text
   */
  const speak = (text: string) => {
    if (!synthRef.current) {
      console.error("Speech Synthesis not available");
      return;
    }

    const synth = synthRef.current;

    // Cancel any ongoing speech
    if (synth.speaking) {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);

    // Map our language codes to voice language codes
    const voiceLanguageMap: Record<string, string> = {
      en: "en-IN",
      "en-IN": "en-IN",
      hi: "hi-IN",
      "hi-IN": "hi-IN",
      te: "te-IN",
      "te-IN": "te-IN",
    };

    utterance.lang = voiceLanguageMap[language] || "en-IN";
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;
    utterance.volume = 1;

    // Handle speech events
    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error("Speech Synthesis Error:", event.error);
      setIsSpeaking(false);
    };

    // Speak the utterance
    synth.speak(utterance);
  };

  /**
   * Stop speaking
   */
  const stop = () => {
    if (synthRef.current && synthRef.current.speaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  /**
   * Pause speaking
   */
  const pause = () => {
    if (synthRef.current && synthRef.current.speaking) {
      synthRef.current.pause();
    }
  };

  /**
   * Resume speaking
   */
  const resume = () => {
    if (synthRef.current && synthRef.current.paused) {
      synthRef.current.resume();
    }
  };

  return {
    isSpeaking,
    isSupported,
    speak,
    stop,
    pause,
    resume,
  };
}
