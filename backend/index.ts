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
const AI_PROVIDER = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';

function getEnvInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const RAG_MATCH_COUNT = getEnvInt('RAG_MATCH_COUNT', 6);
const RAG_NEIGHBOR_WINDOW = getEnvInt('RAG_NEIGHBOR_WINDOW', 1);
const RAG_MAX_CONTEXT_CHARS = getEnvInt('RAG_MAX_CONTEXT_CHARS', 4500);
const CHAT_HISTORY_LIMIT = getEnvInt('CHAT_HISTORY_LIMIT', 3);
const AI_MAX_OUTPUT_TOKENS = getEnvInt('AI_MAX_OUTPUT_TOKENS', 512);

// Initialize Groq client
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

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

async function createChatCompletion(messages: any[], ragContextFound: boolean) {
  if (AI_PROVIDER === 'ollama') {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
          temperature: ragContextFound ? 0.1 : 0.7,
          num_predict: AI_MAX_OUTPUT_TOKENS
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || `Ollama request failed with status ${response.status}`);
    }

    return {
      response: data?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.",
      model: data?.model || OLLAMA_MODEL,
      tokensUsed: data?.prompt_eval_count || 0
    };
  }

  if (!groq) {
    throw new Error('GROQ_API_KEY is missing and AI_PROVIDER is not set to ollama');
  }

  const completion = await groq.chat.completions.create({
    messages,
    model: 'llama-3.3-70b-versatile',
    temperature: ragContextFound ? 0.1 : 0.7,
    max_tokens: AI_MAX_OUTPUT_TOKENS,
    top_p: 1,
    stream: false
  });

  return {
    response: completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.",
    model: completion.model,
    tokensUsed: completion.usage?.total_tokens || 0
  };
}

function buildRagContext(chunks: Array<{ content: string }>, maxChars: number) {
  const selected: string[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const text = chunk.content?.trim();
    if (!text) continue;

    const separatorLength = selected.length > 0 ? '\n\n---\n\n'.length : 0;
    const nextLength = usedChars + separatorLength + text.length;

    if (nextLength <= maxChars) {
      selected.push(text);
      usedChars = nextLength;
      continue;
    }

    if (selected.length === 0) {
      selected.push(text.slice(0, maxChars));
      usedChars = selected[0].length;
    }
    break;
  }

  return {
    context: selected.join('\n\n---\n\n'),
    chunkCount: selected.length,
    usedChars
  };
}

