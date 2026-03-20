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
import dns from 'dns/promises';
import net from 'net';
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
const AI_MAX_RETRIES = getEnvInt('AI_MAX_RETRIES', 2);
const MESSAGE_LIMIT_PER_DAY = getEnvInt('MESSAGE_LIMIT_PER_DAY', 50);

const corsAllowlist = ((process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean));

function normalizeHost(value: string) {
  return value.trim().replace(/^\*\./, '').toLowerCase();
}

function originMatchesAllowed(origin: string, allowed: string) {
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const allowedHost = normalizeHost(allowed);
    if (!allowedHost) return false;

    if (allowed.startsWith('*.')) {
      return originHost === allowedHost || originHost.endsWith(`.${allowedHost}`);
    }

    if (allowed.startsWith('http://') || allowed.startsWith('https://')) {
      const allowedUrl = new URL(allowed);
      return origin.toLowerCase() === `${allowedUrl.protocol}//${allowedUrl.host}`.toLowerCase();
    }

    return originHost === allowedHost;
  } catch {
    return false;
  }
}

function isAllowedOrigin(
  origin: string | undefined | null,
  allowlist = corsAllowlist,
  requirePresent = false
) {
  if (!origin) return !requirePresent;
  if (allowlist.length === 0) return false;
  return allowlist.some((allowed) => originMatchesAllowed(origin, allowed));
}

// Groq LLM client
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Supabase admin client (service key bypasses RLS)
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

const MAX_PDF_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_SOURCES_PER_CHATBOT = 5;

//   File Upload (PDF only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_UPLOAD_SIZE_BYTES },
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetries<T>(fn: () => Promise<T>, label: string, retries = AI_MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = (error as any)?.message || 'Unknown error';
      const currentAttempt = attempt + 1;
      const maxAttempts = retries + 1;

      if (attempt >= retries) {
        console.error(`${label} failed after ${maxAttempts} attempt(s): ${message}`);
        break;
      }

      console.warn(`${label} failed on attempt ${currentAttempt}/${maxAttempts}: ${message}. Retrying...`);
      await sleep(250 * currentAttempt);
    }
  }

  throw lastError;
}

async function logErrorToDatabase(userId: string | null, message: string) {
  if (!supabaseAdmin || !userId) return;

  const { error } = await supabaseAdmin.from('logs').insert({
    user_id: userId,
    type: 'error',
    message,
  });

  if (error) {
    console.warn(`Failed to persist error log: ${error.message}`);
  }
}

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
    return runWithRetries(runOllama, 'Ollama request');
  }

  // Default behavior: Groq first, then Ollama only if Groq fails.
  try {
    return await runWithRetries(runGroq, 'Groq request');
  } catch (groqError: any) {
    const groqMessage = groqError?.message || 'Unknown Groq error';

    if (!OLLAMA_FALLBACK_ENABLED) {
      throw new Error(`Groq request failed and Ollama fallback is disabled: ${groqMessage}`);
    }

    console.warn(`Groq request failed; falling back to Ollama. Reason: ${groqMessage}`);
    return runWithRetries(runOllama, 'Ollama fallback request');
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

function isPrivateOrLocalIp(host: string) {
  const ip = net.isIP(host) ? host : '';
  if (!ip) return false;

  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower === '::1'
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('fe80');
  }

  const parts = ip.split('.').map((segment) => Number(segment));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

async function assertPublicSafeUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP/HTTPS URLs are allowed');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
  ) {
    throw new Error('Localhost/private domains are not allowed');
  }

  if (isPrivateOrLocalIp(hostname)) {
    throw new Error('Private IP addresses are not allowed');
  }

  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateOrLocalIp(record.address))) {
    throw new Error('Resolved host points to a private network address');
  }
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
  await assertPublicSafeUrl(url);
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

