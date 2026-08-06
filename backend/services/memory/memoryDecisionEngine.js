import { CHAT_MODEL, getGeminiClient } from "../geminiClient.js";
import { normalizeCategory } from "./validate.js";

function parseJsonPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/** User explicitly asked to persist something that would normally be ignored. */
const EXPLICIT_REMEMBER_REGEX =
  /\b(remember\s+this|this\s+is\s+important|save\s+this|never\s+forget\s+this|remember\s+this\s+forever|always\s+remember|never\s+forget|pin\s+this|pin\s+it|pin\s+forever|remember\s+forever|always\s+keep)\b/i;

const PIN_FOREVER_REGEX =
  /\b(remember\s+this\s+forever|always\s+remember|never\s+forget|pin\s+this|pin\s+it|pin\s+forever|remember\s+forever|always\s+keep|never\s+forget\s+this)\b/i;

/** Stable identity / preference patterns — high-confidence LONG_TERM. */
const LONG_TERM_PATTERNS = [
  { re: /\bmy name is\b/i, reason: "stable identity: name" },
  { re: /\b(i am|i'm)\s+called\b/i, reason: "stable identity: name" },
  { re: /\bcall me\b/i, reason: "stable identity: preferred name" },
  { re: /\bi work at\b/i, reason: "stable identity: employer" },
  { re: /\bmy (job|profession|role|title) is\b/i, reason: "stable identity: profession" },
  { re: /\bi own\b/i, reason: "stable ownership fact" },
  { re: /\bi like\b/i, reason: "stable preference" },
  { re: /\bi (love|enjoy|prefer)\b/i, reason: "stable preference" },
  { re: /\bmy favorite\b/i, reason: "stable preference" },
  { re: /\bi (am building|am working on|build|built)\b/i, reason: "long-term project" },
  { re: /\bi speak\b/i, reason: "stable language skill" },
  { re: /\bi prefer\b/i, reason: "stable preference" },
  { re: /\bmy preferred\b/i, reason: "stable preference" },
  { re: /\bi (live in|am from|grew up in)\b/i, reason: "stable location identity" },
  { re: /\bmy (hometown|birthday|birthdate) is\b/i, reason: "stable profile fact" },
  { re: /\bi (use|prefer to use)\b.+\b(for|when)\b/i, reason: "stable tool/workflow preference" },
];

/** One-time / ephemeral facts — default IGNORE unless user explicitly asks to remember. */
const IGNORE_PATTERNS = [
  {
    re: /\b(feve?r|headache|injury|injured|hurt|wound|bleed|bleeding|sick|ill|flu|cold|cough|pain|vomit|nausea|hospital|diagnosed|symptom)\b/i,
    reason: "medical or health incident",
  },
  {
    re: /\b(bit|bitten|bite|bites)\b/i,
    reason: "injury or accident",
  },
  {
    re: /\b(fell|fallen|accident|crashed|crash|broke my|broken bone|sprain|fracture)\b/i,
    reason: "accident or injury",
  },
  {
    re: /\bwhen i was \d+\b/i,
    reason: "childhood or past one-time incident",
  },
  {
    re: /\b(as a child|when i was young|years ago|last year|last month|last week|yesterday|today|this morning|this afternoon|tonight|right now|currently)\b/i,
    reason: "time-bound one-time event",
  },
  {
    re: /\b(mood|feeling|feelings|angry|upset|frustrated|annoyed|stressed)\b/i,
    reason: "temporary emotional state",
  },
  {
    re: /\b(bought|purchased|ordered)\b.+\b(today|yesterday|this week)\b/i,
    reason: "one-time purchase",
  },
  {
    re: /\b(went to|visited|traveled to|travelled to)\b/i,
    reason: "one-time travel event",
  },
  {
    re: /\b(internet|wifi|network)\b.+\b(slow|down|outage|unstable)\b/i,
    reason: "temporary technical issue",
  },
  {
    re: /\b(battery died|battery is dead|laptop died|phone died)\b/i,
    reason: "temporary device issue",
  },
  {
    re: /\b(weather|forecast|rain|temperature)\b/i,
    reason: "ephemeral weather context",
  },
  {
    re: /\b(api[_ -]?key|secret[_ -]?key|token|bearer\s+|authorization\s+header|jwt)\b/i,
    reason: "secret credential",
  },
  {
    re: /\b(password|passphrase|passcode)\b/i,
    reason: "secret credential",
  },
  {
    re: /\b(otp|one[- ]?time\s+code|verification\s+code)\b/i,
    reason: "sensitive verification code",
  },
  {
    re: /\b(credit\s*card|card\s*number|cvv|iban|swift|routing\s*number|razorpay|stripe)\b/i,
    reason: "payment or financial credential",
  },
  {
    re: /\b(bank\s+balance|account\s+balance|balance\s+due|bank\s+account)\b/i,
    reason: "financial balance",
  },
  {
    re: /\b(savings|salary|income|revenue|profit|expenses)\b/i,
    reason: "financial detail",
  },
  {
    re: /\b(street|apt|apartment|zip\b|postal\s*code)\b/i,
    reason: "sensitive address",
  },
  {
    re: /\baddress\b/i,
    reason: "sensitive address",
    test: (text) => /\baddress\b/i.test(text) && /\d/.test(text),
  },
  {
    re: /\b(phone|mobile|contact\s+number)\b/i,
    reason: "sensitive phone number",
  },
  {
    re: /\b([0-9]{3}[- ]?[0-9]{2}[- ]?[0-9]{4})\b/,
    reason: "sensitive identifier",
  },
  {
    re: /\b(embarrass|humiliate|shame)\b/i,
    reason: "embarrassing personal information",
  },
];

/** In-progress work — TEMPORARY, not persisted as long-term memory. */
const TEMPORARY_PATTERNS = [
  {
    re: /\b(current|this)\s+(bug|issue|error|task|ticket|document|file|branch|pr|pull request)\b/i,
    reason: "active in-session work context",
  },
  {
    re: /\b(working on|debugging|fixing|investigating)\b.+\b(now|right now|today)\b/i,
    reason: "active in-session work context",
  },
];

export function detectExplicitRememberRequest(contextText = "") {
  return EXPLICIT_REMEMBER_REGEX.test(String(contextText || ""));
}

export function detectPinForeverRequest(contextText = "") {
  return PIN_FOREVER_REGEX.test(String(contextText || ""));
}

function makeDecision(decision, { scope = "long_term", confidence = 0.9, reason = "" } = {}) {
  return {
    decision,
    scope: decision === "LONG_TERM" && scope === "pinned" ? "pinned" : decision === "LONG_TERM" ? "long_term" : scope,
    confidence,
    reason: String(reason || "").trim(),
  };
}

/**
 * Rule-based classification. Returns a decision object or null if undecided.
 */
export function classifyCandidateHeuristic(content, category = "fact", { contextText = "" } = {}) {
  const text = String(content || "").trim();
  const lower = text.toLowerCase();
  if (!lower || text.length < 8) {
    return makeDecision("IGNORE", {
      confidence: 0.99,
      reason: "content too short or empty",
    });
  }

  const explicitRemember = detectExplicitRememberRequest(contextText);
  const pinForever = detectPinForeverRequest(contextText);

  for (const pattern of LONG_TERM_PATTERNS) {
    if (!pattern.re.test(text)) continue;
    return makeDecision("LONG_TERM", {
      scope: pinForever ? "pinned" : "long_term",
      confidence: 0.94,
      reason: pattern.reason,
    });
  }

  for (const pattern of TEMPORARY_PATTERNS) {
    if (!pattern.re.test(text)) continue;
    return makeDecision("TEMPORARY", {
      scope: "temporary",
      confidence: 0.82,
      reason: pattern.reason,
    });
  }

  for (const pattern of IGNORE_PATTERNS) {
    const matched =
      typeof pattern.test === "function" ? pattern.test(text) : pattern.re.test(text);
    if (!matched) continue;
    if (explicitRemember) {
      return makeDecision("LONG_TERM", {
        scope: pinForever ? "pinned" : "long_term",
        confidence: 0.88,
        reason: `user explicitly requested persistence despite ${pattern.reason}`,
      });
    }
    return makeDecision("IGNORE", {
      confidence: 0.97,
      reason: pattern.reason,
    });
  }

  if (explicitRemember) {
    return makeDecision("LONG_TERM", {
      scope: pinForever ? "pinned" : "long_term",
      confidence: 0.85,
      reason: "user explicitly requested persistence",
    });
  }

  // Category hints for stable profile/preferences without explicit phrasing.
  if (category === "profile" || category === "preference") {
    return makeDecision("LONG_TERM", {
      confidence: 0.8,
      reason: `stable ${category} category`,
    });
  }

  if (category === "project" || category === "goal" || category === "tool") {
    return makeDecision("LONG_TERM", {
      confidence: 0.75,
      reason: `durable ${category} category`,
    });
  }

  return null;
}

function normalizeModelDecision(rawDecision) {
  const value = String(rawDecision || "").toUpperCase();
  if (value === "SAVE" || value === "LONG_TERM") return "LONG_TERM";
  if (value === "TEMPORARY") return "TEMPORARY";
  return "IGNORE";
}

/**
 * Decide LONG_TERM / TEMPORARY / IGNORE for extracted candidates.
 * Only LONG_TERM may be written to persistent memory.
 *
 * @returns Array aligned to candidates: { decision, scope, confidence, reason }
 */
export async function decideCandidateMemories({
  candidates = [],
  contextText = "",
} = {}) {
  const decisions = new Array(candidates.length).fill(null);
  const toAsk = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i] || {};
    const category = normalizeCategory(c.category);
    const heuristic = classifyCandidateHeuristic(c.content, category, { contextText });
    if (heuristic) {
      decisions[i] = heuristic;
      continue;
    }
    toAsk.push({ index: i, candidate: c });
  }

  if (!toAsk.length) {
    return decisions;
  }

  const askLimit = Math.min(toAsk.length, 8);
  const ask = toAsk.slice(0, askLimit);

  const prompt = `You are an internal VANI AI Memory Decision Engine.

Classify each candidate memory for long-term storage quality (ChatGPT-style).

Return ONLY valid JSON of this shape:
{
  "decisions": [
    {
      "index": <candidate index>,
      "decision": "LONG_TERM" | "TEMPORARY" | "IGNORE",
      "confidence": <number 0..1>,
      "reason": "<short explanation>"
    }
  ]
}

Definitions:
- LONG_TERM: stable facts useful months later (identity, preferences, skills, long-term projects/goals, durable tools).
- TEMPORARY: useful only for the current conversation (current bug/task/document, immediate work in progress).
- IGNORE: do not store (one-time events, medical incidents, accidents, childhood stories, purchases, travel anecdotes, today's mood, device/weather issues, secrets, credentials, PII).

Hard rules:
- Medical events, injuries, accidents, childhood incidents, and one-time life events MUST be IGNORE unless the user explicitly asked to remember.
- "User was bitten by a dog as a child" → IGNORE.
- "User's name is Alex" / "User works at Acme" / "User prefers short answers" → LONG_TERM.
- Never store passwords, OTP, API keys, payment details, addresses, or phone numbers.

Candidates:

${ask
  .map(
    (x) =>
      `#${x.index}\ncategory=${normalizeCategory(x.candidate.category)}\ncontent=${String(x.candidate.content || "")}`
  )
  .join("\n\n")}
