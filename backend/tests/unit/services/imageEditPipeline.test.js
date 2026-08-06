import { describe, it, expect, vi, beforeEach } from "vitest";

const executeTool = vi.fn();
vi.mock("../../../tools/index.js", () => ({
  executeTool: (...args) => executeTool(...args),
  getTool: () => ({ name: "image_edit", displayName: "✏️ Editing image" }),
}));

const {
  shouldForceImageEdit,
  hasEditableImages,
  runDirectImageEdit,
} = await import("../../../services/imageEditPipeline.js");
const { IMAGE_EDIT_SUCCESS_CAPTION } = await import(
  "../../../services/image/index.js"
);

describe("imageEditPipeline", () => {
  beforeEach(() => {
    executeTool.mockReset();
  });

  it("detects editable images from fileId-only attachments", () => {
    expect(
      hasEditableImages([], {
        attachments: [{ kind: "image", fileId: "abc" }],
      })
    ).toBe(true);
  });

  it("forces edit for add/remove/replace with an uploaded image", () => {
    const ctx = { attachments: [{ kind: "image", fileId: "abc" }] };
    expect(shouldForceImageEdit("add a dog", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("remove the background", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("replace the sky", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("change shirt color", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("edit this image", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("remove car", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("remove one person", [], ctx)).toBe(true);
  });

  it("forces edit for Hinglish + latest upload (bytes must not go to generate)", () => {
    const ctx = {
      attachments: [{ kind: "image", fileId: "abc", mimeType: "image/jpeg" }],
    };
    expect(shouldForceImageEdit("Is photo me snowfall kar do", [], ctx)).toBe(
      true
    );
    expect(shouldForceImageEdit("Sirf pool ka pani red kar do", [], ctx)).toBe(
      true
    );
  });

  it("forces edit for verification phrases with latest upload", () => {
    const ctx = { attachments: [{ kind: "image", fileId: "abc" }] };
    expect(shouldForceImageEdit("make pool water red", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("add snowfall", [], ctx)).toBe(true);
    expect(shouldForceImageEdit("add a dog", [], ctx)).toBe(true);
  });

  it("does not force edit without images for unrelated text", () => {
    expect(shouldForceImageEdit("hello there", [], {})).toBe(false);
  });

  it("does not force edit for OCR / read intents", () => {
    const ctx = { attachments: [{ kind: "image", fileId: "abc" }] };
    expect(shouldForceImageEdit("Read this image", [], ctx)).toBe(false);
    expect(shouldForceImageEdit("What is written in this bill?", [], ctx)).toBe(
      false
    );
    expect(shouldForceImageEdit("Summarize this PDF", [], ctx)).toBe(false);
  });

  it("does not force edit for vision-only questions with an upload", () => {
    const ctx = { attachments: [{ kind: "image", fileId: "abc" }] };
    expect(shouldForceImageEdit("Explain this", [], ctx)).toBe(false);
    expect(shouldForceImageEdit("What is this?", [], ctx)).toBe(false);
    expect(shouldForceImageEdit("Describe", [], ctx)).toBe(false);
    expect(shouldForceImageEdit("Describe this photo", [], ctx)).toBe(false);
  });

  it("does not force edit for a plain message with an upload (default is vision)", () => {
    const ctx = { attachments: [{ kind: "image", fileId: "abc" }] };
    expect(shouldForceImageEdit("hello there", [], ctx)).toBe(false);
  });

  it("streams fixed caption + edited image — never OCR or Editing status delta", async () => {
    executeTool.mockResolvedValueOnce({
      ok: true,
      success: true,
      instruction: "remove car",
      mimeType: "image/png",
      fileId: "gen-1",
      imageUrl: "/api/files/gen-1/content",
      size: 12,
    });

    const events = [];
    const runner = runDirectImageEdit({
      userMessage: "remove car",
      contents: [],
      toolContext: {
        attachments: [{ kind: "image", fileId: "img-1", mimeType: "image/png" }],
        userId: "user-1",
      },
    });

    let outcome;
    while (true) {
      const next = await runner.next();
      if (next.done) {
        outcome = next.value;
        break;
      }
      events.push(next.value);
    }

    expect(
      events.some(
        (e) => e.type === "tool_start" && e.displayName === "✏️ Editing image"
      )
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === "image" &&
          e.fileId === "gen-1" &&
          e.imageUrl === "/api/files/gen-1/content" &&
          !e.dataBase64
      )
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === "delta" &&
          e.text === IMAGE_EDIT_SUCCESS_CAPTION &&
          e.replace === true
      )
    ).toBe(true);
    expect(
      events.every(
        (e) =>
          e.type !== "delta" ||
          (!/OCR|Format:|Dimensions:|Editing image\.\.\./i.test(String(e.text)) &&
            e.text === IMAGE_EDIT_SUCCESS_CAPTION)
      )
    ).toBe(true);
    expect(executeTool).toHaveBeenCalledWith(
      "image_edit",
      expect.objectContaining({
        instruction: "remove car",
        imageFileId: "img-1",
      }),
      expect.any(Object)
    );
    expect(outcome.ok).toBe(true);
  });

  it("returns the editing unavailable message on failure without inventing capability refusals", async () => {
    executeTool.mockResolvedValueOnce({
      ok: false,
      error: "upstream boom",
    });

    const events = [];
    const runner = runDirectImageEdit({
      userMessage: "remove the background",
      contents: [],
      toolContext: {
        attachments: [{ kind: "image", fileId: "img-1" }],
      },
    });

    let outcome;
    while (true) {
      const next = await runner.next();
      if (next.done) {
        outcome = next.value;
        break;
      }
      events.push(next.value);
    }

    expect(outcome.ok).toBe(false);
    expect(
      events.some(
        (e) =>
          e.type === "delta" &&
          String(e.text).includes(
            "The image editing service is temporarily unavailable."
          )
      )
    ).toBe(true);
    expect(
      events.every(
        (e) =>
          e.type !== "delta" ||
          !/cannot edit|generate a new image instead/i.test(String(e.text))
      )
    ).toBe(true);
  });
});
