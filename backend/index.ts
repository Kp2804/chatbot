/**
 * Chatbot Backend Service
 *
 * Features
 * - Chat completion endpoint using Groq or Ollama
 * - Retrieval Augmented Generation (RAG) using Supabase vector search
 * - PDF knowledge base ingestion and chunk embedding
 * - Session and persistent knowledge storage
 * - Rate limiting per user
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import crypto from 'crypto';
import { translateText } from './services/translation';
import { incrementMessages } from './services/usage';
const _require = createRequire(import.meta.url);

// Direct import used to bypass pdf-parse ESM startup issue
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = _require('pdf-parse/lib/pdf-parse.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// AI provider configuration
// Groq is primary; Ollama is used as fallback when Groq fails.
// Set AI_PROVIDER=ollama-only to force local inference.
const AI_PROVIDER = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const OLLAMA_FALLBACK_ENABLED = (process.env.OLLAMA_FALLBACK_ENABLED || 'true').toLowerCase() !== 'false';

// Ollama configuration (used only when provider = ollama)
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';

 //Safely read numeric configuration from environment variables
function getEnvInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getEnvFloat(name: string, fallback: number, min = 0, max = 1) {
  const value = Number.parseFloat(process.env[name] || '');
  if (!Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

//RAG Configuration
const RAG_MATCH_COUNT = getEnvInt('RAG_MATCH_COUNT', 6);
const RAG_NEIGHBOR_WINDOW = getEnvInt('RAG_NEIGHBOR_WINDOW', 1);
const RAG_MAX_CONTEXT_CHARS = getEnvInt('RAG_MAX_CONTEXT_CHARS', 4500);
const RAG_MATCH_THRESHOLD = getEnvFloat('RAG_MATCH_THRESHOLD', 0.05);
const RAG_FALLBACK_MIN_SIMILARITY = getEnvFloat('RAG_FALLBACK_MIN_SIMILARITY', 0.02);
const RAG_FALLBACK_MATCH_COUNT = getEnvInt('RAG_FALLBACK_MATCH_COUNT', RAG_MATCH_COUNT);
const CHAT_HISTORY_LIMIT = getEnvInt('CHAT_HISTORY_LIMIT', 3);
const AI_MAX_OUTPUT_TOKENS = getEnvInt('AI_MAX_OUTPUT_TOKENS', 512);

// Groq LLM client
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Supabase admin client (service key bypasses RLS)
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

//   File Upload (PDF only)
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

//Embedding Pipeline
//Uses Xenova transformers
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

// Warm up embedding model
getEmbeddingPipeline().catch(() => {});

//   LLM Completion Wrapper
async function createChatCompletion(messages: any[], ragContextFound: boolean) {
  const runOllama = async () => {
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
  };

  const runGroq = async () => {
    if (!groq) {
      throw new Error('GROQ_API_KEY is missing');
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
  };

  // Respect explicit ollama-only mode for local/dev usage.
  if (AI_PROVIDER === 'ollama-only') {
    return runOllama();
  }

  // Default behavior: Groq first, then Ollama only if Groq fails.
  try {
    return await runGroq();
  } catch (groqError: any) {
    const groqMessage = groqError?.message || 'Unknown Groq error';

    if (!OLLAMA_FALLBACK_ENABLED) {
      throw new Error(`Groq request failed and Ollama fallback is disabled: ${groqMessage}`);
    }

    console.warn(`Groq request failed; falling back to Ollama. Reason: ${groqMessage}`);
    return runOllama();
  }
}

/**
 * Combines retrieved document chunks into a single context window
 * while respecting max prompt size.
 */
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

        // fallback if first chunk exceeds limit
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


/**
 * Splits document text into embedding chunks.
 * Handles:
 * - headings
 * - prose
 * - table-like rows
 */
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
     /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i.test(t) ||
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

type WebsiteScope = 'single_page' | 'linked_pages' | 'full_domain' | 'specific_paths_only';
type SyncFrequency = 'manual' | 'weekly' | 'monthly';

