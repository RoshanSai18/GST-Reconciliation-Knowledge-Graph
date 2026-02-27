# Voice Assistant - Quick Start Guide

## ✅ What's Been Created

A complete voice assistant feature for your GST dashboard with:

### 🎤 Core Files Created

1. **`frontend/src/components/VoiceAssistant.tsx`** (420 lines)
   - Main React component with full UI
   - Language selector (English, Hindi, Telugu)
   - Mic button with listening indicator
   - Transcript display area
   - AI response display
   - Auto-speak toggle
   - Copy & clear buttons
   - Error handling

2. **`frontend/src/hooks/useVoiceRecognition.ts`** (130 lines)
   - Web Speech API integration
   - Real-time transcript capture
   - Language support
   - Error handling with user-friendly messages
   - Browser compatibility check

3. **`frontend/src/hooks/useSpeechSynthesis.ts`** (100 lines)
   - Speech Synthesis API integration
   - Multi-language voice support
   - Play, pause, stop controls
   - Adjustable speech rate

4. **`frontend/src/lib/chatbot.ts`** (40 lines)
   - Helper functions for chatbot API calls
   - Error handling
   - Session management support

5. **`frontend/src/pages/VoiceAssistantPage.tsx`** (60 lines)
   - Full page integration example
   - Help section with instructions
   - Ready to use

6. **`frontend/src/components/VoiceAssistant.css`** (20 lines)
   - Animation styles for listening indicator
   - Pulse effect for visual feedback

### 🔧 Updated Files

- **`frontend/src/App.tsx`** - Added VoiceAssistantPage route at `/voice`
- **`frontend/src/components/layout/Sidebar.tsx`** - Added Voice Assistant navigation link

### 📚 Documentation

- **`VOICE_ASSISTANT_DOCS.md`** - Complete feature documentation (500+ lines)

---

## 🚀 How to Use

### 1. Access the Voice Assistant
- Open the app at `http://localhost:5173`
- Look for **"Voice Assistant"** in the sidebar with mic icon
- Click to open the full page

### 2. How It Works

```
1. Click "Start Listening" → Begin speaking
2. See your speech as transcript in real-time
3. Click "Send" → Message goes to AI
4. See response appear
5. If "Auto" is ON → Response reads aloud automatically
6. If "Auto" is OFF → Click speaker button to hear
```

### 3. Multi-Language Support

Select from dropdown:
- **English** 🇮🇳 (en-IN)
- **हिंदी** (hi-IN) - Hindi
- **తెలుగు** (te-IN) - Telugu

Both speech recognition AND text-to-speech work in selected language.

### 4. Example Usage Code

```typescript
// Simple integration
import { VoiceAssistant } from "@/components/VoiceAssistant"
import { sendMessageToChatbot } from "@/lib/chatbot"

export function MyPage() {
  return (
    <VoiceAssistant sendMessageToChatbot={sendMessageToChatbot} />
  )
}
```

---

## 🎯 Features Overview

| Feature | Status | Details |
|---------|--------|---------|
| Mic Button | ✅ | Start/stop listening with visual feedback |
| Live Transcript | ✅ | Real-time text as you speak |
| Listening Indicator | ✅ | Animated pulse dots while listening |
| Language Selector | ✅ | English, Hindi, Telugu |
| Send to Chatbot | ✅ | Integration with existing API |
| Auto-Speak | ✅ | Toggle ON/OFF for response audio |
| Manual Speaker | ✅ | Click button to hear response |
| Error Handling | ✅ | User-friendly error messages |
| Copy Response | ✅ | One-click copy to clipboard |
| Clear Transcript | ✅ | Reset for new message |
| Keyboard Access | ✅ | All buttons are accessible |
| Browser Support | ✅ | Chrome, Edge, Safari (uses Web APIs) |

---

## 🔧 API Integration

The component calls the existing chatbot endpoint:

**Endpoint:** `POST /api/chat/message`

**Parameters:**
```javascript
{
  message: "What is GST?",           // Transcript from voice
  language: "en"                     // Selected language code
}
```

**Response:**
```javascript
{
  response: "GST is...",             // AI response
  session_id: "session_123456",      // For conversation continuity
  message_count: 1
}
```

---

## 🎨 UI Components

### Buttons
- **Mic Button** (Start/Stop) - Blue when idle, Red when active
- **Send Button** - Green (enabled) / Gray (disabled)
- **Speaker Button** - Plays response audio
- **Copy Button** - Shows "Copied!" feedback for 2 seconds
- **Clear Button** - Removes transcript

### Indicators
- **Listening Indicator** - 3 pulsing dots (animated)
- **Loading Indicator** - Spinner while sending
- **Error Display** - Red box with error message

### Displays
- **Transcript Area** - Gray box, text updates in real-time
- **Response Area** - Blue box, shows AI response
- **Language Selector** - Dropdown for lang selection

---

## 🌐 Browser Compatibility

### Speech Recognition (Microphone Input)
| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Yes | Uses `webkitSpeechRecognition` |
| Edge | ✅ Yes | Full support |
| Safari | ✅ Yes | Full support |
| Firefox | ⚠️ Limited | Partial support |
| IE/IE11 | ❌ No | Not supported |

