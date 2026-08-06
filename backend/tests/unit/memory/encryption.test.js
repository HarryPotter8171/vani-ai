import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptContent, decryptContent, isEncryptionEnabled } from "../../../services/memory/encryption.js";

const KEY_VAR = "VANI_MEMORY_ENCRYPTION_KEY";

describe("services/memory/encryption", () => {
  let saved;

  beforeEach(() => {
    saved = process.env[KEY_VAR];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[KEY_VAR];
    else process.env[KEY_VAR] = saved;
  });

  it("passes content through unencrypted when no key is configured", () => {
    delete process.env[KEY_VAR];
    expect(isEncryptionEnabled()).toBe(false);
    const { content, encrypted } = encryptContent("hello world");
    expect(encrypted).toBe(false);
    expect(content).toBe("hello world");
    expect(decryptContent(content, false)).toBe("hello world");
  });

  it("encrypts and decrypts round-trip when a key is configured (hex key)", () => {
    process.env[KEY_VAR] = "a".repeat(64); // valid 64-char hex
    expect(isEncryptionEnabled()).toBe(true);

    const plaintext = "sensitive user memory: lives in Mumbai";
    const { content, encrypted } = encryptContent(plaintext);
    expect(encrypted).toBe(true);
    expect(content).not.toContain(plaintext);
    expect(content.split(":")).toHaveLength(3);

    const decrypted = decryptContent(content, true);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts round-trip with an arbitrary (non-hex) passphrase", () => {
    process.env[KEY_VAR] = "my-arbitrary-passphrase";
    const { content, encrypted } = encryptContent("another secret");
    expect(encrypted).toBe(true);
    expect(decryptContent(content, true)).toBe("another secret");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    process.env[KEY_VAR] = "b".repeat(64);
    const a = encryptContent("same plaintext");
    const b = encryptContent("same plaintext");
    expect(a.content).not.toBe(b.content);
  });

  it("returns a safe placeholder when decrypting without the key", () => {
    process.env[KEY_VAR] = "c".repeat(64);
    const { content } = encryptContent("top secret");

    delete process.env[KEY_VAR];
    expect(decryptContent(content, true)).toBe("[encrypted]");
  });

  it("returns a safe placeholder for corrupted ciphertext", () => {
    process.env[KEY_VAR] = "d".repeat(64);
    expect(decryptContent("not:valid", true)).toBe("[encrypted]");
    expect(decryptContent("garbage-with-no-colons", true)).toBe("[encrypted]");
  });

  it("passthrough content is returned unchanged when encrypted flag is false", () => {
    process.env[KEY_VAR] = "e".repeat(64);
    expect(decryptContent("plain, never encrypted", false)).toBe("plain, never encrypted");
  });
});