// ── Text chunker ─────────────────────────────────────────────────────────────
// Handles plain prose, numbered/headed sections, and table-like rows.
// Section headings are prepended to each chunk so retrieval preserves context.
function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const lines = text.split('\n');
  const segments: string[] = [];
  let currentSection = '';
  let pendingLines: string[] = [];
  let pendingIsTable = false;

  // A heading: short, no trailing punctuation, or starts with a known keyword
  const isHeading = (t: string) =>
    t.length > 0 && t.length < 80 &&
    !t.endsWith('.') && !t.endsWith(',') && !t.endsWith(':') &&
    (/^(DAY|WEEK|PHASE|SECTION|CHAPTER|PART|MODULE|STEP|STAGE)\b/i.test(t) ||
     (t === t.toUpperCase() && /[A-Z]/.test(t)));

  // A table row: line with 3+ consecutive spaces (column alignment)
  const isTableRow = (raw: string) =>
    /\s{3,}/.test(raw) && raw.trim().length > 10;

  const flush = (fLines: string[], isTable: boolean) => {
    if (!fLines.length) return;
    const prefix = currentSection ? `[${currentSection}] ` : '';
    if (isTable) {
      // Keep table rows together, break only when chunk would exceed limit
      let acc = '';
      for (const row of fLines) {
        const candidate = acc ? acc + '\n' + row : prefix + row;
        if (candidate.length <= chunkSize) {
          acc = candidate;
        } else {
          if (acc.trim().length >= 20) segments.push(acc.trim());
          acc = prefix + row;
        }
      }
      if (acc.trim().length >= 20) segments.push(acc.trim());
    } else {
      // Prose: join lines, then split on sentences up to chunkSize
      const prose = (prefix + fLines.join(' ')).replace(/\s+/g, ' ').trim();
      if (prose.length <= chunkSize) {
        if (prose.length >= 20) segments.push(prose);
      } else {
        const parts = prose.split(/(?<=[.?!])\s+/);
        let acc = '';
        for (const part of parts) {
          const candidate = acc ? acc + ' ' + part : part;
          if (candidate.length <= chunkSize) {
            acc = candidate;
          } else {
            if (acc.trim().length >= 20) segments.push(acc.trim());
            acc = part;
          }
        }
        if (acc.trim().length >= 20) segments.push(acc.trim());
      }
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flush(pendingLines, pendingIsTable);
      pendingLines = []; pendingIsTable = false;
      continue;
    }
    if (isHeading(trimmed)) {
      flush(pendingLines, pendingIsTable);
      pendingLines = []; pendingIsTable = false;
      currentSection = trimmed;
      continue;
    }
    const tableRow = isTableRow(rawLine);
    if (pendingLines.length > 0 && tableRow !== pendingIsTable) {
      flush(pendingLines, pendingIsTable);
      pendingLines = [];
    }
    pendingIsTable = tableRow;
    pendingLines.push(trimmed);
  }
  flush(pendingLines, pendingIsTable);

  // Merge small segments and add overlap between consecutive chunks
  const chunks: string[] = [];
  let current = '';
  for (const seg of segments) {
    if (!current) {
      current = seg;
    } else if ((current + ' ' + seg).length <= chunkSize) {
      current += ' ' + seg;
    } else {
      if (current.length >= 20) chunks.push(current.trim());
      const tail = current.length > overlap ? current.slice(-overlap) : current;
      current = tail + ' ' + seg;
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
    }You provide helpful, accurate, and friendly responses. Keep your answers concise and relevant. Prioritize completeness of the main answer over extra detail. If the user asks for a plan, routine, list, schedule, or set of items, include all important item names first, then add brief details only if space allows.`;
    
    // Add personalization instruction if user name is available
    if (userName && userName.trim()) {
      const firstName = userName.trim().split(' ')[0]; // Get first name
      systemPrompt += ` When appropriate, address the user by their name: ${firstName}. Use their name naturally in conversation, especially in greetings and when emphasizing points.`;
    }

    // ── RAG: retrieve relevant knowledge base chunks ─────────────────────────
    let ragContextFound = false;
    if (chatbotId && supabaseAdmin) {
      try {
        const queryEmbedding = await embedText(message);
        const { data: chunks, error: rpcError } = await supabaseAdmin.rpc('match_document_chunks', {
          query_embedding: queryEmbedding,
          match_chatbot_id: chatbotId,
          match_conversation_id: conversationId || null,
          match_count: RAG_MATCH_COUNT,
          match_threshold: 0.1
        });

        if (rpcError) {
          console.warn('RAG RPC error:', rpcError.message);
        } else if (chunks && chunks.length > 0) {
          ragContextFound = true;

          // ── Adjacent chunk expansion ──────────────────────────────────────
          // For each retrieved chunk, also fetch a small neighbour window
          // from the same source so we never get half a section.
          const matchedChunks = chunks as any[];
          const seen = new Set<string>(matchedChunks.map((c: any) => c.id));
          const expandedChunks: any[] = [...matchedChunks];

          // Group matched chunks by source_id
          const sourceMap = new Map<string, number[]>();
          for (const c of matchedChunks) {
            if (!c.source_id) continue;
            if (!sourceMap.has(c.source_id)) sourceMap.set(c.source_id, []);
            sourceMap.get(c.source_id)!.push(c.chunk_index);
          }

          for (const [sourceId, indexes] of sourceMap.entries()) {
            const minIdx = Math.max(0, Math.min(...indexes) - RAG_NEIGHBOR_WINDOW);
            const maxIdx = Math.max(...indexes) + RAG_NEIGHBOR_WINDOW;
            const { data: neighbours } = await supabaseAdmin
              .from('document_chunks')
              .select('id, content, chunk_index, source_id')
              .eq('chatbot_id', chatbotId)
              .eq('source_id', sourceId)
              .gte('chunk_index', minIdx)
              .lte('chunk_index', maxIdx)
              .order('chunk_index', { ascending: true });
            if (neighbours) {
              for (const n of neighbours) {
                if (!seen.has(n.id)) {
                  seen.add(n.id);
                  expandedChunks.push(n);
                }
              }
            }
          }

          // Sort all chunks by source + chunk_index so context reads naturally
          expandedChunks.sort((a, b) =>
            (a.source_id || '').localeCompare(b.source_id || '') ||
            (a.chunk_index ?? 0) - (b.chunk_index ?? 0)
          );

          const ragContextResult = buildRagContext(expandedChunks, RAG_MAX_CONTEXT_CHARS);
          console.log(`RAG: ${matchedChunks.length} matched + ${expandedChunks.length - matchedChunks.length} neighbours; using ${ragContextResult.chunkCount} chunks / ${ragContextResult.usedChars} chars`);
          systemPrompt += `\n\n### Knowledge Base Context\nUse the information below to answer the user's question accurately. Base your answer on this context. You may apply simple common-sense reasoning to bridge terminology in the context to the user's question (e.g. numbered items map to natural names, abbreviations have standard meanings). Do not invent facts not supported by the context. If the answer cannot be determined even with reasonable inference, say so clearly. If the context contains an ordered or named list, preserve all primary item names in your answer even if you omit secondary fields like instructions, equipment, sets, or rest times.\n\n${ragContextResult.context}\n---`;
        } else {
          // Log top scores even when nothing passes threshold to help diagnose
          const { data: topChunks } = await supabaseAdmin.rpc('match_document_chunks', {
            query_embedding: queryEmbedding,
            match_chatbot_id: chatbotId,
            match_conversation_id: null,
            match_count: 3,
            match_threshold: 0.0
          });
          const scores = topChunks ? (topChunks as any[]).map((c: any) => c.similarity?.toFixed(3)).join(', ') : 'none';
          console.log(`RAG: no chunks passed threshold 0.1 for chatbot ${chatbotId}. Top scores: [${scores}]`);
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

    // Add limited conversation history so the prompt stays small.
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-CHAT_HISTORY_LIMIT);
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

    const completion = await createChatCompletion(messages, ragContextFound);

    res.json({ 
      response: completion.response,
      model: completion.model,
      tokensUsed: completion.tokensUsed
    });

  } catch (error: any) {
    console.error('Error calling AI provider:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI response',
      details: error.message 
    });
  }
});

