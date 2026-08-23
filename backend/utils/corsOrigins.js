/**
 * Build the CORS origin whitelist from environment.
 *
 * Development defaults: localhost:3000 / 3001
 * Also allows private LAN origins (RFC1918) on :3000/:3001 so phone testing
 * over Wi‑Fi works without constantly editing CORS_ORIGINS.
 * Production: NEXT_PUBLIC_APP_URL (+ optional CORS_ORIGINS comma list)
 */

function isPrivateLanHostname(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "127.0.0.1") return true;

  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * True for local/LAN frontend origins during development (http only).
 * Keeps production strict — never used when NODE_ENV === "production".
 */
export function isDevLanOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    
    // Allow HTTPS for tunnelled development
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    
    // Explicitly allow the ngrok development tunnel
    if (u.hostname === "washstand-sage-reflected.ngrok-free.dev") return true;

    const port = u.port || "80";
    if (port !== "3000" && port !== "3001") return false;
    return isPrivateLanHostname(u.hostname);
  } catch {
    return false;
  }
}

export function getAllowedOrigins() {
  const origins = new Set();

  // Explicitly allow production origin
  origins.add("https://vani-ai-ten.vercel.app");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      origins.add(String(appUrl).replace(/\/$/, ""));
    }
  }

  const extra = process.env.CORS_ORIGINS || "";
  for (const part of extra.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      origins.add(trimmed.replace(/\/$/, ""));
    }
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://127.0.0.1:3001");
  }

  return [...origins];
}

/**
 * cors `origin` callback — reflects allowed origins, rejects others.
 * Supports credentials (no wildcard).
 */
export function corsOriginDelegate(origin, callback) {
  const allowed = getAllowedOrigins();

  // Non-browser clients (curl, server-to-server) send no Origin.
  if (!origin) {
    return callback(null, true);
  }

  if (allowed.includes(origin)) {
    return callback(null, true);
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv !== "production" && isDevLanOrigin(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS origin not allowed: ${origin}`));
}