type PlanLimitResource = 'messages' | 'bots';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'trialing']);
const REQUIRE_ACTIVE_PLAN_FOR_BOT_CREATION = (process.env.REQUIRE_ACTIVE_PLAN_FOR_BOT_CREATION || 'true').toLowerCase() !== 'false';
const REQUIRE_ACTIVE_PLAN_FOR_MESSAGES = (process.env.REQUIRE_ACTIVE_PLAN_FOR_MESSAGES || 'true').toLowerCase() !== 'false';
const DEFAULT_NO_PLAN_BOT_LIMIT = Math.max(0, getEnvInt('DEFAULT_NO_PLAN_BOT_LIMIT', 1));
const DEFAULT_NO_PLAN_MESSAGE_LIMIT = Math.max(0, getEnvInt('DEFAULT_NO_PLAN_MESSAGE_LIMIT', 1000));

const adminEmails = new Set(
  ((process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || ''))
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const superAdminEmails = new Set(
  ((process.env.SUPERADMIN_EMAILS || process.env.VITE_SUPERADMIN_EMAILS || ''))
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

type AppRole = 'superadmin' | 'admin' | 'customer';

function resolveUserRole(user: any): AppRole {
  const email = String(user?.email || '').toLowerCase();
  const metadataRole = String(
    user?.user_metadata?.app_role
    || user?.user_metadata?.role
    || user?.app_metadata?.app_role
    || user?.app_metadata?.role
    || ''
  ).toLowerCase();

  if (email && superAdminEmails.has(email)) return 'superadmin';
  if (metadataRole === 'superadmin') return 'superadmin';
  if (metadataRole === 'admin') return 'admin';
  if (email && adminEmails.has(email)) return 'admin';
  return 'customer';
}

interface UserPlanAndUsage {
  planName: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  messageLimit: number | null;
  botLimit: number | null;
  messagesUsed: number;
  botsCreated: number;
}

async function getUserPlanAndUsage(userId: string): Promise<UserPlanAndUsage> {
  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin!
    .from('subscriptions')
    .select('status, current_period_end, created_at, plan:plans(name, message_limit, bot_limit, storage_limit)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (subscriptionsError) {
    throw new Error(`Failed to fetch subscription: ${subscriptionsError.message}`);
  }

  const selectedSubscription = (subscriptions || []).find((row: any) => ACTIVE_SUBSCRIPTION_STATUSES.has(row.status))
    || subscriptions?.[0]
    || null;

  const selectedPlanValue = selectedSubscription?.plan;
  const selectedPlan = Array.isArray(selectedPlanValue)
    ? (selectedPlanValue[0] || null)
    : (selectedPlanValue || null);
  const planName = selectedPlan?.name == null ? 'No Pack' : String(selectedPlan.name);
  const messageLimit = selectedPlan?.message_limit == null
    ? (selectedPlan ? null : DEFAULT_NO_PLAN_MESSAGE_LIMIT)
    : Number(selectedPlan.message_limit);
  const botLimit = selectedPlan?.bot_limit == null
    ? (selectedPlan ? null : DEFAULT_NO_PLAN_BOT_LIMIT)
    : Number(selectedPlan.bot_limit);

  const { data: usageRow, error: usageError } = await supabaseAdmin!
    .from('usage')
    .select('messages_used, bots_created')
    .eq('user_id', userId)
    .maybeSingle();

  if (usageError) {
    throw new Error(`Failed to fetch usage: ${usageError.message}`);
  }

  return {
    planName,
    subscriptionStatus: selectedSubscription?.status || null,
    currentPeriodEnd: selectedSubscription?.current_period_end || null,
    messageLimit,
    botLimit,
    messagesUsed: Number(usageRow?.messages_used || 0),
    botsCreated: Number(usageRow?.bots_created || 0),
  };
}

async function resolveUserIdForPlanLimit(
  req: Request,
  res: Response,
  resource: PlanLimitResource
): Promise<string | null> {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase not configured' });
    return null;
  }

  if (resource === 'bots') {
    const user = await requireAuth(req, res);
    if (!user) return null;
    return user.id;
  }

  const chatbotId = req.body?.chatbotId;
  if (!chatbotId) {
    res.status(400).json({ error: 'chatbotId is required' });
    return null;
  }

  const { data: chatbotRow, error: chatbotError } = await supabaseAdmin
    .from('chatbots')
    .select('user_id')
    .eq('id', chatbotId)
    .maybeSingle();

  if (chatbotError) {
    res.status(500).json({ error: chatbotError.message });
    return null;
  }

  if (!chatbotRow?.user_id) {
    res.status(404).json({ error: 'Chatbot not found' });
    return null;
  }

  return chatbotRow.user_id;
}

async function shouldBypassPlanLimitsForUser(userId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user) {
    return false;
  }

  const role = resolveUserRole(userData.user);
  return role === 'admin' || role === 'superadmin';
}

