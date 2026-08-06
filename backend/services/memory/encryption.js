import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey() {
  const raw = process.env.VANI_MEMORY_ENCRYPTION_KEY || "";
  if (!raw) return null;
  // Accept 64-char hex or any string (hashed to 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function isEncryptionEnabled() {
  return !!getKey();
}

/**
 * Encrypt plaintext for at-rest storage. Returns { ciphertext, encrypted: true }
 * or passthrough when no key is configured (local/dev).
 */
export function encryptContent(plaintext) {
  const key = getKey();
  const text = String(plaintext ?? "");
  if (!key) return { content: text, encrypted: false };

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext — all base64
  const packed = `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
  return { content: packed, encrypted: true };
}

export function decryptContent(content, encrypted = false) {
  const text = String(content ?? "");
  if (!encrypted) return text;
  const key = getKey();
  if (!key) {
    // Key missing but data marked encrypted — refuse to leak ciphertext as "content".
    return "[encrypted]";
  }
  const [ivB64, tagB64, dataB64] = text.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return "[encrypted]";
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "[encrypted]";
  }
}