`;

  let parsed = null;
  try {
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.1, maxOutputTokens: 700 },
    });

    const raw =
      response?.text ||
      response?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ||
      "";
    parsed = parseJsonPayload(raw);
  } catch {
    parsed = null;
  }

  if (!parsed?.decisions || !Array.isArray(parsed.decisions)) {
    for (const item of ask) {
      decisions[item.index] = makeDecision("IGNORE", {
        confidence: 0.75,
        reason: "decision engine unavailable; conservative ignore",
      });
    }
    return decisions;
  }

  for (const d of parsed.decisions) {
    if (!d || typeof d.index !== "number") continue;
    const decision = normalizeModelDecision(d.decision);
    const conf =
      typeof d.confidence === "number" ? Math.min(1, Math.max(0, d.confidence)) : 0.6;
    const reason = String(d.reason || "").trim() || "model classification";

    if (decision === "LONG_TERM") {
      const scope = detectPinForeverRequest(contextText) ? "pinned" : "long_term";
      decisions[d.index] = makeDecision("LONG_TERM", { scope, confidence: conf, reason });
    } else if (decision === "TEMPORARY") {
      decisions[d.index] = makeDecision("TEMPORARY", {
        scope: "temporary",
        confidence: conf,
        reason,
      });
    } else {
      decisions[d.index] = makeDecision("IGNORE", { confidence: Math.max(conf, 0.85), reason });
    }
  }

  for (let i = 0; i < decisions.length; i++) {
    if (!decisions[i]) {
      decisions[i] = makeDecision("IGNORE", {
        confidence: 0.7,
        reason: "no classification returned; conservative ignore",
      });
    }
  }

  return decisions;
}

/**
 * Gate a single memory write (tool/manual). Returns whether persistence is allowed.
 */
export async function decideMemoryWrite({
  content,
  category = "fact",
  contextText = "",
  scope,
  source = "auto",
} = {}) {
  const normalizedCategory = normalizeCategory(category);
  const requestedScope = scope === "pinned" ? "pinned" : scope === "temporary" ? "temporary" : "long_term";

  // Manual/tool writes with explicit user intent bypass auto heuristics for temporary scope.
  if (source === "manual" || source === "tool") {
    if (requestedScope === "temporary") {
      return makeDecision("TEMPORARY", {
        scope: "temporary",
        confidence: 0.9,
        reason: "explicit temporary save",
      });
    }
    if (requestedScope === "pinned" || detectPinForeverRequest(contextText)) {
      return makeDecision("LONG_TERM", {
        scope: "pinned",
        confidence: 0.92,
        reason: "explicit pinned save",
      });
    }
    if (detectExplicitRememberRequest(contextText)) {
      return makeDecision("LONG_TERM", {
        scope: "long_term",
        confidence: 0.9,
        reason: "explicit remember request",
      });
    }
  }

  const heuristic = classifyCandidateHeuristic(content, normalizedCategory, { contextText });
  if (heuristic) return heuristic;

  const [decision] = await decideCandidateMemories({
    candidates: [{ content, category: normalizedCategory }],
    contextText,
  });
  return decision || makeDecision("IGNORE", { confidence: 0.7, reason: "unable to classify" });
}

export function shouldPersistDecision(decision) {
  return decision?.decision === "LONG_TERM";
}
