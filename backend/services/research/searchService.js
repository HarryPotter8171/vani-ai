/**
 * Multi-provider web search for Deep Research.
 * Providers: Tavily (optional), Gemini Google Search grounding, DuckDuckGo HTML fallback.
 */

import { CHAT_MODEL, getGeminiClient } from "../geminiClient.js";
import { RESEARCH_CONFIG } from "./config.js";
import { searchCache } from "./cache.js";
import { createTimeoutSignal, withRetry } from "./urlSafety.js";

/**
 * @typedef {{ title: string, url: string, snippet: string, provider: string }} SearchHit
 */

/**
 * Run a single query across available providers (parallel), merge + dedupe.
 * @param {string} query
 * @param {{ signal?: AbortSignal, maxResults?: number }} [opts]
 * @returns {Promise<{ query: string, results: SearchHit[], providers: string[] }>}
 */
export async function searchWeb(query, { signal, maxResults } = {}) {
  const q = String(query || "").trim();
  if (!q) return { query: "", results: [], providers: [] };

  const limit = maxResults ?? RESEARCH_CONFIG.maxResultsPerQuery;
  const cacheKey = `search:${q}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const providers = [];
  /** @type {SearchHit[]} */
  const merged = [];

  const tasks = [
    searchTavily(q, signal).then((r) => {
      if (r?.length) {
        providers.push("tavily");
        merged.push(...r);
      }
    }),
    searchGeminiGrounding(q, signal).then((r) => {
      if (r?.length) {
        providers.push("google_search");
        merged.push(...r);
      }
    }),
    searchDuckDuckGo(q, signal).then((r) => {
      if (r?.length) {
        providers.push("duckduckgo");
        merged.push(...r);
      }
    }),
  ];

  await Promise.allSettled(tasks);

  const results = dedupeHits(merged).slice(0, limit);
  const payload = { query: q, results, providers: [...new Set(providers)] };
  if (results.length) searchCache.set(cacheKey, payload);
  return payload;
}

/** Bounded concurrency for multi-query search (BE-M3). */
const SEARCH_MANY_CONCURRENCY = 3;

/**
 * Run multiple queries with light concurrency.
 * @param {string[]} queries
 * @param {{ signal?: AbortSignal, onQueryDone?: (payload: object) => void }} [opts]
 */
export async function searchMany(queries, { signal, onQueryDone } = {}) {
  const list = (queries || []).map((q) => String(q).trim()).filter(Boolean);
  /** @type {SearchHit[]} */
  const all = [];
  const providers = new Set();
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      if (signal?.aborted) return;
      const index = cursor;
      cursor += 1;
      const q = list[index];
      const result = await searchWeb(q, { signal });
      for (const p of result.providers) providers.add(p);
      all.push(...result.results);
      onQueryDone?.(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(SEARCH_MANY_CONCURRENCY, list.length || 1) },
    () => worker()
  );
  await Promise.all(workers);

  return {
    results: dedupeHits(all),
    providers: [...providers],
  };
}

async function searchTavily(query, signal) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  return withRetry(
    async () => {
      const { signal: timeoutSignal, cleanup } = createTimeoutSignal(
        RESEARCH_CONFIG.searchTimeoutMs,
        signal
      );
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: key,
            query,
            search_depth: "advanced",
            max_results: RESEARCH_CONFIG.maxResultsPerQuery,
            include_answer: false,
          }),
          signal: timeoutSignal,
        });
        if (!res.ok) throw new Error(`Tavily ${res.status}`);
        const data = await res.json();
        return (data.results || []).map((r) => ({
          title: String(r.title || "").trim() || r.url,
          url: String(r.url || "").trim(),
          snippet: String(r.content || "").trim().slice(0, 500),
          provider: "tavily",
        })).filter((h) => h.url);
      } finally {
        cleanup();
      }
    },
    { retries: RESEARCH_CONFIG.maxRetries, delayMs: RESEARCH_CONFIG.retryDelayMs, signal }
  ).catch(() => []);
}

async function searchGeminiGrounding(query, signal) {
  return withRetry(
    async () => {
      const response = await getGeminiClient().models.generateContent({
        model: CHAT_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Search the web for: ${query}\nReturn the most relevant findings with source URLs.`,
              },
            ],
          },
        ],
        config: {
          tools: [{ googleSearch: {} }],
          abortSignal: signal,
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const findings = String(response.text || "").slice(0, 1200);

      return chunks
        .map((c, i) => ({
          title: String(c.web?.title || `Source ${i + 1}`).trim(),
          url: String(c.web?.uri || "").trim(),
          snippet: findings.slice(0, 400),
          provider: "google_search",
        }))
        .filter((h) => h.url);
    },
    { retries: 1, delayMs: RESEARCH_CONFIG.retryDelayMs, signal }
  ).catch(() => []);
}

async function searchDuckDuckGo(query, signal) {
  return withRetry(
    async () => {
      const { signal: timeoutSignal, cleanup } = createTimeoutSignal(
        RESEARCH_CONFIG.searchTimeoutMs,
        signal
      );
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; VANI-Research/1.0; +https://vani.ai)",
            Accept: "text/html",
          },
          signal: timeoutSignal,
        });
        if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
        const html = await res.text();
        return parseDuckDuckGoHtml(html).slice(0, RESEARCH_CONFIG.maxResultsPerQuery);
      } finally {
        cleanup();
      }
    },
    { retries: 1, delayMs: RESEARCH_CONFIG.retryDelayMs, signal }
  ).catch(() => []);
}

function parseDuckDuckGoHtml(html) {
  /** @type {import('./searchService.js').SearchHit[]} */
  const hits = [];
  const re =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && hits.length < 10) {
    const href = decodeDuckRedirect(match[1]);
    const title = stripTags(match[2]).trim();
    if (!href || !title) continue;
    hits.push({
      title,
      url: href,
      snippet: "",
      provider: "duckduckgo",
    });
  }
  return hits;
}

function decodeDuckRedirect(href) {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    if (u.pathname === "/l/" && u.searchParams.get("uddg")) {
      return decodeURIComponent(u.searchParams.get("uddg"));
    }
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return "";
}

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

/**
 * @param {SearchHit[]} hits
 * @returns {SearchHit[]}
 */
export function dedupeHits(hits) {
  const seen = new Set();
  const out = [];
  for (const hit of hits || []) {
    if (!hit?.url) continue;
    let key;
    try {
      const u = new URL(hit.url);
      key = `${u.hostname.replace(/^www\./, "")}${u.pathname}`.toLowerCase();
    } catch {
      key = hit.url.toLowerCase();
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}
