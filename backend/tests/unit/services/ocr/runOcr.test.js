import { describe, it, expect, vi, beforeEach } from "vitest";

const extractOcrText = vi.fn();

vi.mock("../../../../services/image/ocr.js", () => ({
  extractOcrText: (...args) => extractOcrText(...args),
}));

const { runOcr, isOcrSupported } = await import(
  "../../../../services/ocr/runOcr.js"
);

beforeEach(() => {
  extractOcrText.mockReset();
});

describe("runOcr", () => {
  it("validates supported formats", () => {
    expect(isOcrSupported({ filename: "a.jpg" })).toBe(true);
    expect(isOcrSupported({ filename: "a.jpeg" })).toBe(true);
    expect(isOcrSupported({ filename: "a.png" })).toBe(true);
    expect(isOcrSupported({ filename: "a.webp" })).toBe(true);
    expect(isOcrSupported({ filename: "a.pdf" })).toBe(true);
    expect(isOcrSupported({ filename: "a.gif" })).toBe(false);
  });

  it("returns the required API shape for images", async () => {
    extractOcrText.mockResolvedValueOnce({
      ocrText: "नमस्ते Hello",
      confidence: 88.5,
      language: "eng+hin",
      blocks: null,
    });

    const result = await runOcr(Buffer.from("fake"), {
      filename: "mixed.png",
      mimeType: "image/png",
    });

    expect(result).toMatchObject({
      success: true,
      text: "नमस्ते Hello",
      language: "eng+hin",
    });
    expect(Array.isArray(result.pages)).toBe(true);
    expect(result.pages[0].page).toBe(1);
    expect(result.metadata).toMatchObject({ source: "image" });
  });

  it("returns success:false for empty buffers", async () => {
    const result = await runOcr(Buffer.alloc(0), {
      filename: "a.png",
      mimeType: "image/png",
    });
    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toMatch(/empty/i);
  });

  it("returns success:false for unsupported types", async () => {
    const result = await runOcr(Buffer.from("x"), {
      filename: "a.gif",
      mimeType: "image/gif",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported/i);
  });
});
