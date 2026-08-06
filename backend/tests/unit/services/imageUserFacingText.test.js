import { describe, it, expect } from "vitest";
import {
  toUserFacingImageText,
  sanitizeAssistantDelta,
  IMAGE_EDIT_SUCCESS_CAPTION,
} from "../../../services/image/index.js";

describe("toUserFacingImageText", () => {
  it("strips Format/Dimensions metadata and Image N headers", () => {
    const raw = [
      "[Image 1: pool.jpg]",
      "Image metadata:",
      "- Format: JPEG",
      "- Dimensions: 1920×1080px",
      "- Size: 240 KB",
      "OCR extracted text:",
      "POOL RULES",
    ].join("\n");

    const out = toUserFacingImageText(raw);
    expect(out).toBe("POOL RULES");
    expect(out).not.toMatch(/Format:/i);
    expect(out).not.toMatch(/Dimensions:/i);
    expect(out).not.toMatch(/Image 1/i);
  });

  it("hides empty OCR placeholder blocks", () => {
    const raw = [
      "Image metadata:",
      "- Format: PNG",
      "- Dimensions: 100×100px",
      "OCR extracted text: [none detected]",
    ].join("\n");
    expect(toUserFacingImageText(raw)).toBe("");
  });
});

describe("sanitizeAssistantDelta", () => {
  it("strips OCR and image metadata from assistant text", () => {
    const raw = [
      "Sure, here is the analysis.",
      "[Image 1: photo.jpg]",
      "Image metadata:",
      "- Format: JPEG",
      "- Dimensions: 1920×1080px",
      "OCR extracted text:",
      "STOP SIGN AHEAD PLEASE YIELD",
      "",
      "Hope that helps.",
    ].join("\n");

    const out = sanitizeAssistantDelta(raw);
    expect(out).not.toMatch(/OCR extracted/i);
    expect(out).not.toMatch(/Image metadata/i);
    expect(out).not.toMatch(/Format:/i);
    expect(out).not.toMatch(/Dimensions:/i);
    expect(out).not.toMatch(/STOP SIGN/i);
    expect(out).toMatch(/Sure, here is the analysis/i);
  });

  it("strips long base64 dumps", () => {
    const b64 = "A".repeat(220);
    const out = sanitizeAssistantDelta(`Here you go:\n${b64}`);
    expect(out).not.toContain(b64);
    expect(out).toMatch(/Here you go/i);
  });

  it("preserves the fixed image-edit caption", () => {
    expect(sanitizeAssistantDelta(IMAGE_EDIT_SUCCESS_CAPTION)).toBe(
      IMAGE_EDIT_SUCCESS_CAPTION
    );
  });

  it("drops a pure OCR flood", () => {
    const flood = [
      "Image metadata:",
      "- Format: PNG",
      "- Dimensions: 4000×3000px",
      "OCR extracted text:",
      "x".repeat(5000),
    ].join("\n");
    expect(sanitizeAssistantDelta(flood)).toBe("");
  });
});
