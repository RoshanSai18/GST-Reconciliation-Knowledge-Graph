# Voice Assistant Feature Documentation

## Overview

The Voice Assistant is a fully-featured voice interface that allows users to:
- 🎤 **Speak queries** using their microphone (Web Speech API)
- 📝 **See live transcripts** as they speak
- 💬 **Send messages** to the GST AI chatbot
- 🔊 **Hear responses** read aloud (Speech Synthesis API)
- 🌐 **Multi-language support** - English, Hindi, Telugu

## Architecture

### Components

#### 1. **VoiceAssistant.tsx** (Main Component)
Located: `frontend/src/components/VoiceAssistant.tsx`

The main UI component that orchestrates all voice features:
- Microphone control button (start/stop listening)
- Language selector dropdown
- Real-time transcript display
- Chat response area
- Auto-speak toggle
- Error handling and user feedback

**Props:**
```typescript
interface VoiceAssistantProps {
  sendMessageToChatbot: (message: string, language: string) => Promise<string>
  title?: string
}
```

**Usage:**
```tsx
<VoiceAssistant 
  sendMessageToChatbot={sendMessageToChatbot}
  title="Voice Assistant"
/>
```

#### 2. **useVoiceRecognition.ts** (Custom Hook)
Located: `frontend/src/hooks/useVoiceRecognition.ts`

Manages the Web Speech API for speech-to-text conversion.

**Features:**
- Uses `SpeechRecognition` API (or `webkitSpeechRecognition` for Chrome)
- Continuous listening mode with interim results
- Automatic language selection
- Real-time transcript feedback
- Error handling with user-friendly messages

**Returns:**
```typescript
{
  isListening: boolean              // Currently listening
  transcript: string                // Current transcript
  isSupported: boolean              // Browser support check
  startListening: () => void        // Start recognition
  stopListening: () => void         // Stop recognition
  toggleListening: () => void       // Toggle on/off
  clearTranscript: () => void       // Reset transcript
}
```

#### 3. **useSpeechSynthesis.ts** (Custom Hook)
Located: `frontend/src/hooks/useSpeechSynthesis.ts`

Manages the Speech Synthesis API for text-to-speech.

**Features:**
- Uses Web Speech Synthesis API
- Language-specific voices
- Adjustable speech rate and pitch
- Play, pause, resume, and stop controls
- Error handling

**Returns:**
```typescript
{
  isSpeaking: boolean      // Currently speaking
  isSupported: boolean     // Browser support check
  speak: (text: string) => void    // Speak text
  stop: () => void                 // Stop speaking
  pause: () => void                // Pause speaking
  resume: () => void               // Resume speaking
}
```

#### 4. **VoiceAssistantPage.tsx** (Page Component)
Located: `frontend/src/pages/VoiceAssistantPage.tsx`

Full-page integration example showing:
- VoiceAssistant component
- Help section with instructions
- Integration with chatbot API

### Utility Functions

#### **sendMessageToChatbot()** - `lib/chatbot.ts`

Simple wrapper around the chatbot API:
```typescript
export async function sendMessageToChatbot(
  message: string,
  language: string
): Promise<string>
```

**Usage:**
```typescript
try {
  const response = await sendMessageToChatbot("What is GST?", "en");
  console.log(response);
} catch (error) {
  console.error("Error:", error);
}
```

## State Management

The VoiceAssistant component maintains:

```typescript
const [selectedLanguage, setSelectedLanguage] = useState("en")  // en, hi, te
const [response, setResponse] = useState("")                     // AI response
const [error, setError] = useState("")                          // Error messages
const [autoSpeak, setAutoSpeak] = useState(true)               // Auto TTS toggle
const [loading, setLoading] = useState(false)                  // API loading state
const [copiedToClipboard, setCopiedToClipboard] = useState()   // Copy feedback
```

## Browser Compatibility

