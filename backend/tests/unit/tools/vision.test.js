import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.fn();
vi.mock("../../../services/geminiClient.js", () => ({
  CHAT_MODEL: "gemini-2.5-flash",
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const { visionTool } = await import("../../../tools/implementations/vision.js");

beforeEach(() => {
  generateContent.mockReset();
});

const imageContent = [
  {
    role: "user",
    parts: [{ inlineData: { mimeType: "image/jpeg", data: "aW1nMQ==" } }],
  },
];

describe("visionTool", () => {
  it("errors when no images are available", async () => {
    const result = await visionTool.execute({}, { contents: [], attachments: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no images/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("analyzes an image found in conversation contents", async () => {
    generateContent.mockResolvedValueOnce({ text: "A red apple on a table." });
    const result = await visionTool.execute({ focus: "describe" }, { contents: imageContent });

    expect(result.ok).toBe(true);
    expect(result.analysis).toBe("A red apple on a table.");
    expect(result.imageCount).toBe(1);
  });

  it("falls back to raw attachments when no images are in contents", async () => {
    generateContent.mockResolvedValueOnce({ text: "ok" });
    const result = await visionTool.execute(
      {},
      { contents: [], attachments: [{ kind: "image", dataBase64: "abc", mimeType: "image/png" }] }
    );
    expect(result.ok).toBe(true);
  });

  it("selects a specific image by 1-based index", async () => {
    generateContent.mockResolvedValueOnce({ text: "second image" });
    const twoImages = [
      { role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: "img1" } }] },
      { role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: "img2" } }] },
    ];
    const result = await visionTool.execute({ imageIndex: 2 }, { contents: twoImages });
    expect(result.ok).toBe(true);
    expect(result.imageCount).toBe(1);
  });

  it("errors on an out-of-range image index", async () => {
    const result = await visionTool.execute({ imageIndex: 5 }, { contents: imageContent });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it("returns ok:false when the model call throws", async () => {
    generateContent.mockRejectedValueOnce(new Error("vision down"));
    const result = await visionTool.execute({}, { contents: imageContent });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("vision down");
  });
});
