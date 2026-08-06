import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateContent = vi.fn();
const editImageApi = vi.fn();
const editOpenAIImage = vi.fn();
const prepareMock = vi.fn();
const storeGeneratedImage = vi.fn();

vi.mock("../../../services/geminiClient.js", () => ({
  IMAGE_MODEL: "gemini-2.5-flash-image",
  IMAGE_EDIT_MODEL: "gemini-2.5-flash-image",
  getGeminiClient: () => ({
    models: { generateContent, editImage: editImageApi },
  }),
}));

vi.mock("@google/genai", () => ({
  Modality: { TEXT: "TEXT", IMAGE: "IMAGE" },
}));

vi.mock("../../../services/image/prepareEditSource.js", () => ({
  prepareEditSourceImage: (...args) => prepareMock(...args),
}));

vi.mock("../../../services/openaiImageService.js", () => ({
  editImage: (...args) => editOpenAIImage(...args),
}));

vi.mock("../../../services/fileService.js", () => ({
  storeGeneratedImage: (...args) => storeGeneratedImage(...args),
}));

const { imageEditTool } = await import("../../../tools/implementations/imageEdit.js");

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ctx = {
  contents: [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "image/png",
            data: "c291cmNlLWltYWdl",
          },
        },
      ],
    },
  ],
};

beforeEach(() => {
  generateContent.mockReset();
  editImageApi.mockReset();
  prepareMock.mockReset();
  storeGeneratedImage.mockReset();
  prepareMock.mockResolvedValue({
    mimeType: "image/jpeg",
    dataBase64: "cHJlcGFyZWQ=",
    width: 1024,
    height: 768,
    bytes: 900,
  });
  delete process.env.VANI_DISABLE_IMAGE_GEN;
  delete process.env.IMAGE_PROVIDER;
  editOpenAIImage.mockReset();
});

afterEach(() => {
  delete process.env.VANI_DISABLE_IMAGE_GEN;
  delete process.env.IMAGE_PROVIDER;
});

describe("imageEditTool", () => {
  it("exposes the expected tool metadata", () => {
    expect(imageEditTool.name).toBe("image_edit");
    expect(imageEditTool.displayName).toMatch(/Editing image/i);
    expect(imageEditTool.schema.required).toContain("instruction");
  });

  it("rejects an empty instruction", async () => {
    const result = await imageEditTool.execute({ instruction: "  " }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/instruction is required/i);
  });

  it("requires a source image", async () => {
    const result = await imageEditTool.execute(
      { instruction: "make it blue" },
      { contents: [], attachments: [] }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no images/i);
  });

  it("edits via generateContent with source inlineData — never Imagen or generateImage path", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "ZmFrZS1lZGl0ZWQtaW1hZ2U=",
                },
              },
            ],
          },
        },
      ],
    });

    const result = await imageEditTool.execute(
      { instruction: "remove car" },
      ctx
    );

    expect(result.ok).toBe(true);
    expect(result.imageBase64).toBe("ZmFrZS1lZGl0ZWQtaW1hZ2U=");
    expect(result.mode).toBe("Edit");
    expect(editImageApi).not.toHaveBeenCalled();
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash-image",
        config: expect.objectContaining({
          responseModalities: ["TEXT", "IMAGE"],
        }),
      })
    );
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts[0].inlineData.data).toBe("cHJlcGFyZWQ=");
    expect(parts[1].text).toMatch(/^Using the provided image,/);
    expect(parts[1].text).toContain("remove car");
  });

  it("uses the editing unavailable message when kill-switched", async () => {
    process.env.VANI_DISABLE_IMAGE_GEN = "true";
    const result = await imageEditTool.execute(
      { instruction: "make it blue" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "The image editing service is temporarily unavailable."
    );
    expect(generateContent).not.toHaveBeenCalled();
    expect(editImageApi).not.toHaveBeenCalled();
    expect(editOpenAIImage).not.toHaveBeenCalled();
  });

  it("routes image_edit to OpenAI when IMAGE_PROVIDER=openai", async () => {
    process.env.IMAGE_PROVIDER = "openai";
    editOpenAIImage.mockResolvedValueOnce({
      ok: true,
      success: true,
      instruction: "replace sky",
      mimeType: "image/png",
      imageBase64: "b3BlbmFpLWVkaXQ=",
      mode: "Edit",
      model: "gpt-image-1",
    });

    const result = await imageEditTool.execute({ instruction: "replace sky" }, ctx);

    expect(result.ok).toBe(true);
    expect(result.imageBase64 || result.imageUrl).toBeTruthy();
    expect(editOpenAIImage).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "replace sky",
        imageParts: expect.any(Array),
      })
    );
    expect(generateContent).not.toHaveBeenCalled();
    expect(editImageApi).not.toHaveBeenCalled();
  });

  it("OpenAI path with userId returns imageUrl and omits imageBase64", async () => {
    process.env.IMAGE_PROVIDER = "openai";
    editOpenAIImage.mockResolvedValueOnce({
      ok: true,
      success: true,
      instruction: "replace sky",
      mimeType: "image/png",
      imageBase64: PNG_B64,
      mode: "Edit",
      model: "gpt-image-1",
    });
    storeGeneratedImage.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      size: 68,
      filename: "edited-image.png",
      mimeType: "image/png",
    });

    const result = await imageEditTool.execute(
      { instruction: "replace sky" },
      { ...ctx, userId: "507f1f77bcf86cd799439011" }
    );

    expect(result.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.fileId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.imageUrl).toBe(
      "/api/files/11111111-1111-4111-8111-111111111111/content"
    );
    expect(result.imageBase64).toBeUndefined();
    expect(storeGeneratedImage).toHaveBeenCalled();
  });

  it("Gemini path with userId persists and omits imageBase64", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: PNG_B64,
                },
              },
            ],
          },
        },
      ],
    });
    storeGeneratedImage.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      size: 68,
      filename: "edited-image.png",
      mimeType: "image/png",
    });

    const result = await imageEditTool.execute(
      { instruction: "remove car" },
      { ...ctx, userId: "507f1f77bcf86cd799439011" }
    );

    expect(result.ok).toBe(true);
    expect(result.fileId).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.imageUrl).toBe(
      "/api/files/22222222-2222-4222-8222-222222222222/content"
    );
    expect(result.imageBase64).toBeUndefined();
    expect(storeGeneratedImage).toHaveBeenCalled();
    expect(editOpenAIImage).not.toHaveBeenCalled();
  });
});