interface WebsiteCrawlRules {
  includePaths: string[];
  excludePaths: string[];
  maxPages: number;
  crawlDepth: number;
  ignoreQueryParams: boolean;
  followExternalLinks: boolean;
  strictSourceMode: boolean;
  autoResyncFrequency: SyncFrequency;
}

interface WebsitePreviewRequest {
  url: string;
  scope: WebsiteScope;
  rules: WebsiteCrawlRules;
}

interface CrawledPage {
  url: string;
  normalizedUrl: string;
  title: string;
  text: string;
  contentSize: number;
  depth: number;
  status: 'ready' | 'duplicate' | 'thin' | 'excluded' | 'failed';
  warning?: string;
}

function normalizeWebsiteRules(rules: Partial<WebsiteCrawlRules> | undefined): WebsiteCrawlRules {
  return {
    includePaths: Array.isArray(rules?.includePaths) ? rules!.includePaths.filter(Boolean) : [],
    excludePaths: Array.isArray(rules?.excludePaths) ? rules!.excludePaths.filter(Boolean) : [],
    maxPages: Math.min(Math.max(Number(rules?.maxPages) || 25, 1), 250),
    crawlDepth: Math.min(Math.max(Number(rules?.crawlDepth) || 2, 0), 6),
    ignoreQueryParams: rules?.ignoreQueryParams !== false,
    followExternalLinks: !!rules?.followExternalLinks,
    strictSourceMode: !!rules?.strictSourceMode,
    autoResyncFrequency: rules?.autoResyncFrequency === 'weekly' || rules?.autoResyncFrequency === 'monthly'
      ? rules.autoResyncFrequency
      : 'manual'
  };
}

function normalizePageUrl(rawUrl: string, ignoreQueryParams: boolean) {
  const parsed = new URL(rawUrl);
  parsed.hash = '';
  if (ignoreQueryParams) parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString();
}

function getNormalizedHostname(rawUrl: string) {
  const parsed = new URL(rawUrl);
  return parsed.hostname.replace(/^www\./i, '').toLowerCase();
}

function isSameWebsiteHost(hostA: string, hostB: string) {
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

function shouldIncludeUrl(rawUrl: string, rootUrl: URL, scope: WebsiteScope, rules: WebsiteCrawlRules) {
  const candidate = new URL(rawUrl);
  const sameHost = candidate.hostname === rootUrl.hostname;
  const sameDomain = sameHost || candidate.hostname.endsWith(`.${rootUrl.hostname}`);

  if (!rules.followExternalLinks && !sameDomain) return false;
  if (scope !== 'full_domain' && !sameHost) return false;

  const path = candidate.pathname || '/';
  if (rules.excludePaths.some((value) => path.startsWith(value))) return false;
  if (scope === 'specific_paths_only') {
    return rules.includePaths.length > 0 && rules.includePaths.some((value) => path.startsWith(value));
  }
  if (rules.includePaths.length > 0 && !rules.includePaths.some((value) => path.startsWith(value))) return false;

  return true;
}

function extractHtmlTitle(html: string, fallbackUrl: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();
  return title || new URL(fallbackUrl).pathname || fallbackUrl;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractCleanText(html: string, strictSourceMode: boolean) {
  const candidate = strictSourceMode
    ? (html.match(/<(main|article)[^>]*>[\s\S]*?<\/(main|article)>/i)?.[0] || html)
    : html;

  return decodeHtmlEntities(
    candidate
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, ' $1 ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractLinks(html: string, baseUrl: string) {
  const results = new Set<string>();
  const regex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        results.add(resolved.toString());
      }
    } catch {
      // Ignore malformed href values
    }
  }
  return Array.from(results);
}

async function fetchHtmlPage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'NexusChatbotIndexer/1.0 (+website indexing)'
    }
  });
  if (!response.ok) throw new Error(`Failed to fetch (${response.status})`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error('Unsupported content type');
  }

  const html = await response.text();
  return { html, finalUrl: response.url || url };
}

