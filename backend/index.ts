import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Rate limiting: 50 messages per user per day
const MESSAGE_LIMIT_PER_DAY = 50;
const userMessageCounts = new Map<string, { count: number; resetTime: number }>();

// Middleware to track and limit user messages
const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Get user identifier (IP address + user agent for uniqueness)
  const userIdentifier = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  const userId = `${userIdentifier}-${userAgent}`.substring(0, 100);
  
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  let userData = userMessageCounts.get(userId);
  
  // Reset if 24 hours have passed
  if (!userData || now > userData.resetTime) {
    userData = {
      count: 0,
      resetTime: now + oneDayMs
    };
    userMessageCounts.set(userId, userData);
  }
  
  // Check if user has exceeded limit
  if (userData.count >= MESSAGE_LIMIT_PER_DAY) {
    const hoursUntilReset = Math.ceil((userData.resetTime - now) / (1000 * 60 * 60));
    return res.status(429).json({ 
      error: 'Daily message limit reached',
      message: `You have reached the daily limit of ${MESSAGE_LIMIT_PER_DAY} messages. Please try again in ${hoursUntilReset} hour(s).`,
      limit: MESSAGE_LIMIT_PER_DAY,
      remaining: 0,
      resetIn: hoursUntilReset
    });
  }
  
  // Increment counter
  userData.count++;
  userMessageCounts.set(userId, userData);
  
  // Add usage info to response headers
  res.setHeader('X-RateLimit-Limit', MESSAGE_LIMIT_PER_DAY.toString());
  res.setHeader('X-RateLimit-Remaining', (MESSAGE_LIMIT_PER_DAY - userData.count).toString());
  res.setHeader('X-RateLimit-Reset', new Date(userData.resetTime).toISOString());
  
  next();
};

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, userData] of userMessageCounts.entries()) {
    if (now > userData.resetTime + 24 * 60 * 60 * 1000) {
      userMessageCounts.delete(userId);
    }
  }
}, 60 * 60 * 1000);

app.use(cors());
app.use(express.json());

// Health check endpoint (no rate limit)
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Chatbot backend is running',
    rateLimit: {
      messagesPerDay: MESSAGE_LIMIT_PER_DAY,
      activeUsers: userMessageCounts.size
    }
  });
});

// Chat completion endpoint (with rate limiting)
app.post('/api/chat', rateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { message, chatbotContext, conversationHistory, userName } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build system prompt with chatbot context and user name
    let systemPrompt = `You are ${chatbotContext?.name || 'a helpful AI assistant'}. ${
      chatbotContext?.description ? chatbotContext.description + '. ' : ''
    }You provide helpful, accurate, and friendly responses. Keep your answers concise and relevant.`;
    
    // Add personalization instruction if user name is available
    if (userName && userName.trim()) {
      const firstName = userName.trim().split(' ')[0]; // Get first name
      systemPrompt += ` When appropriate, address the user by their name: ${firstName}. Use their name naturally in conversation, especially in greetings and when emphasizing points.`;
    }

    // Prepare messages for Groq
    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history if provided (last 5 messages for context)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-5);
      recentHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile', // Fast and capable model
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false
    });

    const aiResponse = completion.choices[0]?.message?.content || 
      "I'm sorry, I couldn't generate a response. Please try again.";

    res.json({ 
      response: aiResponse,
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens || 0
    });

  } catch (error: any) {
    console.error('Error calling Groq API:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI response',
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🤖 Chatbot backend running on http://localhost:${PORT}`);
  console.log(`✅ Groq API key configured: ${!!process.env.GROQ_API_KEY}`);
});
