import { useEffect, useRef, useState } from "react";

interface UseVoiceRecognitionProps {
  language?: string;
  onTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecognition({
  language = "en-IN",
  onTranscript,
  onError,
}: UseVoiceRecognitionProps = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const interimTranscriptRef = useRef("");

  // Initialize Web Speech API on component mount
  useEffect(() => {
    // Check browser support
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      onError?.("Speech Recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    // Set up recognition properties
    recognition.continuous = false; // Stop after user stops speaking
    recognition.interimResults = true; // Show interim results as user speaks
    recognition.lang = language;

    // Handle when speech is recognized
    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
      interimTranscriptRef.current = "";
    };

    // Handle interim and final results
    recognition.onresult = (event: any) => {
      interimTranscriptRef.current = "";

      // Combine interim and final results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          // Add space between final results
          setTranscript((prev) => prev + transcriptSegment);
        } else {
          // Accumulate interim results
          interimTranscriptRef.current += transcriptSegment;
        }
      }

      // Update UI with interim transcript while user is speaking
      if (interimTranscriptRef.current) {
        setTranscript((prev) => {
          const base =
            prev && !prev.endsWith(" ") && interimTranscriptRef.current
              ? prev + " "
              : prev;
          return base + interimTranscriptRef.current;
        });
      }
    };

    // Handle end of speech recognition
    recognition.onend = () => {
      setIsListening(false);
    };

    // Handle errors
    recognition.onerror = (event: any) => {
      const errorMessage = getErrorMessage(event.error);
      onError?.(errorMessage);
      console.error("Speech Recognition Error:", event.error);
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onError]);

  // Update language when it changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  // Trigger callback when transcript changes
  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript?.(transcript);
    }
  }, [transcript, isListening, onTranscript]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setTranscript("");
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    interimTranscriptRef.current = "";
  };

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
  };
}

/**
 * Map Web Speech API errors to user-friendly messages
 */
function getErrorMessage(error: string): string {
  const errors: Record<string, string> = {
    "no-speech":
      "No speech detected. Please try again and speak clearly into the microphone.",
    "audio-capture":
      "Microphone not found. Please check your audio device.",
    "not-allowed":
      "Microphone permission denied. Please allow microphone access.",
    "network":
      "Network error. Please check your internet connection.",
    "aborted": "Speech recognition was aborted.",
  };

  return errors[error] || `Speech Recognition Error: ${error}`;
}
