import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "../utils/logger.js";

/** Default filename under os.tmpdir() (typically `/tmp` on Railway/Linux). */
const CREDENTIALS_FILENAME = "vani-gcp-service-account.json";

/**
 * Materialize inline GCP service-account JSON into a file the Google auth
 * libraries understand via GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Railway / other PaaS hosts cannot ship gitignored `keys/*.json`. Set
 * GOOGLE_APPLICATION_CREDENTIALS_JSON to the full service-account JSON string
 * instead; this runs once at boot (before validateEnvironment) and points
 * GOOGLE_APPLICATION_CREDENTIALS at the written path.
 *
 * Local development: leave GOOGLE_APPLICATION_CREDENTIALS_JSON unset and keep
 * GOOGLE_APPLICATION_CREDENTIALS=./keys/service-account.json — this is a no-op.
 *
 * @returns {{ applied: boolean, path?: string }}
 */
export function materializeGcpCredentialsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw == null || !String(raw).trim()) {
    return { applied: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch (err) {
    const error = new Error(
      `GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${err.message}`
    );
    error.code = "GCP_CREDENTIALS_JSON_INVALID";
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON must be a JSON object (service-account key)."
    );
    error.code = "GCP_CREDENTIALS_JSON_INVALID";
    throw error;
  }

  if (!parsed.client_email || !parsed.private_key) {
    const error = new Error(
      "GOOGLE_APPLICATION_CREDENTIALS_JSON must include client_email and private_key."
    );
    error.code = "GCP_CREDENTIALS_JSON_INVALID";
    throw error;
  }

  const dest = path.join(os.tmpdir(), CREDENTIALS_FILENAME);
  // Canonical pretty JSON — avoids Railway multiline / escaped-string quirks
  // when the env value was pasted as a single line.
  const body = `${JSON.stringify(parsed, null, 2)}\n`;

  try {
    fs.writeFileSync(dest, body, { encoding: "utf8", mode: 0o600 });
    // Ensure mode even if the file already existed (writeFileSync mode is
    // only applied on create on some platforms).
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
  return { applied: true, path: dest };
}
