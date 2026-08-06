import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.fn();
const editImageApi = vi.fn();
const prepareMock = vi.fn();

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

const { generateImage, editImage, buildEditInstruction } = await import(
  "../../../services/geminiImageService.js"
);

beforeEach(() => {
  generateContent.mockReset();
  editImageApi.mockReset();
  prepareMock.mockReset();
});

describe("geminiImageService", () => {
  it("buildEditInstruction uses Google's preserve-composition local-edit frame", () => {
    const text = buildEditInstruction("remove car");
    expect(text).toMatch(/^Using the provided image,/);
    expect(text).toContain("remove car");
    expect(text).toMatch(/Keep everything else in the image exactly the same/);
    expect(text).toMatch(/Do not redraw/);

    const alreadyFramed =
      "Using the provided image, change only the sofa. Keep everything else the same.";
    expect(buildEditInstruction(alreadyFramed)).toBe(alreadyFramed);
  });

  it("generateImage sends text only — no source image parts", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: "image/png", data: "Z2Vu" } }],
          },
        },
      ],
    });
    const result = await generateImage({ prompt: "a red bicycle" });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("Generate");
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts.every((p) => !p.inlineData)).toBe(true);
    expect(editImageApi).not.toHaveBeenCalled();
  });

  it("editImage requires a source image and never calls generate or Imagen", async () => {
    const result = await editImage({ instruction: "make it blue", imageParts: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no images/i);
    expect(generateContent).not.toHaveBeenCalled();
    expect(editImageApi).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("editImage sends prepared inlineData + Edit-this-image text — never Imagen", async () => {
    prepareMock.mockResolvedValueOnce({
      mimeType: "image/jpeg",
      dataBase64: "cHJlcGFyZWQ=",
      width: 1200,
      height: 800,
      bytes: 1000,
    });
    generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: "image/png", data: "ZWRpdGVk" } }],
          },
        },
      ],
    });

    const result = await editImage({
      instruction: "remove car",
      imageParts: [
        { inlineData: { mimeType: "image/png", data: "c291cmNl" } },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("Edit");
    expect(result.model).toBe("gemini-2.5-flash-image");
    expect(result.imageBase64).toBe("ZWRpdGVk");
    expect(editImageApi).not.toHaveBeenCalled();
    expect(prepareMock).toHaveBeenCalledWith("c291cmNl", "image/png");
    expect(generateContent).toHaveBeenCalledTimes(1);

    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-2.5-flash-image");
    expect(call.config.responseModalities).toEqual(["TEXT", "IMAGE"]);
    const parts = call.contents[0].parts;
    expect(parts[0].inlineData).toEqual({
      mimeType: "image/jpeg",
      data: "cHJlcGFyZWQ=",
    });
    expect(parts[1].text).toMatch(/^Using the provided image,/);
    expect(parts[1].text).toContain("remove car");
    expect(parts[1].text).toMatch(/Keep everything else/);
  });
});