async function crawlWebsitePreview(input: WebsitePreviewRequest) {
  const rootUrl = new URL(input.url);
  const rules = normalizeWebsiteRules(input.rules);
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl.toString(), depth: 0 }];
  const visited = new Set<string>();
  const discovered = new Set<string>();
  const pages: CrawledPage[] = [];
  const excludedPages = new Set<string>();
  const warnings: Array<{ type: 'duplicate' | 'thin' | 'failed'; url: string; message: string }> = [];
  const contentHashes = new Map<string, string>();
  let failedPages = 0;

  while (queue.length > 0 && pages.length < rules.maxPages) {
    const current = queue.shift()!;
    let normalizedCurrent: string;

    try {
      normalizedCurrent = normalizePageUrl(current.url, rules.ignoreQueryParams);
    } catch {
      continue;
    }

    if (visited.has(normalizedCurrent)) continue;
    visited.add(normalizedCurrent);
    discovered.add(normalizedCurrent);

    if (!shouldIncludeUrl(normalizedCurrent, rootUrl, input.scope, rules)) {
      excludedPages.add(normalizedCurrent);
      continue;
    }

    try {
      const { html, finalUrl } = await fetchHtmlPage(normalizedCurrent);
      const finalNormalized = normalizePageUrl(finalUrl, rules.ignoreQueryParams);
      const title = extractHtmlTitle(html, finalNormalized);
      const text = extractCleanText(html, rules.strictSourceMode);
      const contentSize = text.length;
      const hash = crypto.createHash('sha1').update(text.toLowerCase()).digest('hex');

      let status: CrawledPage['status'] = 'ready';
      let warning: string | undefined;
      if (contentSize < 250) {
        status = 'thin';
        warning = 'Low-content page';
        warnings.push({ type: 'thin', url: finalNormalized, message: 'This page looks too thin to contribute meaningful answers.' });
      } else if (contentHashes.has(hash)) {
        status = 'duplicate';
        warning = `Similar to ${contentHashes.get(hash)}`;
        warnings.push({ type: 'duplicate', url: finalNormalized, message: 'This page appears to duplicate content from another page.' });
      } else {
        contentHashes.set(hash, finalNormalized);
      }

      pages.push({
        url: finalUrl,
        normalizedUrl: finalNormalized,
        title,
        text,
        contentSize,
        depth: current.depth,
        status,
        warning
      });

      const canTraverse = input.scope !== 'single_page' && current.depth < rules.crawlDepth;
      if (canTraverse) {
        for (const link of extractLinks(html, finalUrl)) {
          try {
            const normalizedLink = normalizePageUrl(link, rules.ignoreQueryParams);
            discovered.add(normalizedLink);
            if (shouldIncludeUrl(normalizedLink, rootUrl, input.scope, rules)) {
              if (!visited.has(normalizedLink)) {
                queue.push({ url: normalizedLink, depth: current.depth + 1 });
              }
            } else {
              excludedPages.add(normalizedLink);
            }
          } catch {
            // Ignore malformed links
          }
        }
      }
    } catch (error: any) {
      failedPages += 1;
      warnings.push({ type: 'failed', url: normalizedCurrent, message: error?.message || 'Failed to fetch page' });
      pages.push({
        url: normalizedCurrent,
        normalizedUrl: normalizedCurrent,
        title: normalizedCurrent,
        text: '',
        contentSize: 0,
        depth: current.depth,
        status: 'failed',
        warning: error?.message || 'Failed to fetch page'
      });
    }
  }

  const selectedPages = pages.filter((page) => page.status === 'ready');
  const estimatedContentSize = selectedPages.reduce((sum, page) => sum + page.contentSize, 0);

  return {
    rules,
    pages,
    totals: {
      pagesDiscovered: discovered.size,
      pagesSelected: selectedPages.length,
      pagesExcluded: excludedPages.size,
      pagesSkipped: pages.filter((page) => page.status === 'duplicate' || page.status === 'thin').length,
      failedPages,
      estimatedContentSize
    },
    warnings
  };
}

