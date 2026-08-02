import { CHAT_MODEL, getGeminiClient } from "../../services/geminiClient.js";

/**
 * Web search via Vertex Google Search grounding (no extra API key).
 * Optional override: TAVILY_API_KEY for Tavily Search.
 */
async function searchWithTavily(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = await res.json();
  return {
    provider: "tavily",
    answer: data.answer || "",
    results: (data.results || []).slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    })),
  };
}

async function searchWithGeminiGrounding(query) {
  const response = await getGeminiClient().models.generateContent({
    model: CHAT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Perform a web search for the following query and return a concise, factual briefing with key points and source URLs when available.\n\nQuery: ${query}`,
          },
        ],
      },
    ],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const grounding =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c) => ({
      title: c.web?.title,
      url: c.web?.uri,
    })) || [];

  return {
    provider: "google_search_grounding",
    findings: response.text || "",
    sources: grounding.filter((s) => s.url).slice(0, 8),
  };
}

export const webSearchTool = {
  id: "web_search",
  name: "web_search",
  displayName: "Web Search",
  description:
    "Search the live web for up-to-date information. Use for news, facts, prices, docs, current events, or anything that may have changed after your knowledge cutoff.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args = {}) {
    const query = String(args.query || "").trim();
    if (!query) return { ok: false, error: "Query is required" };
    if (query.length > 500) return { ok: false, error: "Query too long" };

    try {
      const tavily = await searchWithTavily(query);
      if (tavily) return { ok: true, query, ...tavily };

      const grounded = await searchWithGeminiGrounding(query);
      return { ok: true, query, ...grounded };
    } catch (err) {
      return { ok: false, error: err.message || "Web search failed", query };
    }
  },
};
