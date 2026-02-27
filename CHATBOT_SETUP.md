# GST Reconciliation AI Chatbot Setup Guide

## Overview
The chatbot feature integrates Google's Gemini AI to provide expert guidance on GST reconciliation, invoice matching, and tax compliance issues.

## Architecture

### Backend Components
- **`services/chatbot/gemini_client.py`**: Wrapper for Google Generative AI API
- **`services/chatbot/gst_assistant.py`**: GST domain-specific assistant with system prompts
- **`services/chatbot/history.py`**: Conversation history management
- **`routers/chat.py`**: FastAPI endpoints for chat functionality

### Frontend Components
- **`pages/ChatPage.tsx`**: Chat page layout
- **`components/ChatWindow.tsx`**: Main chat UI with input and message display
- **`components/ChatMessage.tsx`**: Individual message rendering (user/assistant)
- **`lib/api.ts`**: API client for chat endpoints

## Setup Instructions

### 1. Backend Setup

#### Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

The `google-generativeai==0.3.0` package will be installed automatically.

#### Configure Environment Variables
Create or update your `.env` file in the backend directory:

```env
# Google Gemini API Key
GEMINI_API_KEY=your_actual_api_key_here

# Neo4j Configuration (existing)
NEO4J_URI=neo4j+ssc://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

# FastAPI Configuration (existing)
APP_TITLE=GST Reconciliation Knowledge Graph
APP_VERSION=1.0.0
```

#### Get Your Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com)
2. Click "Get API Key"
3. Create a new API key in Google Cloud Console
4. Copy the key and add to your `.env` file

### 2. Frontend Setup (Already Complete)

The React components are already integrated. The app will show:
- Chat icon in the sidebar navigation
- Chat page at `/chat` route
- Full chat UI with message history

### 3. Testing the Setup

#### Check Chatbot Health
```bash
curl http://localhost:8000/api/chat/health
```

Expected response:
```json
{
  "status": "healthy",
  "assistant_available": true,
  "active_sessions": 0
}
```

#### Send a Test Message
```bash
curl -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d {
    "message": "What is GST reconciliation?",
    "language": "en"
  }
```

#### From Frontend
1. Navigate to the Chat Bot page in sidebar
2. Type a question about GST
3. Send and see the AI response

## API Endpoints

### POST `/api/chat/message`
Send a message to the assistant.

**Request:**
```json
{
  "message": "How do I match GSTR-1 and GSTR-2B invoices?",
  "language": "en",
  "session_id": "optional_session_id"
}
```

**Response:**
```json
{
  "response": "To match GSTR-1 and GSTR-2B invoices...",
  "session_id": "session_123456",
  "message_count": 2
}
```

### DELETE `/api/chat/session/{session_id}`
Clear conversation history for a session.

**Response:**
```json
{
  "message": "Session cleared"
}
```

### GET `/api/chat/health`
Check chatbot availability.

**Response:**
```json
{
  "status": "healthy",
  "assistant_available": true,
  "active_sessions": 1
}
```

## Features

### System Prompt
The assistant is configured with a specialized system prompt that includes expertise in:
- GST reconciliation between invoices, GSTR-1, GSTR-2B, and GSTR-3B
- ITC (Input Tax Credit) eligibility and issues
- Invoice matching and discrepancies
- Tax liability calculation
- GST compliance guidance
- Amendment chains and invoice modifications

### Conversation Context
- Each session maintains conversation history
- Responses consider previous messages for context
- Last 6 messages included in context for efficiency
- Sessions can be cleared manually

### Multi-Language Support
- English (en) - default
- Hindi (hi) - ready to use
- Extensible for additional languages

### Error Handling
- Graceful fallback if API key is missing
- Proper error messages to user
- Optional import handling for google-generativeai

## Troubleshooting

### "Assistant not available" Error
**Cause**: GEMINI_API_KEY not set or invalid

**Solution**:
1. Verify API key is set in `.env`
2. Check API key is valid in [Google AI Studio](https://aistudio.google.com)
3. Restart the backend server after updating `.env`

### Import Error for google-generativeai
**Cause**: Package not installed

**Solution**:
```bash
pip install google-generativeai==0.3.0
```

### Chat takes too long to respond
**Cause**: API rate limiting or slow connection

**Solution**:
- Check internet connection
- Wait before sending another message
- Check Gemini API quota in Google Cloud Console

### Session not persisting
**Cause**: Server restarted or session expired

**Solution**:
- Session state is in-memory (lost on server restart)
- For production, implement database-backed session storage
- Currently designed for single-session usage

## Future Enhancements

1. **Persistent Storage**: Save conversations to database
2. **Context Integration**: Include relevant invoice/GSTR data in responses
3. **Multi-User Sessions**: Support multiple concurrent chat sessions
4. **Feedback Loop**: Rate responses and improve system prompts
5. **Knowledge Base**: Integrate with FAQ and documentation
6. **PDF Export**: Download conversation history
7. **Advanced Analytics**: Track common questions and issues

## Security Considerations

1. **API Key Protection**: Never commit `.env` to version control
2. **Rate Limiting**: Implement request rate limiting in production
3. **Session Management**: Use secure session tokens with expiration
4. **Input Validation**: Validate all user inputs (already done via Pydantic)
5. **HTTPS**: Use HTTPS in production
6. **Token Scope**: Use minimal permission scope for API key

## Cost Estimation

Google Gemini API pricing (as of current time):
- **Free tier**: 60 requests per minute
- **Paid tier**: $0.075 per 1M input tokens, $0.30 per 1M output tokens

For GST reconciliation queries (avg ~500 input tokens, ~200 output tokens):
- ~1000 conversations/month would cost ~$0.50-$1.00

Check [Google AI Pricing](https://ai.google.dev/pricing) for latest rates.

## References

- [Google Generative AI Documentation](https://google-generativeai-python.readthedocs.io/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [React Documentation](https://react.dev/)
