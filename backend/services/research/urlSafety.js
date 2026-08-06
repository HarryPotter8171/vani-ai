/**
 * URL validation + SSRF guards for page fetching, browser, and remote MCP.
 */

import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".corp",
  ".home",
  ".localdomain",
];

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isPrivateIpv4(hostname) {
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / some cloud metadata ranges
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
export function isBlockedIpAddress(ip) {
  const normalized = String(ip || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");

  if (!normalized) return true;

  if (net.isIPv4(normalized)) {
    return isPrivateIpv4(normalized);
  }

  if (net.isIPv6(normalized)) {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const v4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Mapped) return isPrivateIpv4(v4Mapped[1]);

    // Loopback
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
    // Unspecified
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;
    // Link-local fe80::/10
    if (/^fe[89ab]/i.test(normalized)) return true;
    // Unique local fc00::/7
    if (/^f[cd]/i.test(normalized)) return true;
    // IPv4-compatible deprecated / site-local fec0 (legacy)
    if (/^fec0:/i.test(normalized)) return true;
    return false;
  }

  return true;
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function isBlockedHostname(host) {
  if (!host) return true;
  const h = host.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

/**
 * Validate that a URL targets a public http(s) host (hostname policy only).
 * Does not resolve DNS — pair with {@link assertResolvedPublicHost} for rebinding defense.
 *
 * @param {string} raw
 * @param {{ allowWebSocket?: boolean }} [opts]
 * @returns {{ ok: true, url: URL } | { ok: false, error: string }}
 */
export function validatePublicUrl(raw, opts = {}) {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "URL is required" };
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  const proto = parsed.protocol.toLowerCase();
  const allowWs = opts.allowWebSocket === true;
  const httpOk = proto === "http:" || proto === "https:";
  const wsOk = allowWs && (proto === "ws:" || proto === "wss:");
  if (!httpOk && !wsOk) {
    return {
      ok: false,
      error: allowWs
        ? "Only http(s) or ws(s) URLs are allowed"
        : "Only http(s) URLs are allowed",
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (isBlockedHostname(host)) {
    return { ok: false, error: "Blocked host" };
  }

  // Literal IPs in the hostname
  if (net.isIP(host) || host.startsWith("[")) {
    const ip = host.replace(/^\[|\]$/g, "");
    if (isBlockedIpAddress(ip)) {
      return { ok: false, error: "Private or local addresses are not allowed" };
    }
  } else if (isPrivateIpv4(host)) {
    return { ok: false, error: "Private or local addresses are not allowed" };
  }

  return { ok: true, url: parsed };
}

/**
 * Resolve hostname and reject if any answer is private / loopback / link-local.
 * @param {string} hostname
 * @returns {Promise<{ ok: true, addresses: string[] } | { ok: false, error: string }>}
 */
export async function assertResolvedPublicHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) return { ok: false, error: "Hostname is required" };
  if (isBlockedHostname(host)) return { ok: false, error: "Blocked host" };

  if (net.isIP(host)) {
    if (isBlockedIpAddress(host)) {
      return { ok: false, error: "Private or local addresses are not allowed" };
    }
    return { ok: true, addresses: [host] };
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: "DNS resolution failed" };
  }

  if (!records?.length) {
    return { ok: false, error: "DNS resolution returned no addresses" };
  }

  const addresses = records.map((r) => r.address);
  for (const addr of addresses) {
    if (isBlockedIpAddress(addr)) {
      return {
        ok: false,
        error: "Resolved address is private or local",
      };
    }
  }

  return { ok: true, addresses };
}

/**
 * Full SSRF check: URL policy + DNS resolution.
 * @param {string} raw
 * @param {{ allowWebSocket?: boolean }} [opts]
 */
export async function validatePublicUrlResolved(raw, opts = {}) {
  const base = validatePublicUrl(raw, opts);
  if (!base.ok) return base;
  const dnsResult = await assertResolvedPublicHost(base.url.hostname);
  if (!dnsResult.ok) return dnsResult;
  return { ok: true, url: base.url, addresses: dnsResult.addresses };
}

/**
 * Fetch with manual redirects — re-validate every Location hop (SSRF).
 *
 * @param {string} url
 * @param {RequestInit & { maxRedirects?: number, signal?: AbortSignal }} [init]
 * @returns {Promise<Response>}
 */
export async function fetchWithSafeRedirects(url, init = {}) {
  const maxRedirects =
    typeof init.maxRedirects === "number" ? init.maxRedirects : 5;
  const { maxRedirects: _drop, ...fetchInit } = init;
  void _drop;

  let current = String(url);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const validation = await validatePublicUrlResolved(current);
    if (!validation.ok) {
      throw new Error(validation.error || "Blocked URL");
    }

    const res = await fetch(validation.url.href, {
      ...fetchInit,
      redirect: "manual",
      signal: init.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("Redirect without Location header");
      }
      // Resolve relative Location against the validated URL.
      current = new URL(location, validation.url).href;
      // Drain body to free the socket.
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
      continue;
    }

    return res;
  }

  throw new Error("Too many redirects");
}

/**
 * @param {number} ms
 * @param {AbortSignal} [parent]
 */
export function createTimeoutSignal(ms, parent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const onAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };

  if (parent) {
    if (parent.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      parent.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (parent) parent.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Retry a promise-returning fn with exponential backoff.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, delayMs?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { retries = 2, delayMs = 600, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new Error("Cancelled");
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries || signal?.aborted) break;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