async function deleteKnowledgeSourceChunks(sourceId: string) {
  const { error } = await supabaseAdmin!
    .from('document_chunks')
    .delete()
    .eq('source_id', sourceId);
  if (error) throw error;
}

async function matchDocumentChunks(
  chatbotId: string,
  queryEmbedding: number[],
  conversationId: string | null | undefined,
  threshold: number,
  count: number
) {
  const { data: chunks, error: rpcError } = await supabaseAdmin!.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_chatbot_id: chatbotId,
    match_conversation_id: conversationId || null,
    match_count: count,
    match_threshold: threshold
  });

  if (rpcError) throw new Error(rpcError.message);
  return (chunks || []) as any[];
}

function filterChunksBySimilarity(chunks: any[], minSimilarity: number, maxCount: number) {
  return chunks
    .filter((chunk) => Number(chunk?.similarity) >= minSimilarity)
    .sort((a, b) => Number(b?.similarity || 0) - Number(a?.similarity || 0))
    .slice(0, maxCount);
}

async function retrieveRelevantChunks(chatbotId: string, message: string, conversationId?: string | null) {
  const queryEmbedding = await embedText(message);
  const strictChunks = await matchDocumentChunks(
    chatbotId,
    queryEmbedding,
    conversationId,
    RAG_MATCH_THRESHOLD,
    RAG_MATCH_COUNT
  );

  if (strictChunks.length > 0) {
    return strictChunks;
  }

  const topChunks = await matchDocumentChunks(
    chatbotId,
    queryEmbedding,
    conversationId,
    0,
    Math.max(RAG_MATCH_COUNT, RAG_FALLBACK_MATCH_COUNT)
  );

  return filterChunksBySimilarity(topChunks, RAG_FALLBACK_MIN_SIMILARITY, RAG_FALLBACK_MATCH_COUNT);
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

//Middleware
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

// Translation endpoint using LibreTranslate (non-LLM translation)
app.post('/api/translate', async (req: Request, res: Response) => {
  try {
    const { texts, language, source = 'en' } = req.body;
    if (!Array.isArray(texts) || texts.length === 0 || !language) {
      return res.status(400).json({ error: 'texts array and language are required' });
    }

    if (language !== 'en' && language !== 'hi') {
      return res.status(400).json({ error: 'language must be en or hi' });
    }

    const translated = await Promise.all(
      texts.map((text: string) => translateText(text, language, source))
    );

    res.json({ translated });
  } catch {
    res.status(500).json({ error: 'Translation failed' });
  }
});

// Chat completion endpoint (with rate limiting)
app.post('/api/chat', rateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { message, chatbotContext, conversationHistory, userName, chatbotId, conversationId, lang } = req.body;
    const selectedLang: 'en' | 'hi' = lang === 'hi' ? 'hi' : 'en';

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const englishMessage = selectedLang === 'hi'
      ? await translateText(message, 'en', 'hi')
      : message;

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
        const queryEmbedding = await embedText(englishMessage);
        let chunks = await matchDocumentChunks(
          chatbotId,
          queryEmbedding,
          conversationId || null,
          RAG_MATCH_THRESHOLD,
          RAG_MATCH_COUNT
        );

        let usedFallback = false;
        if (chunks.length === 0) {
          const topChunks = await matchDocumentChunks(
            chatbotId,
            queryEmbedding,
            conversationId || null,
            0,
            Math.max(RAG_MATCH_COUNT, RAG_FALLBACK_MATCH_COUNT)
          );

          const fallbackChunks = filterChunksBySimilarity(
            topChunks,
            RAG_FALLBACK_MIN_SIMILARITY,
            RAG_FALLBACK_MATCH_COUNT
          );

          if (fallbackChunks.length > 0) {
            chunks = fallbackChunks;
            usedFallback = true;
          } else {
            const scores = topChunks.length > 0
              ? topChunks.map((c: any) => Number(c.similarity || 0).toFixed(3)).join(', ')
              : 'none';
            console.log(
              `RAG: no chunks passed threshold ${RAG_MATCH_THRESHOLD} for chatbot ${chatbotId}. ` +
              `Top scores: [${scores}], fallback floor: ${RAG_FALLBACK_MIN_SIMILARITY}`
            );
          }
        }

        if (chunks.length > 0) {
          ragContextFound = true;
          if (usedFallback) {
            console.log(
              `RAG fallback: using ${chunks.length} chunk(s) above similarity ${RAG_FALLBACK_MIN_SIMILARITY} for chatbot ${chatbotId}`
            );
          }

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
      for (const msg of recentHistory) {
        const englishHistoryContent = selectedLang === 'hi'
          ? await translateText(msg.content || '', 'en', 'hi')
          : msg.content;

        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: englishHistoryContent
        });
      }
    }

    // Add current message
    messages.push({
      role: 'user',
      content: englishMessage
    });

    const completion = await createChatCompletion(messages, ragContextFound);
    const finalResponse = selectedLang === 'hi'
      ? await translateText(completion.response, 'hi', 'en')
      : completion.response;

    if (supabaseAdmin && chatbotId) {
      try {
        const { data: chatbotRow, error: chatbotError } = await supabaseAdmin
          .from('chatbots')
          .select('user_id')
          .eq('id', chatbotId)
          .maybeSingle();

        if (chatbotError) {
          throw new Error(chatbotError.message);
        }

        if (chatbotRow?.user_id) {
          await incrementMessages(supabaseAdmin, chatbotRow.user_id);
        }
      } catch (usageError: any) {
        console.warn('Usage tracking warning (messages_used):', usageError?.message || usageError);
      }
    }

    res.json({ 
      response: finalResponse,
      model: completion.model,
      tokensUsed: completion.tokensUsed,
      lang: selectedLang
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

    const chatbotId = Array.isArray(req.params.chatbotId) ? req.params.chatbotId[0] : req.params.chatbotId;

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

app.post('/api/knowledge/website/preview', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const user = await requireAuth(req, res);
    if (!user) return;

    const { chatbotId, url, scope, rules } = req.body || {};
    if (!chatbotId) return res.status(400).json({ error: 'chatbotId is required' });
    if (!url) return res.status(400).json({ error: 'Website URL is required' });
    if (!scope) return res.status(400).json({ error: 'Crawl scope is required' });

    const owns = await requireChatbotOwner(user.id, chatbotId, res);
    if (!owns) return;

    const preview = await crawlWebsitePreview({
      url,
      scope,
      rules: normalizeWebsiteRules(rules)
    });

    res.json(preview);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Preview failed' });
  }
});

