import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateContent = vi.fn();
const prepareMock = vi.fn();

vi.mock("../../../services/geminiClient.js", () => ({
  IMAGE_MODEL: "gemini-2.5-flash-image",
  IMAGE_EDIT_MODEL: "gemini-2.5-flash-image",
  getGeminiClient: () => ({ models: { generateContent } }),
}));

vi.mock("@google/genai", () => ({
  Modality: { TEXT: "TEXT", IMAGE: "IMAGE" },
}));

vi.mock("../../../services/image/prepareEditSource.js", () => ({
  prepareEditSourceImage: (...args) => prepareMock(...args),
}));

const { imageGenerationTool } = await import(
  "../../../tools/implementations/imageGeneration.js"
);

function withImagePart(base64 = "ZmFrZS1pbWFnZS1ieXRlcw==") {
  return {
    candidates: [
      {
        content: {
          parts: [{ inlineData: { mimeType: "image/png", data: base64 } }],
        },
      },
    ],
  };
}

beforeEach(() => {
  generateContent.mockReset();
  prepareMock.mockReset();
  prepareMock.mockResolvedValue({
    mimeType: "image/jpeg",
    dataBase64: "cHJlcGFyZWQ=",
    width: 800,
    height: 600,
    bytes: 400,
  });
  delete process.env.VANI_DISABLE_IMAGE_GEN;
});

afterEach(() => {
  delete process.env.VANI_DISABLE_IMAGE_GEN;
});

describe("imageGenerationTool", () => {
  it("exposes the expected tool metadata", () => {
    expect(imageGenerationTool.name).toBe("image_generation");
    expect(imageGenerationTool.schema.required).toContain("prompt");
  });

  it("rejects an empty prompt", async () => {
    const result = await imageGenerationTool.execute({ prompt: "  " });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/prompt is required/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rejects an overly long prompt", async () => {
    const result = await imageGenerationTool.execute({
      prompt: "x".repeat(2001),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too long/i);
  });

  it("returns an image on success (text-only, no source)", async () => {
    generateContent.mockResolvedValueOnce(withImagePart());
    const result = await imageGenerationTool.execute({
      prompt: "a red bicycle",
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("Generate");
    expect(result.mimeType).toBe("image/png");
    expect(result.imageBase64).toBe("ZmFrZS1pbWFnZS1ieXRlcw==");
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts.every((p) => !p.inlineData)).toBe(true);
  });

  it("includes the aspect ratio hint in the prompt when provided", async () => {
    generateContent.mockResolvedValueOnce(withImagePart());
    await imageGenerationTool.execute({
      prompt: "a mountain",
      aspectRatio: "16:9",
    });

    const call = generateContent.mock.calls[0][0];
    const text = call.contents[0].parts[0].text;
    expect(text).toMatch(/16:9 aspect ratio/);
  });

  it("surfaces a blocked-content error when no image part is returned", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }],
    });
    const result = await imageGenerationTool.execute({
      prompt: "something unsafe",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/blocked \(SAFETY\)/);
  });

  it("surfaces model text explaining why no image was produced", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [
        { content: { parts: [{ text: "I cannot draw that." }] } },
      ],
    });
    const result = await imageGenerationTool.execute({
      prompt: "something odd",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("I cannot draw that.");
  });

  it("returns ok:false (never throws) when the API call rejects", async () => {
    generateContent.mockRejectedValueOnce(new Error("upstream boom"));
    const result = await imageGenerationTool.execute({ prompt: "a cat" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("upstream boom");
  });

  it("is disabled via the VANI_DISABLE_IMAGE_GEN kill switch", async () => {
    process.env.VANI_DISABLE_IMAGE_GEN = "true";
    const result = await imageGenerationTool.execute({ prompt: "a cat" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "The image generation service is temporarily unavailable."
    );
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("redirects to image_edit when a source image is present (never text-to-image)", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { mimeType: "image/png", data: "ZWRpdGVk" } },
            ],
          },
        },
      ],
    });

    const result = await imageGenerationTool.execute(
      { prompt: "remove car" },
      {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: "c291cmNl" } },
            ],
          },
        ],
      }
    );

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("Edit");
    expect(prepareMock).toHaveBeenCalled();
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts[0].inlineData).toEqual({
      mimeType: "image/jpeg",
      data: "cHJlcGFyZWQ=",
    });
    expect(parts[1].text).toContain("remove car");
    expect(parts[0].text).toBeUndefined();
  });
});
