import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { validateFileSignature, validateStoredFileSignature } from "../../../utils/fileSignatures.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");

describe("utils/fileSignatures", () => {
  it("accepts a real PNG signature", async () => {
    const buf = await readFile(path.join(FIXTURES, "sample.png"));
    expect(validateFileSignature(buf, ".png")).toEqual({ ok: true });
  });

  it("rejects a PNG-extension file whose bytes are not PNG (spoofed upload)", () => {
    const fakePng = Buffer.from("this is definitely not a png");
    const result = validateFileSignature(fakePng, ".png");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a valid PNG/);
  });

  it("accepts a real PDF signature", async () => {
    const buf = await readFile(path.join(FIXTURES, "sample.pdf"));
    expect(validateFileSignature(buf, ".pdf")).toEqual({ ok: true });
  });

  it("rejects a spoofed PDF (renamed text file)", async () => {
    const buf = await readFile(path.join(FIXTURES, "sample.txt"));
    const result = validateFileSignature(buf, ".pdf");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a valid PDF/);
  });

  it("accepts a real DOCX (zip container with word/ contents)", async () => {
    const buf = await readFile(path.join(FIXTURES, "sample.docx"));
    expect(validateFileSignature(buf, ".docx")).toEqual({ ok: true });
  });

  it("rejects a docx-extension file that is not a zip at all", () => {
    const result = validateFileSignature(Buffer.from("not a zip"), ".docx");
    expect(result.ok).toBe(false);
  });

  it("rejects a zip that has no docx package markers (e.g. a renamed .zip)", async () => {
    // A minimal valid zip signature without word/ or [Content_Types].xml content.
    const emptyZip = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
    const result = validateFileSignature(emptyZip, ".docx");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/DOCX package/);
  });

  it("accepts a real XLSX (zip container with xl/ contents)", async () => {
    const buf = await readFile(path.join(FIXTURES, "sample.xlsx"));
    expect(validateFileSignature(buf, ".xlsx")).toEqual({ ok: true });
  });

  it("accepts plain text for .txt/.md/.csv", async () => {
    const buf = await readFile(path.join(FIXTURES, "sample.csv"));
    expect(validateFileSignature(buf, ".csv")).toEqual({ ok: true });
    expect(validateFileSignature(buf, ".txt")).toEqual({ ok: true });
  });

  it("rejects binary content pretending to be text", () => {
    const binary = Buffer.from(new Array(200).fill(0)); // dense NUL bytes
    const result = validateFileSignature(binary, ".txt");
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported extension", () => {
    const result = validateFileSignature(Buffer.from("data"), ".exe");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unsupported extension/);
  });

  it("validates JPEG, WEBP, GIF, BMP magic bytes", () => {
    expect(validateFileSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), ".jpg").ok).toBe(true);
    expect(validateFileSignature(Buffer.from([0x00, 0x00]), ".jpg").ok).toBe(false);

    const webp = Buffer.concat([
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]),
      Buffer.from("WEBP"),
    ]);
    expect(validateFileSignature(webp, ".webp").ok).toBe(true);

    expect(validateFileSignature(Buffer.from("GIF89a"), ".gif").ok).toBe(true);
    expect(validateFileSignature(Buffer.from([0x42, 0x4d, 0, 0]), ".bmp").ok).toBe(true);
  });

  describe("validateStoredFileSignature", () => {
    it("reads the file from disk and validates against its extension", async () => {
      const result = await validateStoredFileSignature(
        path.join(FIXTURES, "sample.png"),
        "photo.png"
      );
      expect(result).toEqual({ ok: true });
    });

    it("derives the extension from the original filename, not the stored path", async () => {
      // Stored path has no extension (as real uploads are stored by UUID);
      // the *original* filename decides which signature to check.
      const result = await validateStoredFileSignature(
        path.join(FIXTURES, "sample.png"),
        "not-a-real-name.pdf"
      );
      expect(result.ok).toBe(false);
    });
  });
});