app.post('/api/knowledge/website/index', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const user = await requireAuth(req, res);
    if (!user) return;

    const { chatbotId, url, scope, rules } = req.body || {};
    if (!chatbotId) return res.status(400).json({ error: 'chatbotId is required' });
    if (!url) return res.status(400).json({ error: 'Website URL is required' });

    const owns = await requireChatbotOwner(user.id, chatbotId, res);
    if (!owns) return;

    const { data: existingSources } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('id, content, metadata')
      .eq('chatbot_id', chatbotId)
      .eq('source_type', 'website');

    let requestedHost = '';
    try {
      requestedHost = getNormalizedHostname(url);
    } catch {
      return res.status(400).json({ error: 'Invalid website URL' });
    }

    const existingHosts = new Set<string>();
    for (const row of existingSources || []) {
      const candidateUrl = row.content || row.metadata?.url;
      if (!candidateUrl) continue;
      try {
        existingHosts.add(getNormalizedHostname(candidateUrl));
      } catch {
        // Ignore malformed legacy source URL values.
      }
    }

    const hasConflictingWebsite = Array.from(existingHosts).some((host) => !isSameWebsiteHost(host, requestedHost));
    if (hasConflictingWebsite) {
      const existingWebsite = Array.from(existingHosts)[0];
      return res.status(409).json({
        error: `Only one indexed website is allowed per chatbot. This chatbot currently stores website data for "${existingWebsite}". Clear existing website memory first.`
      });
    }

    const normalizedRules = normalizeWebsiteRules(rules);
    const preview = await crawlWebsitePreview({ chatbotId, url, scope, rules: normalizedRules } as any);
    const selectedPages = preview.pages.filter((page) => page.status === 'ready');
    const failedPages = preview.pages.filter((page) => page.status === 'failed').length;

    const existingByUrl = new Map<string, { id: string; content: string | null }>();
    for (const row of existingSources || []) {
      if (row.content) existingByUrl.set(row.content, row as any);
    }

    let totalChunks = 0;
    const now = new Date().toISOString();
    const pageResults: any[] = [];

    for (const page of selectedPages) {
      const chunks = chunkText(page.text);
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i += 16) {
        const batch = chunks.slice(i, i + 16);
        const batchEmbeddings = await Promise.all(batch.map((value) => embedText(value)));
        embeddings.push(...batchEmbeddings);
      }

      const existing = existingByUrl.get(page.normalizedUrl);
      let sourceId = existing?.id || null;

      if (sourceId) {
        await deleteKnowledgeSourceChunks(sourceId);
        const { error: updateError } = await supabaseAdmin
          .from('chatbot_knowledge_sources')
          .update({
            title: page.title,
            content: page.normalizedUrl,
            status: 'processing',
            chunk_count: 0,
            metadata: {
              url: page.normalizedUrl,
              contentSize: page.contentSize,
              warning: page.warning || null,
              strictSourceMode: normalizedRules.strictSourceMode,
              autoResyncFrequency: normalizedRules.autoResyncFrequency
            },
            last_synced_at: now,
            updated_at: now
          })
          .eq('id', sourceId);
        if (updateError) throw updateError;
      } else {
        const { data: insertedSource, error: insertSourceError } = await supabaseAdmin
          .from('chatbot_knowledge_sources')
          .insert({
            chatbot_id: chatbotId,
            source_type: 'website',
            title: page.title,
            content: page.normalizedUrl,
            status: 'processing',
            chunk_count: 0,
            file_size: page.contentSize,
            metadata: {
              url: page.normalizedUrl,
              contentSize: page.contentSize,
              warning: page.warning || null,
              strictSourceMode: normalizedRules.strictSourceMode,
              autoResyncFrequency: normalizedRules.autoResyncFrequency
            },
            last_synced_at: now,
            updated_at: now
          })
          .select('id')
          .single();
        if (insertSourceError) throw insertSourceError;
        sourceId = insertedSource.id;
      }

      const chunkRows = chunks.map((content, index) => ({
        chatbot_id: chatbotId,
        source_id: sourceId,
        conversation_id: null,
        is_session_only: false,
        content,
        chunk_index: index,
        embedding: `[${embeddings[index].join(',')}]`,
        metadata: {
          sourceType: 'website',
          title: page.title,
          url: page.normalizedUrl,
          contentSize: page.contentSize,
          priority: false
        }
      }));

      const { error: chunkInsertError } = await supabaseAdmin.from('document_chunks').insert(chunkRows);
      if (chunkInsertError) throw chunkInsertError;

      const { error: finalUpdateError } = await supabaseAdmin
        .from('chatbot_knowledge_sources')
        .update({
          status: 'active',
          chunk_count: chunks.length,
          file_size: page.contentSize,
          updated_at: now,
          last_synced_at: now
        })
        .eq('id', sourceId);
      if (finalUpdateError) throw finalUpdateError;

      totalChunks += chunks.length;
      pageResults.push({
        sourceId,
        title: page.title,
        url: page.normalizedUrl,
        status: 'active',
        chunkCount: chunks.length,
        lastIndexed: now
      });
    }

    res.json({
      success: true,
      stages: [
        'discovering pages',
        'fetching content',
        'extracting clean text',
        'removing duplicates',
        'chunking content',
        'indexing complete'
      ],
      summary: {
        totalIndexedPages: selectedPages.length,
        totalChunks,
        pagesSkipped: preview.totals.pagesSkipped,
        failedPages,
        lastSynced: now
      },
      preview: preview.totals,
      pageResults
    });
  } catch (err: any) {
    console.error('Website indexing error:', err);
    res.status(500).json({ error: err.message || 'Website indexing failed' });
  }
});

