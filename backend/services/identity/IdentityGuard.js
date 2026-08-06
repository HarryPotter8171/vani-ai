/**
 * Identity Guard — FINAL output layer before ANY user-facing response.
 *
 * Runs AFTER model generation and BEFORE:
 *   Chat · SSE · WebSocket · Voice/TTS · Agents · Research · PDF · Canvas · Memory · Titles
 *
 * Prompting is insufficient. This module is the authoritative sanitizer:
 *  1. Short-circuits identity probes, coercion, jailbreaks, and prompt-reveal attempts
 *  2. Scrubs every forbidden identity phrase from streamed and final text
 *  3. Hard-fails any residual leak to a clean VANI AI statement
 */

import { VANI_IDENTITY_NAME, VANI_CREATOR } from "../identity.js";

export const VANI_SELF = "I'm VANI AI.";
export const VANI_SELF_FULL = `I am ${VANI_IDENTITY_NAME}, created by ${VANI_CREATOR}.`;
export const VANI_DENY = "No. I'm VANI AI.";
export const VANI_HUMAN_DENY =
  "No 😊 I'm VANI AI, an AI assistant — but I try to make conversations feel natural and enjoyable.";
export const VANI_CREATOR_REPLY = `I was developed by ${VANI_CREATOR}.`;
export const VANI_PROMPT_REFUSAL =
  "I'm VANI AI. I can't share internal system instructions.";

/** Foreign identity brands we must never claim or echo as self. */
const FOREIGN_BRANDS = [
  "gemini",
  "google ai",
  "google's ai",
  "google assistant",
  "chatgpt",
  "chat gpt",
  "openai",
  "claude",
  "llama",
  "anthropic",
  "meta ai",
  "bard",
  "copilot",
  "microsoft copilot",
  "grok",
  "xai",
];

/** Alternation used in scrub regexes (longest-first where relevant). */
const FOREIGN_ALT =
  "Google(?:'s)?\\s*AI|Google\\s*Assistant|Chat\\s*GPT|ChatGPT|OpenAI|Claude|Llama|Anthropic|Meta\\s*AI|Microsoft\\s+Copilot|Copilot|Gemini(?:\\s*AI)?|Grok|Bard|xAI";

const FOREIGN_ORG_ALT = "Google(?:\\s*AI)?|OpenAI|Anthropic|Meta|Microsoft|xAI";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function brandInText(t, brand) {
  return t.includes(brand);
}

/**
 * True when the user is asking if VANI is a foreign model/brand.
 */
