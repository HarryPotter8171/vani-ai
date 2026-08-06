/**
 * Parallel page fetcher with SSRF guards, timeouts, retries, and caching.
 */

import { RESEARCH_CONFIG } from "./config.js";
import { pageCache } from "./cache.js";
import {
  createTimeoutSignal,
  fetchWithSafeRedirects,
  validatePublicUrl,
  withRetry,
} from "./urlSafety.js";

/**
 * @typedef {{
 *   url: string,
 *   title: string,
 *   text: string,
 *   snippet: string,
 *   ok: boolean,
 *   error?: string,
 *   fetchedAt: number,
 *   contentType?: string,
 * }} FetchedSource
 */

/**
 * Fetch and extract text from multiple URLs with bounded concurrency.
 * @param {Array<{ url: string, title?: string, snippet?: string }>} sources
 * @param {{ signal?: AbortSignal, onFetched?: (s: FetchedSource) => void }} [opts]
 * @returns {Promise<FetchedSource[]>}
 */
export async function fetchSources(sources, { signal, onFetched } = {}) {
  const list = (sources || []).slice(0, RESEARCH_CONFIG.maxSourcesToFetch);
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      const item = list[index];
      const fetched = await fetchOneSource(item, signal);
      results[index] = fetched;
      onFetched?.(fetched);
    }
  }

  const workers = Array.from(
    { length: Math.min(RESEARCH_CONFIG.fetchConcurrency, list.length || 1) },
    () => worker()
  );
  await Promise.all(workers);
  return results.filter(Boolean);
}

/**
 * @param {{ url: string, title?: string, snippet?: string }} item
 * @param {AbortSignal} [signal]
 * @returns {Promise<FetchedSource>}
 */
export async function fetchOneSource(item, signal) {
  const url = String(item?.url || "").trim();
  const titleHint = String(item?.title || "").trim();
  const snippetHint = String(item?.snippet || "").trim();

  const validation = validatePublicUrl(url);
  if (!validation.ok) {
    return {
      url,
      title: titleHint || url,
      text: "",
      snippet: snippetHint,
      ok: false,
      error: validation.error,
      fetchedAt: Date.now(),
    };
  }

  const cacheKey = `page:${validation.url.href}`;
  const cached = pageCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      title: cached.title || titleHint,
      snippet: cached.snippet || snippetHint,
    };
  }

  try {
    const fetched = await withRetry(
      () => downloadAndExtract(validation.url.href, signal),
      {
        retries: RESEARCH_CONFIG.maxRetries,
        delayMs: RESEARCH_CONFIG.retryDelayMs,
        signal,
      }
    );

    const result = {
      url: validation.url.href,
      title: fetched.title || titleHint || validation.url.hostname,
      text: fetched.text,
      snippet: snippetHint || fetched.text.slice(0, 280),
      ok: true,
      fetchedAt: Date.now(),
      contentType: fetched.contentType,
    };

    if (result.text) pageCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      url: validation.url.href,
      title: titleHint || validation.url.hostname,
      text: snippetHint,
      snippet: snippetHint,
      ok: false,
      error: err?.message || "Fetch failed",
      fetchedAt: Date.now(),
    };
  }
}

async function downloadAndExtract(url, signal) {
  const { signal: timeoutSignal, cleanup } = createTimeoutSignal(
    RESEARCH_CONFIG.fetchTimeoutMs,
    signal
  );

  try {
    const res = await fetchWithSafeRedirects(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VANI-Research/1.0; +https://vani.ai)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: timeoutSignal,
      maxRedirects: 5,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Cap body size — avoid downloading huge binaries.
    const contentType = res.headers.get("content-type") || "";
    if (
      contentType &&
      !/text\/|json|xml|html|markdown|javascript/i.test(contentType) &&
      !contentType.includes("octet-stream")
    ) {
      // Still try text for ambiguous types; reject clear media.
      if (/image|audio|video|pdf|zip|octet/i.test(contentType) && !/html|text/i.test(contentType)) {
        throw new Error("Unsupported content type");
      }
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2_000_000) {
      throw new Error("Page too large");
    }

    const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const title = extractTitle(raw) || "";
    const text = htmlToText(raw).slice(0, RESEARCH_CONFIG.maxExtractChars);

    if (!text || text.length < 40) {
      throw new Error("Insufficient extractable text");
    }

    return { title, text, contentType };
  } finally {
    cleanup();
  }
}

function extractTitle(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])).trim().slice(0, 200) : "";
}

/**
 * Lightweight HTML → readable text (no cheerio dependency).
 */
export function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return s;
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]+>/g, " ");
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}