app.post('/api/knowledge/website/test', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const user = await requireAuth(req, res);
    if (!user) return;

    const { chatbotId, question } = req.body || {};
    if (!chatbotId) return res.status(400).json({ error: 'chatbotId is required' });
    if (!question) return res.status(400).json({ error: 'Question is required' });

    const owns = await requireChatbotOwner(user.id, chatbotId, res);
    if (!owns) return;

    const matchedChunks = await retrieveRelevantChunks(chatbotId, question, null);
    if (matchedChunks.length === 0) {
      return res.json({
        answer: 'I could not find a strong answer in this chatbot’s indexed website content yet.',
        citations: []
      });
    }

    const sourceIds = Array.from(new Set(matchedChunks.map((chunk) => chunk.source_id).filter(Boolean)));
    const { data: sources } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('id, title, content, metadata')
      .in('id', sourceIds);

    const sourceMap = new Map((sources || []).map((source: any) => [source.id, source]));
    const context = buildRagContext(matchedChunks, RAG_MAX_CONTEXT_CHARS);
    const completion = await createChatCompletion([
      {
        role: 'system',
        content: `You are a website knowledge QA assistant. Answer using only the indexed website context below. Keep the answer crisp, useful, and business-friendly. If the answer is not supported, say so clearly.\n\n${context.context}\n---`
      },
      {
        role: 'user',
        content: question
      }
    ], true);

    const citations = matchedChunks.slice(0, 3).map((chunk) => {
      const source = sourceMap.get(chunk.source_id);
      return {
        sourceId: chunk.source_id,
        title: source?.title || 'Indexed page',
        url: source?.content || source?.metadata?.url || null,
        similarity: chunk.similarity
      };
    });

    res.json({
      answer: completion.response,
      citations
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Test failed' });
  }
});

