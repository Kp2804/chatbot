# AI-Powered Chatbot Setup Guide

Your chatbot now has AI capabilities powered by Groq! It can answer questions beyond FAQs and workflows using advanced language models.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- `groq-sdk` - Groq AI SDK
- `express` - Backend server
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management

### 2. Get Your Groq API Key

1. Visit [Groq Console](https://console.groq.com/keys)
2. Sign up or log in to your account
3. Create a new API key
4. Copy the key (it starts with `gsk_...`)

### 3. Configure Environment Variables

Open `.env` file and replace `your_groq_api_key_here` with your actual API key:

```env
GROQ_API_KEY=gsk_your_actual_key_here
```

### 4. Start the Application

**Option 1: Run both frontend and backend together (Recommended)**
```bash
npm run dev:all
```

**Option 2: Run separately**

Terminal 1 - Frontend:
```bash
npm run dev
```

Terminal 2 - Backend:
```bash
npm run backend
```

## 🎯 How It Works

1. **User sends a message** → System checks for FAQ/workflow matches
2. **No match found** → Message is sent to Groq AI backend
3. **AI generates response** → Using your chatbot's context and conversation history
4. **Response saved** → Stored in Supabase and displayed to user

## 🤖 AI Model

The chatbot uses **Llama 3.3 70B Versatile** - a fast, capable model that:
- Understands context from previous messages
- Responds in your chatbot's personality
- Provides accurate, helpful answers
- Keeps responses concise and relevant

## 🔧 Backend API

The backend server runs on `http://localhost:3001` and provides:

- **Health Check**: `GET /health`
- **Chat Completion**: `POST /api/chat`

### API Request Format

```json
{
  "message": "What are your business hours?",
  "chatbotContext": {
    "name": "Support Bot",
    "description": "Helpful customer support assistant"
  },
  "conversationHistory": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! How can I help?" }
  ]
}
```

### API Response Format

```json
{
  "response": "Our business hours are...",
  "model": "llama-3.3-70b-versatile",
  "tokensUsed": 150
}
```

## 🎨 Customization

### Change AI Model

Edit `backend/index.ts` line 66:

```typescript
model: 'llama-3.3-70b-versatile', // Change to other Groq models
```

Available models:
- `llama-3.3-70b-versatile` (Current, recommended)
- `llama-3.1-70b-versatile`
- `mixtral-8x7b-32768`
- `gemma2-9b-it`

### Adjust Response Style

Edit the system prompt in `backend/index.ts` lines 38-41:

```typescript
const systemPrompt = `You are ${chatbotContext?.name}. 
  ${chatbotContext?.description}. 
  Provide helpful, accurate, and friendly responses.
  Keep answers concise and relevant.`;
```

### Change Temperature (Creativity)

Edit `backend/index.ts` line 67:

```typescript
temperature: 0.7, // 0.0 = focused, 1.0 = creative
```

## 🔍 Troubleshooting

### "Failed to get AI response"
- Check if backend server is running (`http://localhost:3001/health`)
- Verify Groq API key is correct in `.env`
- Check console for error messages

### Backend won't start
- Make sure port 3001 is not in use
- Verify all dependencies are installed (`npm install`)
- Check `.env` file exists and has GROQ_API_KEY

### CORS errors
- Ensure backend is running on localhost:3001
- Check CORS configuration in `backend/index.ts`

## 💡 Tips

- FAQs and workflows take priority over AI responses
- AI uses last 5 messages for context
- Each API call costs tokens (check Groq pricing)
- Response times typically under 2 seconds

## 📊 Monitoring

Check backend logs for:
- API call success/failures
- Token usage per request
- Error messages

## 🔐 Security Notes

- Never commit `.env` file to git
- Keep your Groq API key private
- Use environment variables for all secrets
- Consider rate limiting for production

---

Need help? Check the [Groq Documentation](https://console.groq.com/docs) or create an issue.
