/**
 * Safety heuristics — never auto-purchase, pay, or delete without confirmation.
 * Navigation targets must be public http(s) URLs (SSRF guard).
 */

import type { BrowserActionInput, BrowserStep } from "./types.ts";
import { validatePublicUrl } from "../services/research/urlSafety.js";

const DANGEROUS_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b(buy|purchase|checkout|place\s+order|confirm\s+order|add\s+to\s+cart\s+and\s+pay)\b/i,
    reason: "May complete a purchase",
  },
  {
    re: /\b(pay|payment|pay\s+now|submit\s+payment|complete\s+payment|wire\s+transfer)\b/i,
    reason: "May initiate a payment",
  },
  {
    re: /\b(delete\s+account|delete\s+all|wipe|permanently\s+delete|remove\s+all\s+data|factory\s+reset)\b/i,
    reason: "May delete user data",
  },
  {
    re: /\b(transfer\s+funds|send\s+money|crypto\s+send|withdraw)\b/i,
    reason: "May move money",
  },
  {
    re: /\b(grant\s+access|disable\s+2fa|change\s+password|revoke\s+all)\b/i,
    reason: "May alter account security",
  },
];

const DANGEROUS_SELECTORS = [
  /checkout/i,
  /place[-_]?order/i,
  /pay[-_]?now/i,
  /confirm[-_]?purchase/i,
  /delete[-_]?account/i,
  /danger[-_]?zone/i,
];

const DANGEROUS_URLS = [
  /checkout/i,
  /payment/i,
  /billing\/pay/i,
  /cart\/checkout/i,
];

export function originFromUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Reject non-http(s) and non-public navigation targets (SSRF).
 * Blocks private IPv4, loopback, link-local/metadata, localhost, and IPv6 literals.
 * Returns the parsed URL on success.
 */
export function assertHttpUrl(url: string): URL {
  if (!url || typeof url !== "string") {
    throw new Error("URL is required to open a page");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error(
      `Blocked non-http(s) navigation: ${parsed.protocol}// (only http/https are allowed)`
    );
  }

  const result = validatePublicUrl(url);
  if (!result.ok) {
    throw new Error(`Blocked non-public navigation: ${result.error}`);
  }
  return result.url;
}

export function assessDanger(
  input: Pick<BrowserActionInput, "action" | "url" | "selector" | "value" | "label">
): { dangerous: boolean; reason?: string } {
  const haystack = [input.label, input.value, input.selector, input.url]
    .filter(Boolean)
    .join(" ");

  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(haystack)) return { dangerous: true, reason };
  }

  if (input.selector && DANGEROUS_SELECTORS.some((re) => re.test(input.selector!))) {
    return { dangerous: true, reason: "Selector targets a high-risk control" };
  }

  if (input.url && DANGEROUS_URLS.some((re) => re.test(input.url!))) {
    return { dangerous: true, reason: "URL looks like a payment/checkout flow" };
  }

  return { dangerous: false };
}

export function markDangerousSteps<T extends BrowserStep>(steps: T[]): T[] {
  return steps.map((step) => {
    const danger = assessDanger(step);
    if (!danger.dangerous) return step;
    return {
      ...step,
      dangerous: true,
      dangerReason: danger.reason,
    };
  });
}

/** Absolute max for any single Playwright action. */
export const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
export const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;
export const MAX_STEPS_PER_RUN = 40;
export const MAX_PARALLEL_READ_TASKS = 3;
export const SESSION_IDLE_TTL_MS = 15 * 60_000;
export const MAX_SESSIONS_PER_USER = 4;
export const MAX_SCREENSHOTS_PER_RUN = 24;
export const TRANSIENT_RETRY_COUNT = 2;