app.post('/api/knowledge/website/source/:sourceId/reindex', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const user = await requireAuth(req, res);
    if (!user) return;

    const sourceId = Array.isArray(req.params.sourceId) ? req.params.sourceId[0] : req.params.sourceId;
    if (!sourceId) return res.status(400).json({ error: 'Missing source id' });
    const { data: source, error: fetchError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('source_type', 'website')
      .maybeSingle();
    if (fetchError || !source) return res.status(404).json({ error: 'Website source not found' });

    const owns = await requireChatbotOwner(user.id, source.chatbot_id, res);
    if (!owns) return;

    const strictSourceMode = !!source.metadata?.strictSourceMode;
    const { html, finalUrl } = await fetchHtmlPage(source.content);
    const normalizedUrl = normalizePageUrl(finalUrl, true);
    const text = extractCleanText(html, strictSourceMode);
    const title = extractHtmlTitle(html, normalizedUrl);
    const chunks = chunkText(text);
    const embeddings = await Promise.all(chunks.map((chunk) => embedText(chunk)));

    await deleteKnowledgeSourceChunks(sourceId);
    const { error: chunkInsertError } = await supabaseAdmin.from('document_chunks').insert(
      chunks.map((content, index) => ({
        chatbot_id: source.chatbot_id,
        source_id: sourceId,
        content,
        chunk_index: index,
        embedding: `[${embeddings[index].join(',')}]`,
        metadata: {
          sourceType: 'website',
          title,
          url: normalizedUrl,
          contentSize: text.length,
          priority: !!source.priority
        }
      }))
    );
    if (chunkInsertError) throw chunkInsertError;

    const now = new Date().toISOString();
    const { error: sourceUpdateError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .update({
        title,
        content: normalizedUrl,
        status: 'active',
        chunk_count: chunks.length,
        file_size: text.length,
        last_synced_at: now,
        updated_at: now,
        metadata: {
          ...(source.metadata || {}),
          url: normalizedUrl,
          contentSize: text.length
        }
      })
      .eq('id', sourceId);
    if (sourceUpdateError) throw sourceUpdateError;

    res.json({
      success: true,
      sourceId,
      title,
      chunkCount: chunks.length,
      lastIndexed: now
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Reindex failed' });
  }
});

app.patch('/api/knowledge/website/source/:sourceId', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const user = await requireAuth(req, res);
    if (!user) return;

    const { sourceId } = req.params;
    const { priority } = req.body || {};
    const { data: source, error: fetchError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('source_type', 'website')
      .maybeSingle();
    if (fetchError || !source) return res.status(404).json({ error: 'Website source not found' });

    const owns = await requireChatbotOwner(user.id, source.chatbot_id, res);
    if (!owns) return;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .update({
        priority: !!priority,
        metadata: {
          ...(source.metadata || {}),
          priority: !!priority
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId)
      .select('*')
      .single();
    if (updateError) throw updateError;

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Update failed' });
  }
});

// Delete all indexed website sources for a chatbot and explicitly remove chunks.
app.delete('/api/knowledge/website/chatbot/:chatbotId', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const chatbotId = Array.isArray(req.params.chatbotId) ? req.params.chatbotId[0] : req.params.chatbotId;
    if (!chatbotId) return res.status(400).json({ error: 'Missing chatbot id' });

    const user = await requireAuth(req, res);
    if (!user) return;

    const owns = await requireChatbotOwner(user.id, chatbotId, res);
    if (!owns) return;

    const { data: websiteSources, error: fetchError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .select('id')
      .eq('chatbot_id', chatbotId)
      .eq('source_type', 'website');
    if (fetchError) throw fetchError;

    if (!websiteSources || websiteSources.length === 0) {
      return res.json({ success: true, deletedSources: 0 });
    }

    const websiteSourceIds = websiteSources.map((source) => source.id).filter(Boolean);

    // Explicitly delete website chunks first so cleanup works even if FK cascade
    // is missing or was created without ON DELETE CASCADE in older databases.
    const { error: chunkDeleteError } = await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('chatbot_id', chatbotId)
      .in('source_id', websiteSourceIds);
    if (chunkDeleteError) throw chunkDeleteError;

    const { error: deleteError } = await supabaseAdmin
      .from('chatbot_knowledge_sources')
      .delete()
      .eq('chatbot_id', chatbotId)
      .eq('source_type', 'website');
    if (deleteError) throw deleteError;

    res.json({ success: true, deletedSources: websiteSources.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear website memory' });
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
  console.log(`✅ AI mode: ${AI_PROVIDER === 'ollama-only' ? 'ollama-only' : 'groq-primary'}`);
  console.log(`✅ Groq API key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`✅ Ollama fallback enabled: ${OLLAMA_FALLBACK_ENABLED}`);
  console.log(`✅ RAG limits: matches=${RAG_MATCH_COUNT}, neighbours=${RAG_NEIGHBOR_WINDOW}, contextChars=${RAG_MAX_CONTEXT_CHARS}, threshold=${RAG_MATCH_THRESHOLD}, fallbackFloor=${RAG_FALLBACK_MIN_SIMILARITY}, history=${CHAT_HISTORY_LIMIT}, output=${AI_MAX_OUTPUT_TOKENS}`);
  if (AI_PROVIDER === 'ollama-only' || OLLAMA_FALLBACK_ENABLED) {
    console.log(`✅ Ollama endpoint: ${OLLAMA_BASE_URL}`);
    console.log(`✅ Ollama model: ${OLLAMA_MODEL}`);
  }
});