### Required APIs:
- **Web Speech API** (SpeechRecognition)
  - Chrome/Edge: ✅ Full support (using `webkitSpeechRecognition`)
  - Safari: ✅ Full support
  - Firefox: ⚠️ Limited support
  - IE: ❌ Not supported

- **Speech Synthesis API** (SpeechSynthesis)
  - Chrome/Edge: ✅ Full support
  - Safari: ✅ Full support
  - Firefox: ✅ Full support
  - IE: ❌ Not supported

### Fallback:
If Speech Recognition or Synthesis is not supported, the component displays:
```
⚠️ Voice features are not supported in your browser. 
   Please use Chrome, Edge, or Safari.
```

## Language Support

The component supports three languages with region-specific voices:

| Language | Code | Voice Code | Supported Devices |
|----------|------|-----------|------------------|
| English  | en   | en-IN     | Windows, Mac, Linux |
| Hindi    | hi   | hi-IN     | Windows, Mac, Linux |
| Telugu   | te   | te-IN     | Windows, Mac, Linux |

**Note:** Actual voice availability depends on the operating system. Some systems may not have all language voices installed.

## Flow Diagram

```
User speaks
    ↓
Web Speech API captures audio
    ↓
Transcript displayed in real-time
    ↓
User clicks "Send"
    ↓
Message sent to chatbot API
    ↓
AI response received
    ↓
If "Auto" enabled → Speech Synthesis reads response aloud
    ↓
Response displayed in UI
```

## Error Handling

### Speech Recognition Errors

| Error | Cause | User Message |
|-------|-------|--------------|
| no-speech | No speech detected in silence | "No speech detected. Please try again..." |
| audio-capture | Microphone not available | "Microphone not found. Please check..." |
| not-allowed | Mic permission denied | "Microphone permission denied. Please allow..." |
| network | Network connectivity issue | "Network error. Please check internet..." |
| aborted | User or app stopped listening | "Speech recognition was aborted." |

### API Errors

- Missing message → "Please speak something..."
- Chatbot API failure → Error message displayed with retry option
- Speech synthesis silence → No error, just silent

## UI Components & Styling

### Button States

**Microphone Button:**
- Not listening: Blue button
- Listening: Red button with pulse animation
- Disabled: Gray button

**Send Button:**
- Has transcript: Green button (clickable)
- No transcript: Gray button (disabled)
- Loading: Shows spinner

**Speaker Button:**
- No response: Gray button (disabled)
- Has response, not speaking: Green button
- Currently speaking: Orange button with "Stop" state

### Visual Feedback

- **Listening Indicator**: Three pulsing dots (red) animate while listening
- **Loading State**: Spinner shown while sending message
- **Copy Feedback**: Button text changes to "Copied!" for 2 seconds
- **Transcript Display**: Text shown in gray box with light background
- **Response Display**: Text shown in blue box with light blue background

## Accessibility Features

- ✅ ARIA labels on buttons (`aria-label`)
- ✅ Keyboard accessible (buttons are focusable)
- ✅ Clear visual states for button status
- ✅ Error messages displayed for users using screen readers
- ✅ High contrast colors (dark text on light backgrounds)

## Integration Examples

### Basic Integration

```tsx
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { sendMessageToChatbot } from "@/lib/chatbot";

function MyPage() {
  return (
    <VoiceAssistant sendMessageToChatbot={sendMessageToChatbot} />
  );
}
```

### Advanced Integration with Session Management

```tsx
import { useState } from "react";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { sendMessageWithSession } from "@/lib/chatbot";

function MyAdvancedPage() {
  const [sessionId, setSessionId] = useState<string | undefined>();

  const handleSendMessage = async (message: string, language: string) => {
    const { response, sessionId: newSessionId } = await sendMessageWithSession(
      message,
      language,
      sessionId
    );
    setSessionId(newSessionId); // Maintain session continuity
    return response;
  };

  return (
    <VoiceAssistant sendMessageToChatbot={handleSendMessage} />
  );
}
```

