const LIBRE_TRANSLATE_URL = 'https://libretranslate.de/translate';
const MYMEMORY_TRANSLATE_URL = 'https://api.mymemory.translated.net/get';

const cache = new Map<string, string>();

interface LibreTranslateResponse {
  translatedText?: string;
  error?: string;
}

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
  };
}

async function tryLibreTranslate(text: string, target: string, source: string): Promise<string | null> {
  try {
    const response = await fetch(LIBRE_TRANSLATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: 'text'
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LibreTranslateResponse;
    if (typeof data.translatedText === 'string' && data.translatedText.trim()) {
      return data.translatedText;
    }
  } catch {
    return null;
  }

  return null;
}

async function tryMyMemoryTranslate(text: string, target: string, source: string): Promise<string | null> {
  try {
    const langPair = `${source}|${target}`;
    const query = new URLSearchParams({
      q: text,
      langpair: langPair
    });

    const response = await fetch(`${MYMEMORY_TRANSLATE_URL}?${query.toString()}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as MyMemoryResponse;
    const translated = data.responseData?.translatedText;
    if (typeof translated === 'string' && translated.trim()) {
      return translated;
    }
  } catch {
    return null;
  }

  return null;
}

export async function translateText(text: string, target: string, source: string): Promise<string> {
  if (!text || !text.trim()) {
    return text;
  }

  if (source === target) {
    return text;
  }

  const cacheKey = `${text}-${target}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const normalizedSource = source === 'auto' ? 'en' : source;
  const libreTranslated = await tryLibreTranslate(text, target, source);
  const fallbackTranslated = libreTranslated || await tryMyMemoryTranslate(text, target, normalizedSource);
  const translated = fallbackTranslated || text;

  cache.set(cacheKey, translated);
  return translated;
}
