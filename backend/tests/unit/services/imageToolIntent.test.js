import { describe, it, expect } from "vitest";
import {
  detectImageToolIntent,
  normalizeImageToolFailure,
  imageEditUnavailableMessage,
  imageGenerationUnavailableMessage,
  isVisionOnlyQuestion,
  pickLatestImageFileId,
} from "../../../services/imageToolIntent.js";

describe("detectImageToolIntent", () => {
  it("forces image_generation for generate-an-image requests", () => {
    expect(detectImageToolIntent("Generate an image of a cat")).toEqual({
      tool: "image_generation",
      mode: "force",
    });
    expect(detectImageToolIntent("Draw me a picture of mountains")).toEqual({
      tool: "image_generation",
      mode: "force",
    });
    expect(detectImageToolIntent("create a logo for my startup")).toEqual({
      tool: "image_generation",
      mode: "force",
    });
  });

  it("forces image_edit for common edit intents when an image is attached", () => {
    const cases = [
      "add a dog",
      "remove the background",
      "replace the sky",
      "change shirt color",
      "remove this object",
      "edit this image",
      "erase the watermark",
      "put a hat on him",
      "insert a tree on the left",
      "expand the canvas",
      "uncrop this",
      "inpaint the hole",
      "outpaint to the right",
      "make it darker",
      "transform into watercolor",
      "modify the lighting",
    ];
    for (const msg of cases) {
      expect(
        detectImageToolIntent(msg, { hasImages: true }),
        msg
      ).toEqual({ tool: "image_edit", mode: "force" });
    }
  });

  it("forces image_edit for background/sky edits even without hasImages flag", () => {
    expect(detectImageToolIntent("remove the background")).toEqual({
      tool: "image_edit",
      mode: "force",
    });
    expect(detectImageToolIntent("replace the sky")).toEqual({
      tool: "image_edit",
      mode: "force",
    });
    expect(detectImageToolIntent("edit this image")).toEqual({
      tool: "image_edit",
      mode: "force",
    });
  });

  it("forces image_edit for Hinglish edit requests when an image is attached", () => {
    const cases = [
      "Is photo me snowfall kar do",
      "Sirf pool ka pani red kar do",
      "is image me dog add kar do",
      "background hata do kar de",
    ];
    for (const msg of cases) {
      expect(
        detectImageToolIntent(msg, { hasImages: true }),
        msg
      ).toEqual({ tool: "image_edit", mode: "force" });
    }
  });

  it("forces image_edit for the three product verification phrases", () => {
    for (const msg of [
      "make pool water red",
      "add snowfall",
      "add a dog",
      "remove car",
      "change only pool water to red",
      "remove person",
      "change shirt color",
    ]) {
      expect(detectImageToolIntent(msg, { hasImages: true })).toEqual({
        tool: "image_edit",
        mode: "force",
      });
      expect(detectImageToolIntent(msg, { hasImages: false })?.tool).not.toBe(
        "image_edit"
      );
    }
  });

  it("never forces image_generation when an image is attached", () => {
    expect(
      detectImageToolIntent("generate an image of a sunset", {
        hasImages: true,
      })
    ).toBeNull();
    expect(
      detectImageToolIntent("Draw me a picture of mountains", {
        hasImages: true,
      })
    ).toBeNull();
  });

  it("routes vision questions to neither generate nor edit when an image is attached", () => {
    for (const msg of [
      "Explain this",
      "What is this?",
      "Describe",
      "Describe this image",
      "What is this photo?",
      "Tell me about this",
      "Analyze this picture",
    ]) {
      expect(detectImageToolIntent(msg, { hasImages: true }), msg).toBeNull();
      expect(isVisionOnlyQuestion(msg), msg).toBe(true);
    }
  });

  it("does not treat generate requests as vision-only", () => {
    expect(isVisionOnlyQuestion("Generate an image of a cat?")).toBe(false);
    expect(detectImageToolIntent("Generate an image of a cat?")).toEqual({
      tool: "image_generation",
      mode: "force",
    });
  });

  it("does not force image_edit for bare 'edit this' without images", () => {
    expect(detectImageToolIntent("Edit this", { hasImages: false })).toBeNull();
  });

  it("does not force tools for unrelated prompts", () => {
    expect(detectImageToolIntent("What is the capital of France?")).toBeNull();
    expect(detectImageToolIntent("Summarize this PDF")).toBeNull();
  });
});

describe("normalizeImageToolFailure", () => {
  it("uses edit-specific unavailable copy for image_edit", () => {
    const out = normalizeImageToolFailure(
      { ok: false, error: "upstream boom" },
      "image_edit"
    );
    expect(out.error).toBe(imageEditUnavailableMessage());
    expect(out.note).toMatch(/Do NOT say you cannot edit/i);
    expect(out.note).toMatch(/generate a new image instead/i);
  });

  it("uses generation unavailable copy for image_generation", () => {
    const out = normalizeImageToolFailure(
      { ok: false, error: "upstream boom" },
      "image_generation"
    );
    expect(out.error).toBe(imageGenerationUnavailableMessage());
  });
});

describe("pickLatestImageFileId", () => {
  it("returns the latest image file id from conversation attachments", () => {
    expect(
      pickLatestImageFileId({
        attachments: [],
        conversationAttachments: [
          { kind: "image", fileId: "img-1" },
          { kind: "image", fileId: "img-2" },
        ],
      })
    ).toBe("img-2");
  });
});
