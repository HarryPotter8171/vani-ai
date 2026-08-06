/**
 * MCP stdio transport policy — multi-tenant hosts must not spawn arbitrary
 * user-supplied commands (authenticated RCE). Local verification scripts may
 * opt in with MCP_ALLOW_STDIO=true when NODE_ENV is not production.
 */

const STDIO_DISABLED_MESSAGE =
  "stdio MCP transport is disabled on this server. Use http, sse, or websocket to a remote MCP server. " +
  "Local stdio is only available when MCP_ALLOW_STDIO=true and NODE_ENV is not production.";

/** Env keys safe to inherit for an allowlisted local stdio child. */
const INHERIT_ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
  "TEMP",
  "TMP",
  "USER",
  "LOGNAME",
  "NODE_OPTIONS",
]);

/** Never forward these (or similarly secret) keys from user-supplied env. */
const DANGEROUS_ENV_KEY =
  /^(AUTH_|NEXTAUTH_|JWT_|MONGODB_|REDIS_|STRIPE_|RAZORPAY_|OPENAI_|ANTHROPIC_|GOOGLE_|GCP_|AWS_|AZURE_|VANI_MEMORY_|DATABASE_|DB_|SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE)/i;

/**
 * Whether stdio transport may be used at all.
 * Production always refuses — even if MCP_ALLOW_STDIO is set.
 */
export function isMcpStdioAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.MCP_ALLOW_STDIO === "true";
}

export function assertMcpStdioAllowed(): void {
  if (!isMcpStdioAllowed()) {
    const err = new Error(STDIO_DISABLED_MESSAGE);
    (err as Error & { code?: string }).code = "MCP_STDIO_DISABLED";
    throw err;
  }
}

function sanitizeUserEnv(env?: Record<string, string>): Record<string, string> {
  if (!env || typeof env !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof value !== "string") continue;
    if (DANGEROUS_ENV_KEY.test(key)) continue;
    out[key] = value.slice(0, 4000);
  }
  return out;
}

/**
 * Build a scrubbed env for stdio children. Never inherits full process.env
 * (avoids leaking JWT secrets, Mongo URIs, provider keys).
 */
export function buildScrubbedStdioEnv(
  userEnv?: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of INHERIT_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  Object.assign(out, sanitizeUserEnv(userEnv));
  return out;
}

export const MCP_STDIO_DISABLED_MESSAGE = STDIO_DISABLED_MESSAGE;
