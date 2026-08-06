import { CHAT_MODEL, getGeminiClient } from "../../geminiClient.js";
import { VANI_IDENTITY_LOCK } from "../../identity.js";
import {
  forcedIdentityReply,
  sanitizeIdentityResponse,
} from "../../identity/IdentityGuard.js";
import { PDF_QA_CONTEXT_CHARS, PDF_QA_MODEL } from "../config.js";
import { searchPdfIndex, findMentions } from "../search/search.js";
import { getConversation, appendTurn } from "../session/conversation.js";

/**
 * Answer a natural-language question about a PDF with page citations.
 * Uses retrieve → reason (extractive first, generative when available).
 * Conversation history enables follow-ups without re-uploading.
 */
export async function askPdfQuestion({
  analysis,
  index,
  question,
  sessionId = null,
  fileId = null,
  onProgress,
} = {}) {
  const q = String(question || "").trim();
  if (!q) {
    return {
      answer: "Please ask a question about this PDF.",
      citations: [],
      documentType: analysis?.semanticType?.documentType || null,
    };
  }

  // Identity probes short-circuit before any PDF retrieval / generation.
  const forcedIdentity = forcedIdentityReply(q);
  if (forcedIdentity) {
    return {
      answer: forcedIdentity,
      citations: [],
      documentType: analysis?.semanticType?.documentType || null,
    };
  }

  const emit = (stage, detail = {}) => {
    if (typeof onProgress === "function") {
      try {
        onProgress({ stage, ...detail });
      } catch {
        /* ignore */
      }
    }
  };

  emit("analyzing", { message: "Analyzing..." });

  // Fast-path extractive answers for common intents (no LLM needed).
  const extractive = tryExtractiveAnswer(analysis, q);
  if (extractive) {
    extractive.answer = sanitizeIdentityResponse(extractive.answer, q);
    if (fileId && sessionId) {
      appendTurn(fileId, sessionId, { role: "user", content: q });
      appendTurn(fileId, sessionId, {
        role: "assistant",
        content: extractive.answer,
        citations: extractive.citations,
      });
    }
    return extractive;
  }

  // "Find all X" → mention search
  if (/^(find|list|show|locate)\b/i.test(q) || /\bmentions?\b/i.test(q)) {
    emit("searching", { message: "Searching document..." });
    const mentions = findMentions(analysis.pages || [], q);
    if (mentions.length) {
      const lines = mentions.slice(0, 40).map((m) => {
        const page = formatPage(m.page);
        return `• ${m.label !== "mention" ? `${m.label}: ` : ""}${m.match} (${page})`;
      });
      const answer = sanitizeIdentityResponse(
        `Found ${mentions.length} match${mentions.length === 1 ? "" : "es"}:\n${lines.join("\n")}`,
        q
      );
      const citations = [...new Set(mentions.map((m) => m.page))].filter(Boolean);
      const result = { answer, citations: citations.map((p) => ({ page: p })), mentions };
      if (fileId && sessionId) {
        appendTurn(fileId, sessionId, { role: "user", content: q });
        appendTurn(fileId, sessionId, { role: "assistant", content: answer, citations });
      }
      return result;
    }
  }

  emit("searching", { message: "Retrieving relevant pages..." });
  const hits = index
    ? await searchPdfIndex(index, q)
    : keywordFallback(analysis.pages || [], q);

  const context = buildContext(hits, analysis, PDF_QA_CONTEXT_CHARS);
  const history = fileId && sessionId ? getConversation(fileId, sessionId) : [];

  emit("generating", { message: "Generating answer..." });

  let answer;
  let citations = hitsToCitations(hits);

  try {
    answer = await generateAnswer({
      question: q,
      context,
      history,
      documentType: analysis?.semanticType?.documentType,
      pageCount: analysis?.pageCount,
      filename: analysis?.filename,
    });
    // Ensure at least one page citation if we had hits
    if (!/\(Page\s+\d+/i.test(answer) && citations.length) {
      answer = `${answer.trim()} (${formatPage(citations[0].page)}).`;
    }
  } catch (err) {
    answer = buildExtractiveFallback(hits, q, analysis);
  }

  // Identity Guard — never expose provider/model identity via PDF Q&A.
  answer = sanitizeIdentityResponse(answer, q);

  if (fileId && sessionId) {
    appendTurn(fileId, sessionId, { role: "user", content: q });
    appendTurn(fileId, sessionId, {
      role: "assistant",
      content: answer,
      citations,
    });
  }

  return {
    answer,
    citations,
    hits: hits.map((h) => ({
      pageStart: h.pageStart,
      pageEnd: h.pageEnd,
      score: Math.round(h.score * 1000) / 1000,
      matchType: h.matchType,
      snippet: h.content.slice(0, 240),
    })),
  };
}

function tryExtractiveAnswer(analysis, q) {
  const lower = q.toLowerCase();
  const pages = analysis?.pages || [];
  const pageCount = analysis?.pageCount || pages.length;

  if (/how many pages|page count|number of pages/.test(lower)) {
    return {
      answer: `This document has ${pageCount} page${pageCount === 1 ? "" : "s"}.`,
      citations: pageCount ? [{ page: 1 }] : [],
    };
  }

  if (/what (type|kind) of (document|pdf)|document type|classify/.test(lower)) {
    const t = analysis?.semanticType?.documentType || "Document";
    const conf = analysis?.semanticType?.confidence;
    return {
      answer: `This appears to be a **${t}**${
        conf != null ? ` (confidence ${Math.round(conf * 100)}%)` : ""
      }.`,
      citations: [{ page: 1 }],
    };
  }

  if (/list all tables|show (me )?tables|what tables/.test(lower)) {
    const tables = analysis?.tables || [];
    if (!tables.length) {
      return {
        answer: "No tables were detected in this PDF.",
        citations: [],
        tables: [],
      };
    }
    const lines = tables.map((t, i) => {
      const page = formatPage(t.page);
      return `${i + 1}. Table with columns [${t.columns.join(", ")}] — ${t.rows.length} row(s) (${page})`;
    });
    return {
      answer: `Found ${tables.length} table${tables.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      citations: tables.map((t) => ({ page: t.page })).filter((c) => c.page),
      tables,
    };
  }

  if (/who issued|issued by|issuer|provider|from whom/.test(lower)) {
    const issuer = findIssuer(analysis);
    if (issuer) {
      return {
        answer: `This document appears to be issued by **${issuer.value}** (${formatPage(issuer.page)}).`,
        citations: [{ page: issuer.page }],
      };
    }
  }

  // Explain specific page
  const pageMatch = lower.match(/(?:explain|summarize|what(?:'s| is) on)\s+page\s+(\d+)/i)
    || q.match(/^page\s+(\d+)$/i);
  if (pageMatch) {
    const n = Number(pageMatch[1]);
    const page = pages.find((p) => p.page === n);
    if (!page) {
      return {
        answer: `Page ${n} was not found. This PDF has ${pageCount} pages.`,
        citations: [],
      };
    }
    const text = (page.text || "").trim();
    if (!text) {
      return {
        answer: `Page ${n} has no selectable text (it may be a scanned image).`,
        citations: [{ page: n }],
      };
    }
    const summary = text.length > 600 ? `${text.slice(0, 600).trim()}…` : text;
    return {
      answer: `Page ${n}:\n\n${summary}`,
      citations: [{ page: n }],
    };
  }

  // Clause / section lookup (e.g. "What does clause 8 mean?")
  const clauseMatch = q.match(/\b(?:clause|section|article)\s+(\d+[a-z]?)\b/i);
  if (clauseMatch) {
    const num = clauseMatch[1];
    const re = new RegExp(
      `(?:clause|section|article)\\s*${num}\\b[^\\n]*\\n?([\\s\\S]{0,400})`,
      "i"
    );
    for (const page of pages) {
      const m = (page.text || "").match(re);
      if (m) {
        const excerpt = m[0].replace(/\s+/g, " ").trim().slice(0, 400);
        return {
          answer: `${excerpt} (${formatPage(page.page)}).`,
          citations: [{ page: page.page }],
        };
      }
    }
  }

  // Total amount
  if (/total\s+amount|grand\s+total|amount\s+due|what is the total/i.test(q)) {
    for (const page of pages) {
      const m = (page.text || "").match(
        /(?:total(?:\s+amount)?(?:\s+due)?|grand\s+total)\s*[:=]?\s*(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d+)?)/i
      );
      if (m) {
        return {
          answer: `The total amount is ₹${m[1]} (${formatPage(page.page)}).`,
          citations: [{ page: page.page }],
        };
      }
    }
  }

  // Policy expiry
  if (/expir|when does .+ (end|expire)|valid\s+until/i.test(q)) {
    for (const page of pages) {
      const m = (page.text || "").match(
        /(?:expir(?:y|es|ation)?\s+date|valid\s+(?:until|till)|policy\s+period)\s*[:=]?\s*([^\n]+)/i
      );
      if (m) {
        return {
          answer: `Policy expiry / validity: ${m[1].trim()} (${formatPage(page.page)}).`,
          citations: [{ page: page.page }],
        };
      }
    }
  }

  return null;
}

function findIssuer(analysis) {
  const keys = [
    /issued\s*by/i,
    /issuer/i,
    /provider/i,
    /company\s*name/i,
    /from/i,
    /seller/i,
    /insurer/i,
    /hospital/i,
    /bank\s*name/i,
  ];
  for (const f of analysis?.forms || []) {
    if (keys.some((re) => re.test(f.key))) {
      return { value: f.value, page: f.page };
    }
  }
  // First heading on page 1 as weak signal
  const h = (analysis?.headings || []).find((x) => x.page === 1 && x.level === 1);
  if (h) return { value: h.text, page: 1 };
  return null;
}

function keywordFallback(pages, query) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const hits = [];
  for (const page of pages) {
    const lower = (page.text || "").toLowerCase();
    let score = 0;
    for (const t of terms) if (lower.includes(t)) score += 1;
    if (score === 0) continue;
    hits.push({
      content: page.text,
      pageStart: page.page,
      pageEnd: page.page,
      score: score / Math.max(terms.length, 1),
      matchType: "keyword",
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

function buildContext(hits, analysis, maxChars) {
  const parts = [];
  let used = 0;
  parts.push(
    `Document type: ${analysis?.semanticType?.documentType || "Document"}; Pages: ${analysis?.pageCount || "?"}`
  );
  for (const hit of hits) {
    const block = `[Page ${hit.pageStart}${
      hit.pageEnd !== hit.pageStart ? `-${hit.pageEnd}` : ""
    }]\n${hit.content}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  // If no hits, include first 2 pages as weak context
  if (hits.length === 0 && analysis?.pages?.length) {
    for (const p of analysis.pages.slice(0, 2)) {
      const block = `[Page ${p.page}]\n${p.text}`;
      if (used + block.length > maxChars) break;
      parts.push(block);
      used += block.length;
    }
  }
  return parts.join("\n\n");
}

function hitsToCitations(hits) {
  const pages = new Set();
  for (const h of hits) {
    if (h.pageStart) pages.add(h.pageStart);
    if (h.pageEnd && h.pageEnd !== h.pageStart) pages.add(h.pageEnd);
  }
  return [...pages].sort((a, b) => a - b).map((page) => ({ page }));
}

function formatPage(page) {
  return page != null ? `Page ${page}` : "Page ?";
}

function buildExtractiveFallback(hits, question, analysis) {
  if (!hits.length) {
    return `I could not find relevant information for “${question}” in this PDF (${analysis?.pageCount || "?"} pages). Try a more specific query.`;
  }
  const top = hits[0];
  const snippet = top.content.slice(0, 400).replace(/\s+/g, " ").trim();
  return `Based on the document: ${snippet}${snippet.length >= 400 ? "…" : ""} (${formatPage(top.pageStart)}).`;
}

async function generateAnswer({
  question,
  context,
  history,
  documentType,
  pageCount,
  filename,
}) {
  const historyBlock = (history || [])
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  const prompt =
    `You are VANI AI PDF Intelligence. Answer the user's question about the PDF using ONLY the provided excerpts.\n` +
    `${VANI_IDENTITY_LOCK}\n` +
    `Rules:\n` +
    `1. Always cite page numbers like "(Page 7)" or "(Pages 3–5)".\n` +
    `2. If the answer spans multiple pages, combine the information and cite all relevant pages.\n` +
    `3. If the excerpts are insufficient, say so clearly.\n` +
    `4. Be concise and factual.\n` +
    `5. For translation requests, translate and still cite source pages.\n\n` +
    `Document: ${filename || "PDF"} | Type: ${documentType || "Document"} | Pages: ${pageCount || "?"}\n\n` +
    (historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : "") +
    `Excerpts:\n${context}\n\n` +
    `Question: ${question}\n\nAnswer:`;

  const response = await getGeminiClient().models.generateContent({
    model: PDF_QA_MODEL || CHAT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.2, maxOutputTokens: 1200 },
  });

  const text = String(response?.text || "").trim();
  if (!text) throw new Error("Empty model response");
  return sanitizeIdentityResponse(text, question);
}