function enforcePlanLimit(resource: PlanLimitResource) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await resolveUserIdForPlanLimit(req, res, resource);
      if (!userId) return;

      const bypassPlanLimits = await shouldBypassPlanLimitsForUser(userId);
      if (bypassPlanLimits) {
        res.locals.planLimitUserId = userId;
        next();
        return;
      }

      const { subscriptionStatus, messageLimit, botLimit, messagesUsed } = await getUserPlanAndUsage(userId);
      const hasActiveSubscription = ACTIVE_SUBSCRIPTION_STATUSES.has(String(subscriptionStatus || '').toLowerCase());

      if (
        resource === 'bots'
        && REQUIRE_ACTIVE_PLAN_FOR_BOT_CREATION
        && !hasActiveSubscription
      ) {
        return res.status(403).json({ error: 'Active subscription required to create chatbot' });
      }

      if (
        resource === 'messages'
        && REQUIRE_ACTIVE_PLAN_FOR_MESSAGES
        && !hasActiveSubscription
      ) {
        return res.status(403).json({ error: 'Active subscription required to send messages' });
      }

      const exceededMessages = resource === 'messages' && messageLimit !== null && messagesUsed >= messageLimit;
      let exceededBots = false;
      let activeChatbotCount: number | null = null;

      if (resource === 'bots' && botLimit !== null) {
        const { count, error: activeChatbotsError } = await supabaseAdmin!
          .from('chatbots')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (activeChatbotsError) {
          throw new Error(activeChatbotsError.message);
        }

        activeChatbotCount = Number(count || 0);
        exceededBots = activeChatbotCount >= botLimit;
      }

      if (exceededMessages) {
        return res.status(403).json({
          error: 'Message limit reached for your current plan',
          resource: 'messages',
          limit: messageLimit,
          used: messagesUsed,
          remaining: Math.max(0, Number(messageLimit || 0) - messagesUsed),
        });
      }

      if (exceededBots) {
        const usedBots = activeChatbotCount ?? 0;
        return res.status(403).json({
          error: 'Chatbot limit reached for your current plan',
          resource: 'bots',
          limit: botLimit,
          used: usedBots,
          remaining: Math.max(0, Number(botLimit || 0) - usedBots),
        });
      }

      res.locals.planLimitUserId = userId;
      next();
    } catch (error: any) {
      console.error('Plan limit middleware error:', error?.message || error);
      res.status(500).json({ error: 'Failed to enforce plan limits' });
    }
  };
}

