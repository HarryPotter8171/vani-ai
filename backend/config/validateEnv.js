import fs from "fs";
import { logger } from "../utils/logger.js";
import {
  CANONICAL_MONGO_URI_ENV,
  listSetMongoUriEnvVars,
  validateMongoUriConfig,
} from "./mongoUri.js";

const MIN_SECRET_LENGTH = 32;
const WEAK_SECRET_PATTERNS = [
  /^changeme$/i,
  /^secret$/i,
  /^password$/i,
  /^placeholder$/i,
  /^your[_-]?secret/i,
  /^test$/i,
  /^dev$/i,
  /^example$/i,
];

function isWeakSecret(value) {
  const v = String(value || "");
  if (v.length < MIN_SECRET_LENGTH) return true;
  return WEAK_SECRET_PATTERNS.some((re) => re.test(v));
}

/**
 * Required-in-production environment variable rules. Each `check` reads
 * live `process.env` (not cached) so this can be re-run in tests.
 */
const RULES = [
  {
    name: "AUTH_JWT_SECRET / NEXTAUTH_SECRET",
    check: () => !!(process.env.AUTH_JWT_SECRET || process.env.NEXTAUTH_SECRET),
    hint: "Set AUTH_JWT_SECRET (or NEXTAUTH_SECRET) — required to sign/verify session access tokens.",
  },
  {
    name: "NEXTAUTH_SECRET",
    check: () => !!process.env.NEXTAUTH_SECRET,
    hint: "Set NEXTAUTH_SECRET — must match the frontend's NextAuth secret.",
  },
  {
    // Production: require a dedicated AUTH_JWT_SECRET that is long and distinct
    // from NEXTAUTH_SECRET (shared/weak secrets forge both session + API JWTs).
    name: "AUTH_JWT_SECRET strength + distinct from NEXTAUTH_SECRET",
    check: () => {
      if (process.env.NODE_ENV !== "production") return true;
      const jwt = process.env.AUTH_JWT_SECRET;
      const next = process.env.NEXTAUTH_SECRET;
      if (!jwt || !next) return false;
      if (jwt === next) return false;
      if (isWeakSecret(jwt) || isWeakSecret(next)) return false;
      return true;
    },
    hint: `In production set AUTH_JWT_SECRET and NEXTAUTH_SECRET to distinct values ≥${MIN_SECRET_LENGTH} characters (no placeholders). Do not reuse one secret for both.`,
  },
  {
    name: "MONGODB_URI",
    check: () => !!process.env.MONGODB_URI,
    hint: "Set MONGODB_URI — required for all persistence (chats, users, memory, files). Do not use MONGO_URI or DATABASE_URL.",
  },
  {
    // Reject alias env vars so only MONGODB_URI is ever read.
    name: "Mongo URI env aliases (MONGO_URI / DATABASE_URL must be unset)",
    check: () => {
      const set = listSetMongoUriEnvVars();
      const aliases = set.filter((n) => n !== CANONICAL_MONGO_URI_ENV);
      return aliases.length === 0;
    },
    hint: "Unset MONGO_URI and DATABASE_URL — this app only reads MONGODB_URI.",
  },
  {
    name: "MONGODB_URI format",
    check: () => {
      if (!process.env.MONGODB_URI) return true; // covered by presence rule
      return validateMongoUriConfig().ok;
    },
    hint: "MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI. Percent-encode special characters in the password. Fix malformed strings before boot.",
  },
  {
    name: "GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION",
    check: () => !!(process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION),
    hint: "Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION — required for Gemini/Vertex AI (chat, vision, voice).",
  },
  {
    // Optional: GCP workload identity / attached service accounts (Cloud
    // Run, GKE, Compute Engine) authenticate via ambient credentials with no
    // key file at all. Only validated *if* a path was actually provided.
    name: "GOOGLE_APPLICATION_CREDENTIALS",
    check: () => {
      const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!p) return true;
      try {
        fs.accessSync(p, fs.constants.R_OK);
        return true;
      } catch {
        return false;
      }
    },
    hint: "GOOGLE_APPLICATION_CREDENTIALS is set but not a readable file. Point it at a valid service-account JSON, set GOOGLE_CREDENTIALS_JSON (Vercel/PaaS inline auth), set GOOGLE_APPLICATION_CREDENTIALS_JSON (temp-file materialisation), or unset all to use ambient/workload-identity credentials.",
  },
  {
    name: "TAVILY_API_KEY",
    check: () => process.env.TAVILY_ENABLED !== "true" || !!process.env.TAVILY_API_KEY,
    hint: "TAVILY_ENABLED=true requires TAVILY_API_KEY. Unset TAVILY_ENABLED to use the built-in search fallback instead.",
  },
  {
    name: "OPENAI_API_KEY",
    check: () =>
      String(process.env.IMAGE_PROVIDER || "gemini").toLowerCase() !== "openai" ||
      !!process.env.OPENAI_API_KEY,
    hint: "IMAGE_PROVIDER=openai requires OPENAI_API_KEY.",
  },
  {
    name: "VANI_MEMORY_ENCRYPTION_KEY",
    check: () => !!process.env.VANI_MEMORY_ENCRYPTION_KEY,
    hint: "Set VANI_MEMORY_ENCRYPTION_KEY (32-byte hex, or any passphrase — it's hashed to a key) to encrypt memory content at rest.",
  },
  {
    // Kill-switch must never ship in production — opens all plan features.
    name: "FEATURE_GATING_DISABLED must not be true",
    check: () => process.env.FEATURE_GATING_DISABLED !== "true",
    hint: "Unset FEATURE_GATING_DISABLED (or set it to anything other than true). Plan/quota enforcement cannot be bypassed in production.",
  },
  {
    // Shared rate-limit / session state needs Redis when running >1 replica
    // (or when REQUIRE_REDIS=true forces it). Public Beta compose sets REQUIRE_REDIS.
    name: "REDIS_URL / REDIS_HOST",
    check: () => {
      const requireRedis =
        process.env.REQUIRE_REDIS === "true" || process.env.REQUIRE_REDIS === "1";
      const replicaRaw =
        process.env.VANI_REPLICAS ||
        process.env.WEB_CONCURRENCY ||
        process.env.INSTANCE_COUNT;
      const replicas = Number(replicaRaw);
      const multiReplica =
        process.env.NODE_ENV === "production" &&
        Number.isFinite(replicas) &&
        replicas > 1;
      if (!requireRedis && !multiReplica) return true;
      return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
    },
    hint: "Multi-replica production (VANI_REPLICAS / WEB_CONCURRENCY / INSTANCE_COUNT > 1) or REQUIRE_REDIS=true requires REDIS_URL or REDIS_HOST for shared rate limiting and caches.",
  },
  {
    // Debug flags can leak transport/tool internals into logs — forbid in prod.
    name: "Debug flags must not be enabled in production",
    check: () => {
      if (process.env.NODE_ENV !== "production") return true;
      const flagged = ["MCP_DEBUG", "BROWSER_DEBUG", "VANI_DEBUG"];
      return flagged.every((k) => {
        const v = process.env[k];
        return !v || v === "false" || v === "0";
      });
    },
    hint: "Unset MCP_DEBUG / BROWSER_DEBUG / VANI_DEBUG in production (or set them to false).",
  },
];

/**
 * Validate required environment variables. In production (or when
 * `throwOnError` is explicitly true) this throws — callers should let the
 * process exit rather than boot half-configured. Outside production it logs
 * warnings and returns the failures so local/dev setups stay frictionless.
 *
 * @param {{ throwOnError?: boolean }} [opts]
 * @returns {{ ok: boolean, failures: { name: string, hint: string }[] }}
 */
export function validateEnvironment(opts = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  const strict = opts.throwOnError ?? isProduction;

  const failures = RULES.filter((rule) => !rule.check()).map(({ name, hint }) => ({ name, hint }));

  if (!failures.length) {
    logger.info("[env] all required environment variables are present");
    return { ok: true, failures: [] };
  }

  for (const failure of failures) {
    logger[strict ? "error" : "warn"](
      `[env] ${strict ? "MISSING (required in production)" : "missing"}: ${failure.name} — ${failure.hint}`
    );
  }

  if (strict) {
    const message = [
      "Refusing to start: missing required production environment variables:",
      ...failures.map((f) => `  - ${f.name}: ${f.hint}`),
    ].join("\n");
    const err = new Error(message);
    err.code = "ENV_VALIDATION_FAILED";
    throw err;
  }

  return { ok: false, failures };
}