### With Custom Error Handling

```tsx
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { sendMessageToChatbot } from "@/lib/chatbot";

function MyCustomPage() {
  const handleSendMessage = async (message: string, language: string) => {
    try {
      return await sendMessageToChatbot(message, language);
    } catch (error) {
      // Custom error handling
      if (error instanceof Error) {
        logErrorToAnalytics(error.message);
      }
      throw error; // Re-throw for component to handle
    }
  };

  return (
    <VoiceAssistant sendMessageToChatbot={handleSendMessage} />
  );
}
```

## Performance Considerations

1. **Speech Recognition** - Uses browser's native implementation (no external calls)
2. **Speech Synthesis** - Uses browser's native voices (no external calls)
3. **Chatbot API** - Single HTTP POST request to backend
4. **Message Clearing** - State reset prevents memory leaks
5. **Event Cleanup** - Recognition reference properly cleaned up on unmount

## Troubleshooting

### "Voice features are not supported"
- **Cause**: Browser doesn't support Web Speech API
- **Fix**: Use Chrome, Edge, or Safari

### Microphone permission denied
- **Cause**: User blocked microphone access
- **Fix**: Check browser settings → Privacy → Microphone permissions

### No speech detected
- **Cause**: User didn't speak or spoke too quietly
- **Fix**: Ensure microphone is working and speak clearly

### Response not reading aloud
- **Cause**: "Auto" toggle is OFF, or no voice available for language
- **Fix**: Enable "Auto" toggle or check OS language settings

### Incorrect language transcript
- **Cause**: Selected language doesn't match spoken language
- **Fix**: Select the correct language before speaking

## Future Enhancements

Potential improvements:
- [ ] Voice confidence score display
- [ ] Speech rate adjustment slider
- [ ] Conversation history persistence
- [ ] Export conversation as PDF
- [ ] Custom wake words
- [ ] Sound effect indicators
- [ ] Advanced noise suppression
- [ ] Offline speech recognition (service worker)

## Browser DevTools Tips

### Test Speech Recognition
```javascript
// In browser console
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.onresult = (e) => console.log(e.results[0][0].transcript);
recognition.start();
```

### Test Speech Synthesis
```javascript
// In browser console
const utterance = new SpeechSynthesisUtterance("Hello world");
utterance.lang = "en-IN";
window.speechSynthesis.speak(utterance);
```

## File Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── VoiceAssistant.tsx          # Main component
│   ├── hooks/
│   │   ├── useVoiceRecognition.ts      # Speech-to-text hook
│   │   └── useSpeechSynthesis.ts       # Text-to-speech hook
│   ├── lib/
│   │   └── chatbot.ts                  # API utilities
│   ├── pages/
│   │   └── VoiceAssistantPage.tsx      # Full page integration
│   └── App.tsx                          # Routes
```

## API Integration

The Voice Assistant integrates with the existing chatbot API:

**Endpoint:** `POST /api/chat/message`

**Request:**
```json
{
  "message": "What is GST reconciliation?",
  "language": "en"
}
```

**Response:**
```json
{
  "response": "GST reconciliation is...",
  "session_id": "session_123456",
  "message_count": 1
}
```

## Testing Checklist

- [ ] Microphone permission request appears
- [ ] Transcript updates in real-time while speaking
- [ ] Transcript clears when starting new recording
- [ ] Send button disabled when no transcript
- [ ] Loading spinner shows while sending
- [ ] Response displays properly
- [ ] Auto-speak works when toggle is ON
- [ ] Manual speaker button works
- [ ] Language change updates both TTS and STT
- [ ] Error messages display clearly
- [ ] Copy button works and shows feedback
- [ ] Clear button removes transcript
- [ ] All buttons are keyboard accessible
- [ ] Component works on Chrome, Edge, Safari
- [ ] Proper cleanup on component unmount