// Middleware to enforce per-user daily limits with a persistent DB counter.
const rateLimitMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const authUserId = typeof res.locals.authUser?.id === 'string'
      ? res.locals.authUser.id
      : null;
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await supabaseAdmin.rpc('increment_daily_message_count', {
      target_user_id: authUserId,
      max_per_day: MESSAGE_LIMIT_PER_DAY
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const used = Number(row?.used_count || 0);
    const allowed = !!row?.allowed;
    const resetAt = row?.reset_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    if (!allowed) {
      const hoursUntilReset = Math.max(
        1,
        Math.ceil((new Date(resetAt).getTime() - Date.now()) / (1000 * 60 * 60))
      );
      return res.status(429).json({
        error: 'Daily message limit reached',
        message: `You have reached the daily limit of ${MESSAGE_LIMIT_PER_DAY} messages. Please try again in ${hoursUntilReset} hour(s).`,
        limit: MESSAGE_LIMIT_PER_DAY,
        remaining: 0,
        resetIn: hoursUntilReset
      });
    }

    res.setHeader('X-RateLimit-Limit', MESSAGE_LIMIT_PER_DAY.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MESSAGE_LIMIT_PER_DAY - used).toString());
    res.setHeader('X-RateLimit-Reset', resetAt);
    next();
  } catch (error: any) {
    console.error('Rate limit middleware error:', error?.message || error);
    res.status(500).json({ error: 'Failed to enforce rate limits' });
  }
};

//Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin || undefined)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check endpoint (no rate limit)
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Chatbot backend is running',
    rateLimit: {
      messagesPerDay: MESSAGE_LIMIT_PER_DAY,
      storage: 'database'
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

// Chat completion endpoint (with auth + rate limiting)
app.post('/api/chat', authMiddleware, rateLimitMiddleware, enforcePlanLimit('messages'), async (req: Request, res: Response) => {
  try {
    const { message, chatbotContext, conversationHistory, userName, chatbotId, conversationId, lang } = req.body;
    const authUserId = String(res.locals.authUser?.id || '');
    const selectedLang: 'en' | 'hi' = lang === 'hi' ? 'hi' : 'en';

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!chatbotId) {
      return res.status(400).json({ error: 'chatbotId is required' });
    }
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const { data: conversationRow, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .select('id, chatbot_id, user_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError) {
      return res.status(500).json({ error: 'Failed to validate conversation' });
    }
    if (!conversationRow || conversationRow.user_id !== authUserId) {
      return res.status(403).json({ error: 'Forbidden conversation access' });
    }
    if (conversationRow.chatbot_id !== chatbotId) {
      return res.status(400).json({ error: 'conversationId does not belong to chatbotId' });
    }

    const { data: chatbotRow, error: chatbotError } = await supabaseAdmin
      .from('chatbots')
      .select('id, user_id, is_embed_public, embed_allowed_origins')
      .eq('id', chatbotId)
      .maybeSingle();
    if (chatbotError) {
      return res.status(500).json({ error: 'Failed to validate chatbot access' });
    }
    if (!chatbotRow) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const isOwner = chatbotRow.user_id === authUserId;
    if (!isOwner) {
      if (!chatbotRow.is_embed_public) {
        return res.status(403).json({ error: 'Chatbot is not publicly embeddable' });
      }
      const allowedOrigins = Array.isArray(chatbotRow.embed_allowed_origins)
        ? chatbotRow.embed_allowed_origins.filter(Boolean)
        : [];
      if (allowedOrigins.length > 0 && !isAllowedOrigin(req.headers.origin, allowedOrigins, true)) {
        return res.status(403).json({ error: 'Origin is not allowed for this chatbot' });
      }
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

    const requestUserId = typeof res.locals.planLimitUserId === 'string'
      ? res.locals.planLimitUserId
      : null;
    await logErrorToDatabase(
      requestUserId,
      `AI chat error: ${error?.message || 'Unknown error'}`
    );

    res.status(500).json({
      error: 'Failed to generate AI response'
    });
  }
});

// ── Auth helpers ─────────────────────────────────────────────────────────────

// Extract and verify the Supabase JWT from the Authorization header.
// Returns the authenticated user or throws with a 401 response.
async function requireAuth(req: Request, res: Response): Promise<{ id: string; email: string; role: AppRole; isAdmin: boolean; isSuperAdmin: boolean } | null> {
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
  const role = resolveUserRole(data.user);
  return {
    id: data.user.id,
    email: data.user.email || '',
    role,
    isAdmin: role === 'admin' || role === 'superadmin',
    isSuperAdmin: role === 'superadmin',
  };
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.locals.authUser = user;
  next();
}

async function requireAdmin(req: Request, res: Response): Promise<{ id: string; email: string } | null> {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return { id: user.id, email: user.email || '' };
}

async function requireSuperAdmin(req: Request, res: Response): Promise<{ id: string; email: string } | null> {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!user.isSuperAdmin) {
    res.status(403).json({ error: 'Superadmin access required' });
    return null;
  }
  return { id: user.id, email: user.email || '' };
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

app.post('/api/chatbots', enforcePlanLimit('bots'), async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const authenticatedUserId = String(res.locals.planLimitUserId || '');
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('chatbots')
      .insert({
        user_id: authenticatedUserId,
        name,
        description,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    res.status(201).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create chatbot' });
  }
});

app.get('/api/chatbots/:chatbotId/limits', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const chatbotId = Array.isArray(req.params.chatbotId) ? req.params.chatbotId[0] : req.params.chatbotId;
    if (!chatbotId) {
      return res.status(400).json({ error: 'chatbotId is required' });
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    const owns = await requireChatbotOwner(user.id, chatbotId, res);
    if (!owns) return;

    const planUsage = await getUserPlanAndUsage(user.id);

    const { count: activeChatbotCount, error: activeChatbotsError } = await supabaseAdmin
      .from('chatbots')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (activeChatbotsError) {
      throw new Error(activeChatbotsError.message);
    }

    const messagesRemaining = planUsage.messageLimit === null
      ? null
      : Math.max(0, planUsage.messageLimit - planUsage.messagesUsed);

    const botsRemaining = planUsage.botLimit === null
      ? null
      : Math.max(0, planUsage.botLimit - planUsage.botsCreated);

    const activeBotsRemaining = planUsage.botLimit === null
      ? null
      : Math.max(0, planUsage.botLimit - Number(activeChatbotCount || 0));

    res.json({
      chatbotId,
      plan: {
        name: planUsage.planName,
        status: planUsage.subscriptionStatus,
        currentPeriodEnd: planUsage.currentPeriodEnd,
        messageLimit: planUsage.messageLimit,
        botLimit: planUsage.botLimit,
      },
      usage: {
        messagesUsed: planUsage.messagesUsed,
        botsCreated: planUsage.botsCreated,
        activeChatbots: Number(activeChatbotCount || 0),
      },
      remaining: {
        messages: messagesRemaining,
        botsCreated: botsRemaining,
        activeChatbots: activeBotsRemaining,
      },
      isExceeded: {
        messages: planUsage.messageLimit !== null && planUsage.messagesUsed >= planUsage.messageLimit,
        botsCreated: planUsage.botLimit !== null && planUsage.botsCreated >= planUsage.botLimit,
        activeChatbots: planUsage.botLimit !== null && Number(activeChatbotCount || 0) >= planUsage.botLimit,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load chatbot limits' });
  }
});

app.get('/api/admin/chatbots', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { data: chatbots, error: chatbotError } = await supabaseAdmin
      .from('chatbots')
      .select('id, name, description, user_id, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (chatbotError) {
      throw new Error(chatbotError.message);
    }

    const userIds = Array.from(new Set((chatbots || []).map((row: any) => row.user_id).filter(Boolean)));

    const userEmailMap = new Map<string, string>();
    for (const userId of userIds) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!userError && userData?.user?.email) {
        userEmailMap.set(userId, userData.user.email);
      }
    }

    const rows = (chatbots || []).map((row: any) => ({
      ...row,
      user_email: userEmailMap.get(row.user_id) || null,
    }));

    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load admin chatbot list' });
  }
});