// ── Auth helpers ─────────────────────────────────────────────────────────────

// Extract and verify the Supabase JWT from the Authorization header.
// Returns the authenticated user or throws with a 401 response.
async function requireAuth(req: Request, res: Response): Promise<{ id: string } | null> {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return null;
  }
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase not configured' });
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  return data.user as { id: string };
}

// Verify a user owns a given chatbot. Returns false and sends 403 if not.
async function requireChatbotOwner(userId: string, chatbotId: string, res: Response): Promise<boolean> {
  const { data, error } = await supabaseAdmin!
    .from('chatbots')
    .select('id')
    .eq('id', chatbotId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    res.status(403).json({ error: 'Forbidden: you do not own this chatbot' });
    return false;
  }
  return true;
}

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

    // Persistent uploads require the authenticated chatbot owner.
    // Session-only uploads (from widget users) are allowed without auth.
    if (!isSessionOnly) {
      const user = await requireAuth(req, res);
      if (!user) return;
      const owns = await requireChatbotOwner(user.id, chatbotId, res);
      if (!owns) return;
    }

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

    const user = await requireAuth(req, res);
    if (!user) return;
    const owns = await requireChatbotOwner(user.id, String(chatbotId), res);
    if (!owns) return;

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

    // Verify caller owns the chatbot this source belongs to
    const user = await requireAuth(req, res);
    if (!user) return;

    const { data: source, error: fetchError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('chatbot_id')
      .eq('id', sourceId)
      .maybeSingle();

    if (fetchError || !source) return res.status(404).json({ error: 'Source not found' });

    const owns = await requireChatbotOwner(user.id, source.chatbot_id, res);
    if (!owns) return;

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
  console.log(`✅ AI provider: ${AI_PROVIDER}`);
  console.log(`✅ Groq API key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`✅ RAG limits: matches=${RAG_MATCH_COUNT}, neighbours=${RAG_NEIGHBOR_WINDOW}, contextChars=${RAG_MAX_CONTEXT_CHARS}, history=${CHAT_HISTORY_LIMIT}, output=${AI_MAX_OUTPUT_TOKENS}`);
  if (AI_PROVIDER === 'ollama') {
    console.log(`✅ Ollama endpoint: ${OLLAMA_BASE_URL}`);
    console.log(`✅ Ollama model: ${OLLAMA_MODEL}`);
  }
});
