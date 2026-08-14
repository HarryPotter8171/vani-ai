/**
 * MongoDB URI resolution + safe diagnostics.
 *
 * Canonical env var: MONGODB_URI only.
 * MONGO_URI and DATABASE_URL are detected so misconfigured deploys fail loudly
 * instead of silently connecting to the wrong place (or nowhere).
 *
 * Never log username or password.
 */

/** Env names we recognize — only MONGODB_URI is accepted. */
export const MONGO_URI_ENV_CANDIDATES = Object.freeze([
  "MONGODB_URI",
  "MONGO_URI",
  "DATABASE_URL",
]);

/** Canonical variable this codebase reads. */
export const CANONICAL_MONGO_URI_ENV = "MONGODB_URI";

/**
 * Characters that MUST be percent-encoded inside the password portion of a
 * MongoDB connection string (RFC 3986 userinfo reserved / delimiters).
 */
const PASSWORD_MUST_ENCODE = /[:/?#\[\]@]/;

/** Other characters that commonly break Atlas URIs when left raw. */
const PASSWORD_SHOULD_ENCODE = /[ !$&'()*+,;=]/;

/**
 * Which candidate env vars are currently set (non-empty).
 * @returns {string[]}
 */
export function listSetMongoUriEnvVars(env = process.env) {
  return MONGO_URI_ENV_CANDIDATES.filter((name) => {
    const v = env[name];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * Resolve the Mongo connection string from the environment.
 * Enforces a single canonical source: MONGODB_URI.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   ok: boolean,
 *   uri?: string,
 *   envVar?: string,
 *   setVars: string[],
 *   errors: string[],
 *   warnings: string[],
 * }}
 */
export function resolveMongoUri(env = process.env) {
  const setVars = listSetMongoUriEnvVars(env);
  const errors = [];
  const warnings = [];

  const aliases = setVars.filter((n) => n !== CANONICAL_MONGO_URI_ENV);

  if (aliases.length && !setVars.includes(CANONICAL_MONGO_URI_ENV)) {
    errors.push(
      `Found ${aliases.join(", ")} but not ${CANONICAL_MONGO_URI_ENV}. ` +
        `This app only reads ${CANONICAL_MONGO_URI_ENV} — rename the variable.`
    );
    return { ok: false, setVars, errors, warnings };
  }

  if (aliases.length && setVars.includes(CANONICAL_MONGO_URI_ENV)) {
    errors.push(
      `Multiple Mongo URL env vars set (${setVars.join(", ")}). ` +
        `Use only ${CANONICAL_MONGO_URI_ENV}; unset ${aliases.join(", ")}.`
    );
    return { ok: false, setVars, errors, warnings };
  }

  const raw = env[CANONICAL_MONGO_URI_ENV];
  if (typeof raw !== "string" || !raw.trim()) {
    errors.push(`${CANONICAL_MONGO_URI_ENV} is not set`);
    return { ok: false, setVars, errors, warnings };
  }

  return {
    ok: true,
    uri: raw.trim(),
    envVar: CANONICAL_MONGO_URI_ENV,
    setVars,
    errors,
    warnings,
  };
}

/**
 * Inspect password percent-encoding without returning the password.
 * @param {string} uri
 * @returns {{ hasAuth: boolean, warnings: string[], errors: string[] }}
 */
export function detectPasswordEncodingIssues(uri) {
  const warnings = [];
  const errors = [];
  const s = String(uri);

  // Authority is between scheme:// and the first / ? # (path/query/hash).
  const authorityMatch = s.match(/^mongodb(\+srv)?:\/\/([^/?#]*)/i);
  if (!authorityMatch) {
    return { hasAuth: false, warnings, errors };
  }
  const authority = authorityMatch[2];

  // No credentials
  if (!authority.includes("@")) {
    return { hasAuth: false, warnings, errors };
  }

  // Multiple @ → almost always an unencoded @ inside the password.
  const atCount = (authority.match(/@/g) || []).length;
  if (atCount > 1) {
    errors.push(
      "Mongo URI authority contains more than one '@' — the password likely " +
        "has an unencoded '@'. Percent-encode it as %40."
    );
    return { hasAuth: true, warnings, errors };
  }

  const at = authority.lastIndexOf("@");
  const userinfo = authority.slice(0, at);
  const colon = userinfo.indexOf(":");
  if (colon === -1) {
    return { hasAuth: true, warnings, errors };
  }

  const password = userinfo.slice(colon + 1);
  if (!password) {
    errors.push("Mongo URI has an empty password after the username");
    return { hasAuth: true, warnings, errors };
  }

  // Strip valid %HH sequences, then look for leftover reserved chars / bad %.
  const withoutValidEncoding = password.replace(/%[0-9A-Fa-f]{2}/g, "");

  if (/%/.test(withoutValidEncoding)) {
    errors.push(
      "Mongo URI password has invalid percent-encoding (lone '%' or bad %HH). " +
        "Encode special characters with encodeURIComponent."
    );
  }

  if (PASSWORD_MUST_ENCODE.test(withoutValidEncoding)) {
    errors.push(
      "Mongo URI password contains unencoded reserved characters " +
        "(: / ? # [ ] @). Percent-encode the password " +
        "(e.g. encodeURIComponent) before putting it in MONGODB_URI."
    );
  } else if (PASSWORD_SHOULD_ENCODE.test(withoutValidEncoding)) {
    warnings.push(
      "Mongo URI password contains characters that are safer percent-encoded " +
        "(! $ & ' ( ) * + , ; = or space). If auth fails, encode the password."
    );
  }

  return { hasAuth: true, warnings, errors };
}

/**
 * Parse a Mongo URI and return safe diagnostics (never credentials).
 *
 * @param {string} uri
 * @returns {{
 *   ok: boolean,
 *   protocol?: string,
 *   host?: string,
 *   database?: string,
 *   hasAuth?: boolean,
 *   errors: string[],
 *   warnings: string[],
 * }}
 */
export function parseMongoUriSafe(uri) {
  const errors = [];
  const warnings = [];

  if (typeof uri !== "string" || !uri.trim()) {
    return { ok: false, errors: ["Mongo URI is empty"], warnings };
  }

  const trimmed = uri.trim();

  if (/\s/.test(trimmed)) {
    errors.push("Mongo URI contains whitespace — check for line breaks or accidental spaces");
  }

  const protocolMatch = trimmed.match(/^(mongodb(?:\+srv)?):\/\//i);
  if (!protocolMatch) {
    return {
      ok: false,
      errors: ["Mongo URI must start with mongodb:// or mongodb+srv://"],
      warnings,
    };
  }
  const protocol = protocolMatch[1].toLowerCase();

  const encoding = detectPasswordEncodingIssues(trimmed);
  errors.push(...encoding.errors);
  warnings.push(...encoding.warnings);

  // WHATWG URL needs http(s); preserve host/path/query for inspection.
  let parsed;
  try {
    const forUrl = trimmed
      .replace(/^mongodb\+srv:/i, "https:")
      .replace(/^mongodb:/i, "http:");
    parsed = new URL(forUrl);
  } catch (err) {
    return {
      ok: false,
      protocol,
      hasAuth: encoding.hasAuth,
      errors: [
        ...errors,
        `Malformed Mongo connection string (${err?.message || "parse error"}). ` +
          "If the password has special characters, percent-encode it.",
      ],
      warnings,
    };
  }

  const host = parsed.host || parsed.hostname;
  if (!host) {
    errors.push("Mongo URI is missing a host");
  }

  // pathname is "/dbname" — empty means driver default DB
  const dbPath = (parsed.pathname || "").replace(/^\//, "");
  const database = dbPath ? dbPath.split("/")[0] : "";
  if (!database) {
    warnings.push(
      "Mongo URI has no database name in the path (e.g. ...mongodb.net/vani-ai). " +
        "Mongoose will use the driver default."
    );
  }

  if (protocol === "mongodb+srv" && parsed.port) {
    warnings.push("mongodb+srv URIs should not include a port");
  }

  if (errors.length) {
    return {
      ok: false,
      protocol,
      host: host || undefined,
      database: database || undefined,
      hasAuth: encoding.hasAuth,
      errors,
      warnings,
    };
  }

  return {
    ok: true,
    protocol,
    host,
    database: database || "(default)",
    hasAuth: encoding.hasAuth,
    errors,
    warnings,
  };
}

/**
 * Resolve + parse. Used at startup before mongoose.connect.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateMongoUriConfig(env = process.env) {
  const resolved = resolveMongoUri(env);
  if (!resolved.ok) {
    return {
      ok: false,
      envVar: resolved.envVar,
      setVars: resolved.setVars,
      uri: resolved.uri,
      errors: resolved.errors,
      warnings: resolved.warnings,
    };
  }

  const parsed = parseMongoUriSafe(resolved.uri);
  return {
    ok: parsed.ok,
    envVar: resolved.envVar,
    setVars: resolved.setVars,
    uri: resolved.uri,
    protocol: parsed.protocol,
    host: parsed.host,
    database: parsed.database,
    hasAuth: parsed.hasAuth,
    errors: [...resolved.errors, ...parsed.errors],
    warnings: [...resolved.warnings, ...parsed.warnings],
  };
}

/**
 * True when a connect error is authentication / bad credentials.
 * @param {unknown} err
 */
export function isMongoAuthError(err) {
  if (!err) return false;
  const code = /** @type {{ code?: unknown, codeName?: unknown, message?: unknown }} */ (err)
    .code;
  const codeName = /** @type {{ codeName?: unknown }} */ (err).codeName;
  if (code === 18 || code === 8000) return true;
  if (codeName === "AuthenticationFailed") return true;

  const msg = String(
    /** @type {{ message?: unknown }} */ (err).message || err
  );
  return (
    /bad auth/i.test(msg) ||
    /authentication failed/i.test(msg) ||
    /auth failed/i.test(msg) ||
    /AuthenticationFailed/i.test(msg) ||
    /SCRAM.+(not present|failed)/i.test(msg) ||
    /invalid.*(user|password|credential)/i.test(msg)
  );
}

/**
 * Human-readable fatal message for auth failure (no secrets).
 * @param {{ host?: string, database?: string, envVar?: string }} meta
 * @param {unknown} err
 */
export function formatMongoAuthFailureMessage(meta, err) {
  const host = meta.host || "(unknown host)";
  const database = meta.database || "(unknown database)";
  const envVar = meta.envVar || CANONICAL_MONGO_URI_ENV;
  const detail = String(/** @type {{ message?: unknown }} */ (err)?.message || err);
  return [
    "MongoDB authentication failed — refusing to start.",
    `  env: ${envVar}`,
    `  host: ${host}`,
    `  database: ${database}`,
    `  detail: ${detail}`,
    "Check the username/password in MONGODB_URI (percent-encode special characters in the password).",
    "Do not set MONGO_URI or DATABASE_URL — this app only uses MONGODB_URI.",
  ].join("\n");
}
