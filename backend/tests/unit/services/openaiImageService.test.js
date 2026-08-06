import { beforeEach, describe, expect, it, vi } from "vitest";

const imagesEditMock = vi.fn();
const toFileMock = vi.fn();
const prepareMock = vi.fn();

vi.mock("../../../services/openaiClient.js", () => ({
  OPENAI_IMAGE_MODEL: "gpt-image-1",
  getOpenAIClient: () => ({
    images: { edit: (...args) => imagesEditMock(...args) },
  }),
}));

vi.mock("openai/uploads", () => ({
  toFile: (...args) => toFileMock(...args),
}));

vi.mock("../../../services/image/prepareEditSource.js", () => ({
  prepareEditSourceImage: (...args) => prepareMock(...args),
}));

const {
  editImage,
  buildOpenAIEditPrompt,
  pickEditSize,
  decodeOpenAIImagePayload,
  extractEditedImageBuffer,
} = await import("../../../services/openaiImageService.js");

// Minimal valid 1x1 PNG
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_B64 = PNG_BUFFER.toString("base64");

describe("openaiImageService helpers", () => {
  it("builds a preservation-first edit prompt", () => {
    const prompt = buildOpenAIEditPrompt("remove only the white car");
    expect(prompt).toContain("remove only the white car");
    expect(prompt).toMatch(/preserve identity/i);
    expect(prompt).toMatch(/do not regenerate/i);
  });

  it("picks the closest gpt-image-1 size for the source aspect ratio", () => {
    expect(pickEditSize(1920, 1080)).toBe("1536x1024");
    expect(pickEditSize(1080, 1920)).toBe("1024x1536");
    expect(pickEditSize(1200, 1200)).toBe("1024x1024");
    expect(pickEditSize(0, 0)).toBe("auto");
  });

  it("decodes b64_json to Buffer and never utf8-decodes PNG magic", () => {
    const fromB64 = decodeOpenAIImagePayload(PNG_B64);
    expect(Buffer.isBuffer(fromB64)).toBe(true);
    expect(fromB64[0]).toBe(0x89);
    expect(fromB64[1]).toBe(0x50); // P
    expect(fromB64[2]).toBe(0x4e); // N
    expect(fromB64[3]).toBe(0x47); // G

    // Raw PNG bytes wrongly cast to a JS string must recover via latin1.
    const asBinaryString = PNG_BUFFER.toString("latin1");
    const recovered = decodeOpenAIImagePayload(asBinaryString);
    expect(Buffer.isBuffer(recovered)).toBe(true);
    expect(recovered.equals(PNG_BUFFER)).toBe(true);
  });

  it("extracts edited image from Images API response as Buffer", () => {
    const extracted = extractEditedImageBuffer({
      data: [{ b64_json: PNG_B64 }],
    });
    expect(extracted.mimeType).toBe("image/png");
    expect(Buffer.isBuffer(extracted.buffer)).toBe(true);
    expect(extracted.buffer[0]).toBe(0x89);
  });
});

describe("openaiImageService.editImage", () => {
  beforeEach(() => {
    imagesEditMock.mockReset();
    toFileMock.mockReset();
    prepareMock.mockReset();

    prepareMock.mockResolvedValue({
      mimeType: "image/png",
      dataBase64: PNG_B64,
      width: 400,
      height: 300,
      bytes: PNG_BUFFER.length,
    });
    toFileMock.mockResolvedValue({ name: "source.png" });
  });

  it("returns validation error for empty instruction", async () => {
    const result = await editImage({ instruction: " ", imageParts: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/instruction is required/i);
  });

  it("calls OpenAI images.edit and returns clean base64 only (never utf8 PNG)", async () => {
    imagesEditMock.mockResolvedValueOnce({
      data: [{ b64_json: PNG_B64 }],
    });

    const result = await editImage({
      instruction: "remove one person",
      imageParts: [
        { inlineData: { mimeType: "image/png", data: PNG_B64 } },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.mimeType).toBe("image/png");
    expect(typeof result.imageBase64).toBe("string");
    expect(result.imageBase64.startsWith("iVBOR")).toBe(true);
    // Must NOT be a utf8/binary PNG string starting with the PNG magic as text.
    expect(result.imageBase64.charCodeAt(0)).not.toBe(0x89);
    expect(imagesEditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-1",
        quality: "high",
        input_fidelity: "high",
        prompt: expect.stringMatching(/remove one person/i),
      })
    );
  });

  it("sanitizes upstream OpenAI exceptions", async () => {
    imagesEditMock.mockRejectedValueOnce(new Error("raw SDK error"));

    const result = await editImage({
      instruction: "replace sky only",
      imageParts: [
        { inlineData: { mimeType: "image/png", data: PNG_B64 } },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Image edit failed.");
  });
});
