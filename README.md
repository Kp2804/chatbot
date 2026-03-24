
# Chatbot Platform

An AI-powered chatbot builder with multi-chatbot support, RAG knowledge base, FAQ management, visual workflow editor, analytics, and embeddable widget.

## Tech stack

- **Frontend** — React + TypeScript + Vite + Tailwind CSS
- **Backend** — Node.js + Express (TypeScript, ESM)
- **Database / Auth** — Supabase (Postgres + Row Level Security)
- **AI** — Groq (chat completions) + `@xenova/transformers` (local embeddings)

---

## Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key

---

## Local development setup

### 1. Clone and install

```bash
git clone https://github.com/Kp2804/chatbot.git
cd chatbot
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your real values:

```bash
cp .env.example .env
```

Open `.env` and set:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon/public key |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Project Settings → API → service_role key (**keep secret**) |
| `GROQ_API_KEY` | https://console.groq.com/keys |
| `VITE_BACKEND_URL` | `http://localhost:3001` for local dev |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins for frontend/widget |

> **Never commit `.env`** — it is listed in `.gitignore`.

### 3. Run database migrations

In the Supabase SQL editor, run the files in this order:

1. `backend/database/schemas/supabase_schema.sql` — core tables + RLS policies
2. `backend/database/schemas/supabase_multi_chatbot.sql` — multi-chatbot support
3. `backend/database/schemas/supabase_chatbot_features.sql` — workflows, FAQs, analytics
4. `backend/database/schemas/supabase_embed_read_policies.sql` — embedded widget read access
5. `backend/database/migrations/rag_tables.sql` — document chunks + vector search function
6. `backend/database/migrations/embed_public_access.sql` — secure public embed access policies
7. `backend/database/migrations/api_rate_limits.sql` — database-backed daily API rate limiting
8. `backend/database/migrations/multitenant_policy_hardening.sql` — strict cross-tenant ownership checks

### 4. Start the development servers

```bash
npm run dev:all   # starts both Vite (port 5173) and Express backend (port 3001)
```

Or separately:

```bash
npm run dev       # frontend only
npm run backend   # backend only
```

Open http://localhost:5173 in your browser.

### Use Ollama locally instead of Groq

If you want the chatbot to generate answers with a local model on your Mac:

1. Install and start Ollama
2. Pull a model, for example:

```bash
ollama pull qwen2.5:7b-instruct
```

3. Update your `.env`:

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
```

4. Restart the backend server

The existing PDF knowledge-base retrieval still works the same way. Only the final text generation step switches from Groq to Ollama.

---

## Project structure

```
frontend/src/
  app/components/   # React page components (auth, chat, knowledge, FAQ, etc.)
  lib/supabase.ts   # Supabase client + auth token helper
backend/
  index.ts          # Express API (chat, knowledge base RAG, embeddings)
database/
  schemas/          # SQL table definitions and RLS policies
  migrations/       # Incremental schema changes
public/
  chatbot-widget.js # Embeddable customer chat widget
```

---

## Embedding the widget on a customer site

See `CUSTOMER_EMBED_SNIPPET.html` for a ready-to-use `<script>` tag.  
The widget loads `chatbot-widget.js` and accepts a `data-chatbot-id` attribute.

---

## Production notes

- Daily message rate limiting is database-backed. Run `backend/database/migrations/api_rate_limits.sql` before production traffic.
- Set `VITE_BACKEND_URL` to your deployed backend URL when building for production.
- Set `CORS_ALLOWED_ORIGINS` to your exact production frontend/widget origins.
- Set `VITE_ADMIN_EMAILS` (comma-separated) so only your platform admins can access admin-only pages.
- Users not in `VITE_ADMIN_EMAILS` are treated as customers and get a restricted workspace view.
- Mark only intended chatbots as public embeds with `chatbots.is_embed_public = true`.
- Optionally set per-chatbot `chatbots.embed_allowed_origins` to restrict where the widget can run.
- Run `npm run build` from the project root to produce a static build.
