import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildGoogleGenAIOptions,
  getGoogleAuthOptions,
  materializeGcpCredentialsFromEnv,
} from "../../../config/gcpCredentials.js";

const ENV_KEYS = [
  "GOOGLE_CREDENTIALS_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
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

  it("is a no-op when inline JSON env vars are unset", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./keys/service-account.json";
    const result = materializeGcpCredentialsFromEnv();
    expect(result).toEqual({ applied: false });
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      "./keys/service-account.json"
    );
    expect(fs.existsSync(DEST)).toBe(false);
  });

  it("validates GOOGLE_CREDENTIALS_JSON without writing a temp file", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./keys/missing.json";
    process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify(VALID_SA);

    const result = materializeGcpCredentialsFromEnv();
    expect(result).toEqual({ applied: false, mode: "inline" });
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(
      "./keys/missing.json"
    );
    expect(fs.existsSync(DEST)).toBe(false);
  });

  it("buildGoogleGenAIOptions passes inline credentials to googleAuthOptions", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "demo-proj";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify(VALID_SA);

    const options = buildGoogleGenAIOptions({ apiVersion: "v1" });
    expect(options.vertexai).toBe(true);
    expect(options.project).toBe("demo-proj");
    expect(options.location).toBe("us-central1");
    expect(options.apiVersion).toBe("v1");
    expect(options.googleAuthOptions?.credentials?.client_email).toBe(
      VALID_SA.client_email
    );
    expect(getGoogleAuthOptions()?.credentials?.private_key).toBe(
      VALID_SA.private_key
    );
  });

  it("buildGoogleGenAIOptions omits googleAuthOptions when JSON env is unset", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "demo-proj";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";

    const options = buildGoogleGenAIOptions({ apiVersion: "v1beta1" });
    expect(options.googleAuthOptions).toBeUndefined();
  });

  it("writes GOOGLE_APPLICATION_CREDENTIALS_JSON to tmp and sets GOOGLE_APPLICATION_CREDENTIALS", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./keys/missing.json";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(VALID_SA);

    const result = materializeGcpCredentialsFromEnv();
    expect(result.applied).toBe(true);
    expect(result.path).toBe(DEST);
    expect(result.mode).toBe("file");
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(DEST);
    expect(fs.existsSync(DEST)).toBe(true);

    const written = JSON.parse(fs.readFileSync(DEST, "utf8"));
    expect(written.client_email).toBe(VALID_SA.client_email);
    expect(written.private_key).toBe(VALID_SA.private_key);
  });

  it("prefers GOOGLE_CREDENTIALS_JSON over GOOGLE_APPLICATION_CREDENTIALS_JSON", () => {
    process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify(VALID_SA);
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      ...VALID_SA,
      client_email: "other@demo.iam.gserviceaccount.com",
    });

    const result = materializeGcpCredentialsFromEnv();
    expect(result.mode).toBe("inline");
    expect(fs.existsSync(DEST)).toBe(false);
    expect(getGoogleAuthOptions()?.credentials?.client_email).toBe(
      VALID_SA.client_email
    );
  });

  it("rejects invalid GOOGLE_CREDENTIALS_JSON", () => {
    process.env.GOOGLE_CREDENTIALS_JSON = "{not-json";
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