### Speech Synthesis (Audio Output)
| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Yes | All languages |
| Edge | ✅ Yes | All languages |
| Safari | ✅ Yes | All languages |
| Firefox | ✅ Yes | All languages |
| IE/IE11 | ❌ No | Not supported |

**No External APIs Used** - Everything runs locally in the browser!

---

## 🎯 Example Queries to Try

### English
- "What is GST reconciliation?"
- "How do I claim ITC?"
- "What's the difference between GSTR-1 and GSTR-2B?"

### Hindi
- "GST सामंजस्य क्या है?"
- "मैं ITC का दावा कैसे करूँ?"
- "GSTR-1 और GSTR-2B में क्या अंतर है?"

### Telugu
- "GST సమన్వయం అంటే ఏమిటి?"
- "నేను ITC కోసం దరఖాస్తు చేయడం ఎలా?"
- "GSTR-1 మరియు GSTR-2B మధ్య తేడా ఏమిటి?"

---

## 🛠️ Advanced Usage

### With Session Management (Conversation Memory)

```typescript
import { useState } from "react"
import { VoiceAssistant } from "@/components/VoiceAssistant"
import { sendMessageWithSession } from "@/lib/chatbot"

export function AdvancedPage() {
  const [sessionId, setSessionId] = useState<string>()

  const handleChat = async (msg: string, lang: string) => {
    const { response, sessionId: newId } = await sendMessageWithSession(
      msg,
      lang,
      sessionId
    )
    setSessionId(newId)  // Keep conversation context
    return response
  }

  return <VoiceAssistant sendMessageToChatbot={handleChat} />
}
```

### With Custom Error Handler

```typescript
const handleChat = async (message: string, language: string) => {
  try {
    const response = await sendMessageToChatbot(message, language)
    // Track analytics
    logEvent('chat_success', { language })
    return response
  } catch (error) {
    // Custom error handling
    logEvent('chat_error', { language, error: error.message })
    throw error
  }
}
```

---

## 📊 Component Props

```typescript
interface VoiceAssistantProps {
  // Function to send message to chatbot
  // Should return Promise<string> with AI response
  sendMessageToChatbot: (message: string, language: string) => Promise<string>
  
  // Optional: Custom title
  title?: string  // Default: "Voice Assistant"
}
```

**Example Props Usage:**

```tsx
<VoiceAssistant
  sendMessageToChatbot={sendMessageToChatbot}
  title="GST Expert Voice Assistant"
/>
```

---

## 🐛 Troubleshooting

### Mic not working?
1. Check browser permissions (Settings → Privacy → Microphone)
2. Ensure microphone is physically connected
3. Test with online speech recognition demo first
4. Try different browser (Chrome recommended)

### No voice output after speaking?
1. Check system volume isn't muted
2. Enable "Auto" toggle or click speaker button
3. Some languages may not have voices on your OS
4. Try English first to test

### Transcript isn't showing?
1. Speak louder and clearer
2. Reduce background noise
3. Ensure microphone permission is granted
4. Check browser console for errors

### Response not appearing?
1. Check internet connection
2. Backend must be running (port 8000)
3. Check browser console for API errors
4. Verify GEMINI_API_KEY is set in backend

---

## 🔐 Security & Privacy

✅ **No External APIs Used**
- Speech recognition: Browser built-in (local processing where possible)
- Speech synthesis: Browser built-in
- Only message content sent to backend chatbot API
- No recording of audio saved locally

✅ **User Controls**
- Microphone permission required (browser enforces)
- User can stop listening anytime
- Can clear transcript/response
- Auto-speak toggle for control

---

## 📈 Performance

- **Speech Recognition**: Real-time, browser native
- **Message Sending**: Single HTTP POST to `/api/chat/message`
- **Response Time**: Usually 1-3 seconds depending on Gemini API
- **Audio Output**: Instant (uses browser native synthesis)
- **Memory**: Properly cleaned up on component unmount

---

## 🎓 Learning Resources

For understanding the APIs used:

1. **Web Speech API Documentation**
   - https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

2. **Speech Recognition Interface**
   - https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

3. **Speech Synthesis Interface**
   - https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis

4. **React Hooks**
   - https://react.dev/reference/react

---

## 💡 Tips & Tricks

1. **Combination Input** - You can mix voice and text:
   - Speak most of the message, then manually edit
   - Send, then speak follow-up question

2. **Language Switching** - Change language between messages:
   - Ask in English, then switch to Hindi for response

3. **Copy & Share** - Easily share responses:
   - Copy button lets you paste into docs/emails

4. **Accessibility** - Use keyboard only:
   - Tab to button, Enter to click
   - All keyboard accessible

---

## 🚀 What's Next?

Ready to extend? Some ideas:

1. Add conversation history persistence
2. Export chat as PDF report
3. Integrate with dashboard (show related documents)
4. Add custom wake words
5. Confidence score display
6. Multiple simultaneous conversations
7. Speech-to-speech mode (voice-in, voice-out only)

---

## 📞 Support

For issues or questions:

1. Check **VOICE_ASSISTANT_DOCS.md** for detailed docs
2. Review error messages in component
3. Check browser console for technical errors
4. Verify backend is running (port 8000)
5. Test in Chrome (best browser support)

---

**Enjoy your voice-enabled GST assistant! 🎉**
