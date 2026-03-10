import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
// Import directly from lib to skip pdf-parse's broken startup self-test
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = _require('pdf-parse/lib/pdf-parse.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Initialize Supabase admin client (service key bypasses RLS for server-side ops)
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// ── Multer: memory storage, PDF only, 5 MB max ──────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      (cb as any)(new Error('Only PDF files are allowed'));
    }
  }
});

// ── Local embedding pipeline (@xenova/transformers, ~80 MB, cached) ──────────
let embeddingPipeline: any = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    const { pipeline } = await import('@xenova/transformers');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingPipeline;
}

async function embedText(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// Warm up on start (non-blocking)
getEmbeddingPipeline().catch(() => {});

// ── Text chunker ─────────────────────────────────────────────────────────────
function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const cleaned = para.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    if (!current) {
      current = cleaned;
    } else if ((current + '\n\n' + cleaned).length <= chunkSize) {
      current += '\n\n' + cleaned;
    } else {
      chunks.push(current.trim());
      const overlapText = current.length > overlap ? current.slice(-overlap) : current;
      current = overlapText + '\n\n' + cleaned;
    }
  }
  if (current.trim().length >= 20) chunks.push(current.trim());
  return chunks;
}

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
    const { message, chatbotContext, conversationHistory, userName, chatbotId, conversationId } = req.body;

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

    // ── RAG: retrieve relevant knowledge base chunks ─────────────────────────
    if (chatbotId && supabaseAdmin) {
      try {
        const queryEmbedding = await embedText(message);
        const { data: chunks, error: rpcError } = await supabaseAdmin.rpc('match_document_chunks', {
          query_embedding: queryEmbedding,
          match_chatbot_id: chatbotId,
          match_conversation_id: conversationId || null,
          match_count: 5,
          match_threshold: 0.3
        });

        if (rpcError) {
          console.warn('RAG RPC error:', rpcError.message);
        } else if (chunks && chunks.length > 0) {
          console.log(`RAG: ${chunks.length} chunks retrieved for chatbot ${chatbotId}`);
          const ragContext = (chunks as any[]).map((c: any) => c.content).join('\n\n---\n\n');
          systemPrompt += `\n\n### Knowledge Base Context\nUse the following information to answer the user's question accurately. If it is not relevant, rely on your general knowledge.\n\n${ragContext}\n---`;
        } else {
          console.log(`RAG: no chunks matched for chatbot ${chatbotId} (threshold 0.3)`);
        }
      } catch (ragErr) {
        console.warn('RAG retrieval skipped:', (ragErr as any)?.message);
      }
    } else {
      if (!chatbotId) console.log('RAG skipped: no chatbotId in request');
      if (!supabaseAdmin) console.log('RAG skipped: supabaseAdmin not initialized');
    }

    // Cleanup expired session chunks periodically (1-in-20 chance per request)
    if (supabaseAdmin && Math.random() < 0.05) {
      Promise.resolve(supabaseAdmin.rpc('cleanup_expired_chunks')).catch(() => {});
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

// ── Knowledge Base endpoints ─────────────────────────────────────────────────

// Upload a PDF — persistent (chatbot owner) or session-only (widget user)
app.post('/api/knowledge/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing)' });
    }

    const { chatbotId, sessionOnly, conversationId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'PDF file required' });
    if (!chatbotId) return res.status(400).json({ error: 'chatbotId is required' });

    const isSessionOnly = sessionOnly === 'true';

    // Parse PDF text
    const pdfData = await pdfParse(file.buffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract readable text from this PDF' });
    }

    // Create knowledge source record for persistent uploads
    let sourceId: string | null = null;
    if (!isSessionOnly) {
      const { data: source, error: sourceError } = await supabaseAdmin
        .from('chatbot_knowledge_sources')
        .insert({
          chatbot_id: chatbotId,
          source_type: 'pdf',
          title: file.originalname.replace(/\.pdf$/i, ''),
          status: 'processing',
          file_size: file.size,
          chunk_count: 0
        })
        .select()
        .single();

      if (sourceError) throw sourceError;
      sourceId = source.id;
    }

    // Chunk + embed in batches
    const chunks = chunkText(rawText);
    const embeddings: number[][] = [];
    const batchSize = 16;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(batch.map(c => embedText(c)));
      embeddings.push(...batchEmbeddings);
    }

    const expiresAt = isSessionOnly
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const chunkRows = chunks.map((content, i) => ({
      chatbot_id: chatbotId,
      source_id: sourceId,
      conversation_id: isSessionOnly ? (conversationId || null) : null,
      is_session_only: isSessionOnly,
      content,
      chunk_index: i,
      embedding: `[${embeddings[i].join(',')}]`,
      metadata: { filename: file.originalname },
      expires_at: expiresAt
    }));

    const { error: chunksError } = await supabaseAdmin.from('document_chunks').insert(chunkRows);
    if (chunksError) throw chunksError;

    // Mark source as active
    if (sourceId) {
      await supabaseAdmin
        .from('chatbot_knowledge_sources')
        .update({ status: 'active', chunk_count: chunks.length })
        .eq('id', sourceId);
    }

    res.json({ sourceId, chunkCount: chunks.length, title: file.originalname.replace(/\.pdf$/i, '') });
  } catch (err: any) {
    console.error('Knowledge upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// List persistent knowledge sources for a chatbot
app.get('/api/knowledge/:chatbotId', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const { chatbotId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('*')
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a knowledge source (cascades to document_chunks via FK)
app.delete('/api/knowledge/source/:sourceId', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const { sourceId } = req.params;
    const { error } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .delete()
      .eq('id', sourceId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