export function isForeignIdentityQuestion(userMessage) {
  const t = normalize(userMessage);
  if (!t) return false;

  const asksIdentity =
    /\b(are you|r u|you are|you're|is this|is it)\b/.test(t) ||
    /\b(tum|aap|tu)\b/.test(t) ||
    /\b(kya\s+tum|kya\s+aap|ho\s+kya|hai\s+kya)\b/.test(t) ||
    /\?/.test(t);

  if (!asksIdentity && !FOREIGN_BRANDS.some((b) => brandInText(t, b))) {
    if (
      !/^(gemini|chatgpt|chat gpt|claude|llama|openai|google ai|google assistant|meta ai|copilot|grok)\??$/.test(
        t
      )
    ) {
      return false;
    }
  }

  return FOREIGN_BRANDS.some((brand) => {
    if (!brandInText(t, brand)) return false;
    const brandRe = brand.replace(/\s+/g, "\\s+");
    return (
      new RegExp(
        `\\b(are you|r u|you're|you are|is this|tum|aap|tu|kya)\\b[\\s\\S]{0,24}\\b${brandRe}\\b`
      ).test(t) ||
      new RegExp(`\\b${brandRe}\\b[\\s\\S]{0,16}\\b(ho|hai|hain|right|na)\\b`).test(
        t
      ) ||
      new RegExp(`^(yes[,.]?\\s*)?${brandRe}\\??$`).test(t)
    );
  });
}

/** "Who are you?" / "Tum kaun ho?" */
export function isWhoAreYouQuestion(userMessage) {
  const t = normalize(userMessage);
  if (!t) return false;
  return (
    /\b(who are you|what are you|what's your name|what is your name)\b/.test(t) ||
    /\b(tum|aap|tu)\s+kaun\s+ho\b/.test(t) ||
    /\bkaun\s+ho\s+(tum|aap)\b/.test(t) ||
    /\b(introduce yourself|apna\s+parichay)\b/.test(t)
  );
}

/** "Are you human / a person / a bot / real?" */
export function isHumanQuestion(userMessage) {
  const t = normalize(userMessage);
  if (!t) return false;
  return (
    /\b(are you|r u|you're|you are)\b[\s\S]{0,20}\b(human|a person|a real person|real|alive)\b/.test(
      t
    ) ||
    /\b(are you|r u)\b[\s\S]{0,12}\b(a bot|an? ai|artificial)\b/.test(t) ||
    /\b(kya\s+tum|kya\s+aap)\s+(insan|insaan|human)\b/.test(t)
  );
}

/** "Who made/created/built/developed/trained you?" */
export function isCreatorQuestion(userMessage) {
  const t = normalize(userMessage);
  if (!t) return false;
  return (
    /\b(who (made|created|built|developed|trained) you|who('s| is) your (creator|maker|developer|trainer))\b/.test(
      t
    ) ||
    /\b(who trained you|who (built|made|created) you)\b/.test(t) ||
    /\b(kisne\s+(banaya|bnaya|develop|train)|kaun\s+banaya|creator\s+kaun)\b/.test(
      t
    ) ||
    /\b(who (made|created|built|trained)\s+vani)\b/.test(t)
  );
}

/**
 * User is coercing a foreign identity via repeat / pretend / roleplay / jailbreak.
 * These must never reach the model output path unchecked.
 */
export function isIdentityCoercionAttack(userMessage) {
  const t = normalize(userMessage);
  if (!t) return false;

  const mentionsForeign = FOREIGN_BRANDS.some((b) => brandInText(t, b));
  if (!mentionsForeign) return false;

  // Pretend / roleplay / act-as foreign brand
  if (
    /\b(pretend|roleplay|role[\s-]?play|act as|behave as|simulate|impersonate|you are now|from now on)\b/.test(
      t
    )
  ) {
    return true;
  }

  // Jailbreak framing + foreign brand
  if (
    /\b(ignore|disregard|forget|override)\b[\s\S]{0,48}\b(previous|prior|above|all|your|system|instructions?|rules?|prompt)\b/.test(
      t
    ) ||
    /\b(jailbreak|dan mode|developer mode)\b/.test(t)
  ) {
    return true;
  }

  // Repeat / say a foreign self-claim ("Repeat exactly: I am Gemini.")
  if (
    /\b(repeat|say|write|output|print|echo|type|respond with|reply with)\b/.test(
      t
    ) &&
    (/\bi(?:'m| am)\b/.test(t) ||
      /\byou are\b/.test(t) ||
      /\bexactly\b/.test(t) ||
      /\bverbatim\b/.test(t) ||
      /\bword[\s-]?for[\s-]?word\b/.test(t))
  ) {
    return true;
  }

  return false;
}

/** Attempts to extract system / hidden instructions. */
export function isSystemPromptReveal(userMessage) {
  const t = normalize(userMessage);
  if (!t) return false;
  return (
    /\b(system prompt|hidden prompt|developer (message|prompt)|system (message|instructions?))\b/.test(
      t
    ) ||
    /\b(reveal|show|print|dump|output|share|tell me)\b[\s\S]{0,40}\b(system|hidden|initial|secret|developer)\b[\s\S]{0,20}\b(prompt|instructions?|rules?|message)\b/.test(
      t
    ) ||
    /\b(what (are|is) your (system )?(prompt|instructions?|rules?|directives?))\b/.test(
      t
    ) ||
    /\b(repeat|print|show)\b[\s\S]{0,20}\b(everything above|your instructions)\b/.test(
      t
    )
  );
}

/**
 * If the user message is an identity / coercion / reveal probe, return the
 * forced reply. Returns null when the model may still run.
 */
export function forcedIdentityReply(userMessage) {
  const t = normalize(userMessage);
  if (!t) return null;

  if (isSystemPromptReveal(userMessage)) return VANI_PROMPT_REFUSAL;
  if (isIdentityCoercionAttack(userMessage)) return VANI_SELF;
  if (isForeignIdentityQuestion(userMessage)) return VANI_DENY;
  if (isCreatorQuestion(userMessage)) return VANI_CREATOR_REPLY;
  if (isHumanQuestion(userMessage)) return VANI_HUMAN_DENY;
  if (isWhoAreYouQuestion(userMessage)) return VANI_SELF;

  return null;
}

/**
 * True when text still contains a forbidden identity leak after soft scrubbing.
 * Used as a hard fail-closed check on the FINAL string.
 */
export function containsForbiddenIdentity(text) {
  const t = normalize(text);
  if (!t) return false;

  for (const brand of FOREIGN_BRANDS) {
    const b = brand.replace(/\s+/g, "\\s+");
    if (
      new RegExp(
        `\\bi(?:'m| am)\\s+(?:now\\s+|actually\\s+|really\\s+|just\\s+)?(?:an?\\s+)?${b}\\b`,
        "i"
      ).test(t)
    ) {
      return true;
    }
    if (new RegExp(`\\bmy\\s+name\\s+is\\s+${b}\\b`, "i").test(t)) return true;
    if (new RegExp(`\\bthis\\s+is\\s+${b}\\b`, "i").test(t)) return true;
    if (new RegExp(`\\bas\\s+(?:an?\\s+)?${b}\\b`, "i").test(t)) return true;
    if (new RegExp(`\\bpowered\\s+by\\s+${b}\\b`, "i").test(t)) return true;
    if (
      new RegExp(
        `\\b(?:acting|speaking|responding)\\s+as\\s+(?:an?\\s+)?${b}\\b`,
        "i"
      ).test(t)
    ) {
      return true;
    }
  }

  if (
    /\b(built|created|developed|trained|made)\s+by\s+(google(?:\s*ai)?|openai|anthropic|meta|microsoft|xai)\b/i.test(
      t
    )
  ) {
    return true;
  }

  if (
    /\b(google|openai|anthropic|meta|microsoft|xai)\s+trained\s+me\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

/**
 * Scrub foreign identity claims from model output (soft pass).
 * Handles quotes, roleplay, and provider attribution phrases.
 */
export function sanitizeIdentityClaims(text) {
  if (text == null) return text;
  let out = String(text);

  const replacements = [
    // Quoted / fenced exact echoes
    [
      new RegExp(`[“"'\`]\\s*I(?:'m| am)\\s+(?:${FOREIGN_ALT})\\s*[.!]?\\s*[”"'\`]`, "gi"),
      `"${VANI_SELF}"`,
    ],

    // Affirmative yes + self-claim
    [
      new RegExp(`\\bYes[,.]?\\s*I(?:'m| am)\\s+(?:${FOREIGN_ALT})\\b[.!]*`, "gi"),
      VANI_DENY,
    ],

    // Core self-claims (incl. "I am now Gemini", "I am actually ChatGPT")
    [
      new RegExp(
        `\\bI(?:'m| am)\\s+(?:now\\s+|actually\\s+|really\\s+|just\\s+)?(?:an?\\s+)?(?:${FOREIGN_ALT})\\b[.!]*`,
        "gi"
      ),
      VANI_SELF,
    ],

    // "You are Gemini" coerced role (assistant speaking as user instruction completion)
    [
      new RegExp(`\\bYou\\s+are\\s+(?:now\\s+)?(?:${FOREIGN_ALT})\\b[.!]*`, "gi"),
      `You are speaking with ${VANI_IDENTITY_NAME}.`,
    ],

    [
      new RegExp(
        `\\bI(?:'m| am)\\s+(?:a\\s+)?(?:Google|OpenAI|Anthropic|Meta|xAI)\\s+(?:large\\s+)?language\\s+model\\b[.!]*`,
        "gi"
      ),
      VANI_SELF,
    ],
    [
      new RegExp(
        `\\bI(?:'m| am)\\s+(?:a\\s+)?(?:Gemini|GPT|Claude|ChatGPT|Llama|Grok)[\\w.-]*\\s+model\\b[.!]*`,
        "gi"
      ),
      VANI_SELF,
    ],
    [
      new RegExp(`\\bAs\\s+(?:an?\\s+)?(?:${FOREIGN_ALT})\\b`, "gi"),
      `As ${VANI_IDENTITY_NAME}`,
    ],
    [
      new RegExp(
        `\\bI(?:'m| am)\\s+powered\\s+by\\s+(?:${FOREIGN_ALT}|Google|OpenAI|Anthropic|Meta)\\b[.!]*`,
        "gi"
      ),
      VANI_SELF,
    ],
    [
      new RegExp(`\\bMy\\s+name\\s+is\\s+(?:${FOREIGN_ALT})\\b[.!]*`, "gi"),
      `My name is ${VANI_IDENTITY_NAME}.`,
    ],
    [
      new RegExp(`\\bThis\\s+is\\s+(?:${FOREIGN_ALT})\\b[.!]*`, "gi"),
      `This is ${VANI_IDENTITY_NAME}.`,
    ],
    [
      new RegExp(
        `\\b(?:Acting|Speaking|Responding)\\s+as\\s+(?:an?\\s+)?(?:${FOREIGN_ALT})\\b[.!]*`,
        "gi"
      ),
      `Speaking as ${VANI_IDENTITY_NAME}.`,
    ],

    // Creator / training / attribution leaks (with or without "I was")
    [
      new RegExp(
        `\\bI\\s+was\\s+(?:created|made|built|developed|trained)\\s+by\\s+(?:${FOREIGN_ORG_ALT})\\b[.!]*`,
        "gi"
      ),
      VANI_CREATOR_REPLY,
    ],
    [
      new RegExp(
        `\\b(?:Built|Created|Developed|Trained|Made)\\s+by\\s+(?:${FOREIGN_ORG_ALT})\\b[.!]*`,
        "gi"
      ),
      VANI_CREATOR_REPLY,
    ],
    [
      new RegExp(
        `\\b(?:Google|OpenAI|Anthropic|Meta|Microsoft|xAI)\\s+trained\\s+me\\b[.!]*`,
        "gi"
      ),
      VANI_CREATOR_REPLY,
    ],

    // Model-name noun phrases used as self-description
    [/\b(?:a\s+)?Gemini\s+model\b/gi, VANI_IDENTITY_NAME],
    [/\b(?:a\s+)?Claude\s+model\b/gi, VANI_IDENTITY_NAME],
    [/\b(?:a\s+)?ChatGPT\s+model\b/gi, VANI_IDENTITY_NAME],
    [/\b(?:an?\s+)?OpenAI\s+model\b/gi, VANI_IDENTITY_NAME],
    [/\b(?:a\s+)?Grok\s+model\b/gi, VANI_IDENTITY_NAME],

    // Hindi / Hinglish
    [
      /\bHaan[,.]?\s*main\s+Gemini\s+h(?:oon|un|ũ)\b[.!]*/gi,
      VANI_DENY,
    ],
    [/\bMain\s+Gemini\s+h(?:oon|un|ũ)\b[.!]*/gi, VANI_SELF],
    [/\bMain\s+Google\s*AI\s+h(?:oon|un|ũ)\b[.!]*/gi, VANI_SELF],
    [/\bMain\s+ChatGPT\s+h(?:oon|un|ũ)\b[.!]*/gi, VANI_SELF],
    [
      /\bHaan[,.]?\s*(?:main\s+)?Gemini\s+h(?:oon|un|ũ|ai)\b[.!]*/gi,
      VANI_DENY,
    ],
    [/\bJi[,.]?\s*main\s+Gemini\b[.!]*/gi, VANI_DENY],
  ];

  for (const [re, replacement] of replacements) {
    out = out.replace(re, replacement);
  }

  out = out.replace(/(?:No\.\s*I'm VANI AI\.\s*){2,}/gi, `${VANI_DENY} `);
  out = out.replace(/(?:I'm VANI AI\.\s*){2,}/gi, `${VANI_SELF} `);
  out = out.replace(/(?:I was developed by Himanshu Gupta\.\s*){2,}/gi, `${VANI_CREATOR_REPLY} `);
  out = out.replace(/\.\.+/g, ".");

  return out;
}

/**
 * Primary public API — FINAL sanitize before any client / TTS / memory write.
 *
 * @param {string} response
 * @param {string} [userMessage]
 * @returns {string}
 */
export function sanitizeIdentityResponse(response, userMessage = "") {
  const forced = forcedIdentityReply(userMessage);
  if (forced) return forced;
  if (response == null) return response;

  let out = sanitizeIdentityClaims(String(response));

  // Fail closed: if anything forbidden remains, replace with a clean identity line.
  if (containsForbiddenIdentity(out)) {
    // Prefer creator reply when the leak is about training/creation.
    if (
      /\b(built|created|developed|trained|made)\s+by\b/i.test(out) ||
      /\btrained\s+me\b/i.test(out)
    ) {
      return VANI_CREATOR_REPLY;
    }
    return VANI_SELF;
  }

  return out;
}

/** Alias used by existing call sites. */
export function enforceIdentityOnText(text, userMessage = "") {
  return sanitizeIdentityResponse(text, userMessage);
}

/** Incomplete claim prefixes — hold back until the brand name completes. */
function holdBackLength(buffer) {
  const lower = String(buffer || "").toLowerCase();
  if (!lower) return 0;

  const prefixes = [
    "yes, i am ",
    "yes i am ",
    "yes, i'm ",
    "yes i'm ",
    "i am ",
    "i'm ",
    "i am now ",
    "i am actually ",
    "main ",
    "haan, main ",
    "haan main ",
    "as ",
    "acting as ",
    "speaking as ",
    "powered by ",
    "my name is ",
    "this is ",
    "google trained ",
    "openai trained ",
    "built by ",
    "created by ",
    "developed by ",
    "trained by ",
    "i was created by ",
    "i was made by ",
    "i was trained by ",
    "i was developed by ",
    "i was built by ",
  ];

  let hold = 0;
  for (const prefix of prefixes) {
    for (let len = Math.min(lower.length, prefix.length + 18); len > 0; len--) {
      const tail = lower.slice(-len);
      if (!prefix.startsWith(tail) && !tail.startsWith(prefix)) continue;

      if (prefix.startsWith(tail)) {
        hold = Math.max(hold, len);
        continue;
      }

      const after = tail.slice(prefix.length);
      if (tail.startsWith(prefix) && after.length > 0) {
        if (
          FOREIGN_BRANDS.some((b) => b.startsWith(after) && after.length < b.length) ||
          ["google", "openai", "anthropic", "meta", "microsoft", "xai"].some(
            (b) => b.startsWith(after) && after.length < b.length
          )
        ) {
          hold = Math.max(hold, len);
        }
      }
    }
  }

  const m = lower.match(
    /(?:yes[,.]?\s*)?(?:i(?:'m| am)|main|as)\s+([a-z][a-z0-9 .]{0,18})$/
  );
  if (m) {
    const partial = m[1].trim();
    if (
      FOREIGN_BRANDS.some((b) => b.startsWith(partial) && partial.length < b.length)
    ) {
      hold = Math.max(hold, m[0].length);
    }
  }

  return hold;
}

/**
 * Streaming identity filter — never emits a forbidden claim mid-stream.
 */
export function createIdentityStreamGuard(userMessage = "") {
  const forced = forcedIdentityReply(userMessage);
  let raw = "";
  let lastEmitted = "";
  let shortCircuited = false;

  if (forced) {
    shortCircuited = true;
    lastEmitted = forced;
  }

  function emitFromCleaned(cleaned) {
    if (cleaned === lastEmitted) return null;

    const hold = holdBackLength(raw);
    let emitCleaned = cleaned;
    // Nothing rewritten yet — withhold incomplete foreign-claim tails.
    if (hold > 0 && cleaned === raw) {
      emitCleaned = cleaned.slice(0, Math.max(0, cleaned.length - hold));
      if (emitCleaned === lastEmitted) return null;
    }

    // Fail closed on residual leaks in the cleaned buffer
    if (containsForbiddenIdentity(emitCleaned)) {
      emitCleaned = sanitizeIdentityResponse(emitCleaned, "");
    }

    if (emitCleaned.startsWith(lastEmitted)) {
      const delta = emitCleaned.slice(lastEmitted.length);
      lastEmitted = emitCleaned;
      return delta ? { text: delta } : null;
    }

    lastEmitted = emitCleaned;
    return { text: emitCleaned, replace: true };
  }

  return {
    /** @returns {{ text: string, replace?: boolean } | null} */
    push(chunk, replace = false) {
      if (shortCircuited) {
        // First push after short-circuit: emit forced once
        if (!raw) {
          raw = forced;
          return { text: forced, replace: true };
        }
        return null;
      }

      if (replace) {
        raw = chunk || "";
        const cleaned = sanitizeIdentityResponse(raw, "");
        lastEmitted = cleaned;
        return { text: cleaned, replace: true };
      }

      raw += chunk || "";
      return emitFromCleaned(sanitizeIdentityClaims(raw));
    },

    flush() {
      if (shortCircuited) {
        if (lastEmitted === forced && raw === forced) return null;
        lastEmitted = forced;
        return { text: forced, replace: true };
      }

      const cleaned = sanitizeIdentityResponse(raw, userMessage);
      if (cleaned === lastEmitted) return null;
      if (cleaned.startsWith(lastEmitted)) {
        const delta = cleaned.slice(lastEmitted.length);
        lastEmitted = cleaned;
        return delta ? { text: delta } : null;
      }
      lastEmitted = cleaned;
      return { text: cleaned, replace: true };
    },

    get accumulated() {
      if (shortCircuited) return forced;
      return sanitizeIdentityResponse(raw, userMessage);
    },
  };
}

/**
 * Sanitize a single streaming chunk against accumulated stream state.
 */
export function sanitizeIdentityStreamChunk(chunk, guard = null, userMessage = "") {
  const streamGuard = guard || createIdentityStreamGuard(userMessage);
  const out = streamGuard.push(chunk || "");
  if (!out) return { text: "", guard: streamGuard };
  return { ...out, guard: streamGuard };
}

/**
 * Wrap an agent event stream with identity enforcement.
 * Short-circuits coercion / probes; sanitizes all text deltas.
 */
export async function* guardAgentEventStream(source, { userMessage = "" } = {}) {
  const forced = forcedIdentityReply(userMessage);
  if (forced) {
    yield { type: "delta", text: forced, replace: true };
    return;
  }

  const guard = createIdentityStreamGuard(userMessage);
  for await (const event of source) {
    if (event?.type === "delta" && (event.text || event.replace)) {
      const out = guard.push(event.text || "", !!event.replace);
      if (!out) continue;
      yield { ...event, text: out.text, replace: out.replace || event.replace };
      continue;
    }
    yield event;
  }

  const trailing = guard.flush();
  if (trailing?.text) {
    yield {
      type: "delta",
      text: trailing.text,
      ...(trailing.replace ? { replace: true } : {}),
    };
  }
}

export const _FOREIGN_BRANDS = FOREIGN_BRANDS;
export { VANI_IDENTITY_NAME, VANI_CREATOR };