app.delete('/api/admin/chatbots/:chatbotId', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const chatbotId = Array.isArray(req.params.chatbotId) ? req.params.chatbotId[0] : req.params.chatbotId;
    if (!chatbotId) {
      return res.status(400).json({ error: 'chatbotId is required' });
    }

    const { error } = await supabaseAdmin
      .from('chatbots')
      .delete()
      .eq('id', chatbotId);

    if (error) {
      throw new Error(error.message);
    }

    res.json({ success: true, chatbotId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete chatbot' });
  }
});

app.get('/api/admin/users', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const superAdmin = await requireSuperAdmin(req, res);
    if (!superAdmin) return;

    const allUsers: any[] = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);

      const users = data?.users || [];
      if (users.length === 0) break;

      allUsers.push(...users);
      if (users.length < perPage) break;
      page += 1;
    }

    const { data: allChatbots, error: chatbotError } = await supabaseAdmin
      .from('chatbots')
      .select('user_id');

    if (chatbotError) throw new Error(chatbotError.message);

    const chatbotCountByUser = new Map<string, number>();
    for (const row of allChatbots || []) {
      const userId = String((row as any).user_id || '');
      if (!userId) continue;
      chatbotCountByUser.set(userId, (chatbotCountByUser.get(userId) || 0) + 1);
    }

    const rows = allUsers
      .map((user) => {
        const fullName = String(user.user_metadata?.full_name || '').trim();
        const username = String(user.user_metadata?.username || user.user_metadata?.user_name || '').trim();
        const email = String(user.email || '').trim();
        const hasIdentity = Boolean(email || fullName || username);

        return {
          id: user.id,
          name: fullName || username || (email ? email.split('@')[0] : 'User'),
          email,
          role: resolveUserRole(user),
          chatbot_count: chatbotCountByUser.get(user.id) || 0,
          has_identity: hasIdentity,
        };
      })
      .filter((row) => row.has_identity);

    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load users' });
  }
});

