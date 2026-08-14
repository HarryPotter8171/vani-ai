import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeGcpCredentialsFromEnv } from "../../../config/gcpCredentials.js";

const ENV_KEYS = [
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

const DEST = path.join(os.tmpdir(), "vani-gcp-service-account.json");

const VALID_SA = {
  type: "service_account",
  project_id: "demo",
  private_key_id: "abc",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n",
  client_email: "demo@demo.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

describe("config/gcpCredentials", () => {
  let snapshot;

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const key of ENV_KEYS) delete process.env[key];
    try {
      fs.unlinkSync(DEST);
    } catch {
      /* absent */
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
    try {
      fs.unlinkSync(DEST);
    } catch {
      /* absent */
    }
  });

  it("is a no-op when GOOGLE_APPLICATION_CREDENTIALS_JSON is unset", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./keys/service-account.json";
    const result = materializeGcpCredentialsFromEnv();
    expect(result).toEqual({ applied: false });
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      "./keys/service-account.json"
    );
    expect(fs.existsSync(DEST)).toBe(false);
  });

  it("writes JSON to tmp and sets GOOGLE_APPLICATION_CREDENTIALS", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./keys/missing.json";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(VALID_SA);

    const result = materializeGcpCredentialsFromEnv();
    expect(result.applied).toBe(true);
    expect(result.path).toBe(DEST);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(DEST);
    expect(fs.existsSync(DEST)).toBe(true);

    const written = JSON.parse(fs.readFileSync(DEST, "utf8"));
    expect(written.client_email).toBe(VALID_SA.client_email);
    expect(written.private_key).toBe(VALID_SA.private_key);
  });

  it("rejects invalid JSON", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "{not-json";
    expect(() => materializeGcpCredentialsFromEnv()).toThrow(/not valid JSON/);
  });

  it("rejects JSON missing client_email / private_key", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      type: "service_account",
    });
    expect(() => materializeGcpCredentialsFromEnv()).toThrow(
      /client_email and private_key/
    );
  });
});
