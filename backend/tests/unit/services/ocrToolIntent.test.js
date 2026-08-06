import { describe, it, expect } from "vitest";
import {
  detectOcrToolIntent,
  hasOcrIntent,
  normalizeOcrToolFailure,
  pickLatestOcrFileId,
  ocrUnavailableMessage,
} from "../../../services/ocrToolIntent.js";

describe("ocrToolIntent", () => {
  it("detects read / extract / bill intents", () => {
    expect(hasOcrIntent("Read this image")).toBe(true);
    expect(hasOcrIntent("What is written in this bill?")).toBe(true);
    expect(hasOcrIntent("Extract text from this photo")).toBe(true);
    expect(hasOcrIntent("OCR this PDF")).toBe(true);
    expect(hasOcrIntent("Transcribe the handwriting")).toBe(true);
  });

  it("detects summarize-PDF intents", () => {
    expect(hasOcrIntent("Summarize this PDF")).toBe(true);
    expect(hasOcrIntent("Give me a summary of this document")).toBe(true);
  });

  it("detects Hinglish OCR asks", () => {
    expect(hasOcrIntent("Isme kya likha hai")).toBe(true);
    expect(hasOcrIntent("Padho ye image")).toBe(true);
  });

  it("forces ocr when an attachment is present", () => {
    expect(detectOcrToolIntent("Read this image", { hasOcrable: true })).toEqual(
      { tool: "ocr", mode: "force" }
    );
    expect(
      detectOcrToolIntent("Summarize this PDF", { hasOcrable: true })
    ).toEqual({ tool: "ocr", mode: "force" });
    expect(
      detectOcrToolIntent("What is written in this bill?", { hasOcrable: true })
    ).toEqual({ tool: "ocr", mode: "force" });
  });

  it("forces ocr for explicit phrasing even without hasOcrable flag", () => {
    expect(detectOcrToolIntent("Read this image")).toEqual({
      tool: "ocr",
      mode: "force",
    });
    expect(detectOcrToolIntent("extract text")).toEqual({
      tool: "ocr",
      mode: "force",
    });
  });

  it("does not force ocr for unrelated chat", () => {
    expect(detectOcrToolIntent("What is the capital of France?")).toBeNull();
    expect(detectOcrToolIntent("add a dog", { hasOcrable: true })).toBeNull();
  });

  it("normalizes failures", () => {
    const input = normalizeOcrToolFailure({
      ok: false,
      error: "No OCR-compatible image",
    });
    expect(input.error).toMatch(/No OCR/i);

    const down = normalizeOcrToolFailure({ ok: false, error: "worker boom" });
    expect(down.error).toBe(ocrUnavailableMessage());
  });

  it("picks the latest OCR-able fileId", () => {
    expect(
      pickLatestOcrFileId({
        attachments: [
          { kind: "image", mimeType: "image/png", fileId: "img-1" },
          { kind: "pdf", mimeType: "application/pdf", fileId: "pdf-2" },
        ],
      })
    ).toBe("pdf-2");
  });
});
