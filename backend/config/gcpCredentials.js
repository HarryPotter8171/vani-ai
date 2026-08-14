import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "../utils/logger.js";

/** Default filename under os.tmpdir() (typically `/tmp` on Railway/Linux). */
const CREDENTIALS_FILENAME = "vani-gcp-service-account.json";

/**
 * Parse and validate inline GCP service-account JSON from an env var.
 * @param {string} raw
 * @param {string} envVarName — used in error messages
 * @returns {Record<string, unknown>}
 */
export function parseGcpServiceAccountJson(raw, envVarName) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    const error = new Error(
      `${envVarName} is not valid JSON: ${err.message}`
    );
    error.code = "GCP_CREDENTIALS_JSON_INVALID";
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error(
      `${envVarName} must be a JSON object (service-account key).`
    );
    error.code = "GCP_CREDENTIALS_JSON_INVALID";
    throw error;
  }

  if (!parsed.client_email || !parsed.private_key) {
    const error = new Error(
      `${envVarName} must include client_email and private_key.`
    );
    error.code = "GCP_CREDENTIALS_JSON_INVALID";
    throw error;
  }

  return parsed;
}

/**
 * Inline service-account credentials from GOOGLE_CREDENTIALS_JSON (Vercel / PaaS).
 * Returns null when unset — callers fall back to GOOGLE_APPLICATION_CREDENTIALS / ADC.
 * @returns {Record<string, unknown> | null}
 */
export function getInlineGcpCredentials() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (raw == null || !String(raw).trim()) {
    return null;
  }
  return parseGcpServiceAccountJson(raw, "GOOGLE_CREDENTIALS_JSON");
}

/**
 * google-auth-library options for Vertex / Gemini clients when inline JSON is set.
 * @returns {{ credentials: Record<string, unknown> } | undefined}
 */
export function getGoogleAuthOptions() {
  const credentials = getInlineGcpCredentials();
  if (!credentials) return undefined;
  return { credentials };
}

/**
 * Shared GoogleGenAI constructor options for Vertex AI.
 * @param {{ apiVersion: string }} opts
 */
export function buildGoogleGenAIOptions({ apiVersion }) {
  /** @type {import("@google/genai").GoogleGenAIOptions} */
  const options = {
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION,
    apiVersion,
  };

  const googleAuthOptions = getGoogleAuthOptions();
  if (googleAuthOptions) {
    options.googleAuthOptions = googleAuthOptions;
  }

  return options;
}

/**
 * Materialize inline GCP service-account JSON into a file the Google auth
 * libraries understand via GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Vercel / PaaS (preferred): set GOOGLE_CREDENTIALS_JSON — parsed and passed
 * directly to GoogleGenAI via googleAuthOptions (no temp file).
 *
 * Railway / legacy PaaS: set GOOGLE_APPLICATION_CREDENTIALS_JSON — written to
 * $TMPDIR/vani-gcp-service-account.json and GOOGLE_APPLICATION_CREDENTIALS is
 * pointed at that path.
 *
 * Local development: leave both unset and keep
 * GOOGLE_APPLICATION_CREDENTIALS=./keys/service-account.json — this is a no-op.
 *
 * @returns {{ applied: boolean, path?: string, mode?: "inline" | "file" }}
 */
export function materializeGcpCredentialsFromEnv() {
  if (process.env.GOOGLE_CREDENTIALS_JSON?.trim()) {
    parseGcpServiceAccountJson(
      process.env.GOOGLE_CREDENTIALS_JSON,
      "GOOGLE_CREDENTIALS_JSON"
    );
    logger.info("[gcp] using GOOGLE_CREDENTIALS_JSON (inline Vertex auth)");
    return { applied: false, mode: "inline" };
  }

  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw == null || !String(raw).trim()) {
    return { applied: false };
  }

  const parsed = parseGcpServiceAccountJson(
    raw,
    "GOOGLE_APPLICATION_CREDENTIALS_JSON"
  );

  const dest = path.join(os.tmpdir(), CREDENTIALS_FILENAME);
  const body = `${JSON.stringify(parsed, null, 2)}\n`;

  try {
    fs.writeFileSync(dest, body, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(dest, 0o600);
  } catch (err) {
    const error = new Error(
      `Unable to write GCP credentials to ${dest}: ${err.message}`
    );
    error.code = "GCP_CREDENTIALS_WRITE_FAILED";
    throw error;
  }

  process.env.GOOGLE_APPLICATION_CREDENTIALS = dest;
  logger.info(
    `[gcp] materialised GOOGLE_APPLICATION_CREDENTIALS_JSON → ${dest}`
  );
  return { applied: true, path: dest, mode: "file" };
}
