// @deno-types="https://deno.land/x/deno@v1.40.0/deno.d.ts"
// @ts-ignore - Deno global available in Supabase Edge Runtime
/// <reference lib="deno.window" />

const rawAllowlist = (Deno.env.get("CORS_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((value: string) => value.trim())
  .filter(Boolean);

function normalizeHost(value: string) {
  return value.trim().replace(/^\*\./, "").toLowerCase();
}

function originMatchesAllowed(origin: string, allowed: string) {
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const allowedHost = normalizeHost(allowed);
    if (!allowedHost) return false;

    if (allowed.startsWith("*.")) {
      return originHost === allowedHost || originHost.endsWith(`.${allowedHost}`);
    }

    if (allowed.startsWith("http://") || allowed.startsWith("https://")) {
      const allowedUrl = new URL(allowed);
      return origin.toLowerCase() === `${allowedUrl.protocol}//${allowedUrl.host}`.toLowerCase();
    }

    return originHost === allowedHost;
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | null, requirePresent = false): boolean {
  if (!origin) return !requirePresent;
  if (rawAllowlist.length === 0) return false;
  return rawAllowlist.some((allowed: string) => originMatchesAllowed(origin, allowed));
}

export function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowedOrigin = isAllowedOrigin(origin, false)
    ? (origin || (rawAllowlist[0] || "*"))
    : "null";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