app.patch('/api/admin/users/:userId/role', async (req: Request, res: Response) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const superAdmin = await requireSuperAdmin(req, res);
    if (!superAdmin) return;

    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const requestedRole = String(req.body?.role || '').toLowerCase();

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (requestedRole !== 'admin' && requestedRole !== 'customer') {
      return res.status(400).json({ error: 'role must be admin or customer' });
    }

    const { data: targetUserData, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetUserError || !targetUserData?.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetRole = resolveUserRole(targetUserData.user);
    if (targetRole === 'superadmin') {
      return res.status(403).json({ error: 'Cannot change superadmin role' });
    }

    const nextMetadata = {
      ...(targetUserData.user.user_metadata || {}),
      app_role: requestedRole,
      role: requestedRole,
    };

    let updatedUserData: any = null;

    const nextAppMetadata = {
      ...(targetUserData.user.app_metadata || {}),
      app_role: requestedRole,
      role: requestedRole,
    };

    const { data: updateWithAppMetaData, error: updateWithAppMetaError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: nextMetadata,
      app_metadata: nextAppMetadata,
    });

    if (updateWithAppMetaError) {
      // Fallback for projects where app_metadata update paths are restricted.
      const { data: updateUserMetaOnlyData, error: updateUserMetaOnlyError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: nextMetadata,
      });

      if (updateUserMetaOnlyError) {
        throw new Error(`Failed to update role: ${updateUserMetaOnlyError.message}`);
      }

      updatedUserData = updateUserMetaOnlyData;
    } else {
      updatedUserData = updateWithAppMetaData;
    }

    res.json({
      success: true,
      userId,
      role: resolveUserRole(updatedUserData.user),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update user role' });
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
    if (file.size > MAX_PDF_UPLOAD_SIZE_BYTES) {
      return res.status(400).json({ error: 'File exceeds 5 MB limit' });
    }

    const isSessionOnly = sessionOnly === 'true';
    const user = await requireAuth(req, res);
    if (!user) return;

    // Persistent uploads require the authenticated chatbot owner.
    // Session-only uploads are allowed for authenticated embedded visitors when
    // they are chatting on a public bot from an allowed origin.
    if (!isSessionOnly) {
      const owns = await requireChatbotOwner(user.id, chatbotId, res);
      if (!owns) return;

      const { count: existingPdfCount, error: countError } = await supabaseAdmin
        .from('chatbot_knowledge_sources')
        .select('id', { count: 'exact', head: true })
        .eq('chatbot_id', chatbotId)
        .eq('source_type', 'pdf');

      if (countError) {
        return res.status(500).json({ error: 'Failed to validate PDF upload limit' });
      }

      if ((existingPdfCount || 0) >= MAX_PDF_SOURCES_PER_CHATBOT) {
        return res.status(409).json({
          error: `PDF upload limit reached. You can keep up to ${MAX_PDF_SOURCES_PER_CHATBOT} PDFs. Delete one to upload another.`
        });
      }
    } else {
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required for session uploads' });
      }

      const { data: conversationRow, error: conversationError } = await supabaseAdmin
        .from('conversations')
        .select('id, chatbot_id, user_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (conversationError) {
        return res.status(500).json({ error: 'Failed to validate conversation' });
      }
      if (!conversationRow || conversationRow.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden conversation access' });
      }
      if (conversationRow.chatbot_id !== chatbotId) {
        return res.status(400).json({ error: 'conversationId does not belong to chatbotId' });
      }

      const { data: chatbotRow, error: chatbotError } = await supabaseAdmin
        .from('chatbots')
        .select('id, user_id, is_embed_public, embed_allowed_origins')
        .eq('id', chatbotId)
        .maybeSingle();
      if (chatbotError) return res.status(500).json({ error: 'Failed to validate chatbot access' });
      if (!chatbotRow) return res.status(404).json({ error: 'Chatbot not found' });

      if (chatbotRow.user_id !== user.id) {
        if (!chatbotRow.is_embed_public) {
          return res.status(403).json({ error: 'Chatbot is not publicly embeddable' });
        }
        const allowedOrigins = Array.isArray(chatbotRow.embed_allowed_origins)
          ? chatbotRow.embed_allowed_origins.filter(Boolean)
          : [];
        if (allowedOrigins.length > 0 && !isAllowedOrigin(req.headers.origin, allowedOrigins, true)) {
          return res.status(403).json({ error: 'Origin is not allowed for this chatbot' });
        }
      }
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
  let websiteTestUserId: string | null = null;
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

    const user = await requireAuth(req, res);
    if (!user) return;
    websiteTestUserId = user.id;

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
    await logErrorToDatabase(
      websiteTestUserId,
      `Website knowledge test AI error: ${err?.message || 'Unknown error'}`
    );

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
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🤖 Chatbot backend running on http://localhost:${PORT}`);
  console.log(`✅ AI mode: ${AI_PROVIDER === 'ollama-only' ? 'ollama-only' : 'groq-primary'}`);
  console.log(`✅ Groq API key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`✅ Ollama fallback enabled: ${OLLAMA_FALLBACK_ENABLED}`);
  console.log(`✅ RAG limits: matches=${RAG_MATCH_COUNT}, neighbours=${RAG_NEIGHBOR_WINDOW}, contextChars=${RAG_MAX_CONTEXT_CHARS}, threshold=${RAG_MATCH_THRESHOLD}, fallbackFloor=${RAG_FALLBACK_MIN_SIMILARITY}, history=${CHAT_HISTORY_LIMIT}, output=${AI_MAX_OUTPUT_TOKENS}`);
  console.log(`✅ CORS allowlist entries: ${corsAllowlist.length}`);
  console.log(`✅ Daily message rate limit: ${MESSAGE_LIMIT_PER_DAY} (database-backed)`);
  if (AI_PROVIDER === 'ollama-only' || OLLAMA_FALLBACK_ENABLED) {
    console.log(`✅ Ollama endpoint: ${OLLAMA_BASE_URL}`);
    console.log(`✅ Ollama model: ${OLLAMA_MODEL}`);
  }
});
