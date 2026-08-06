import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../tools/index.js", () => ({
  getTool: () => ({ name: "ocr", displayName: "OCR" }),
  executeTool: vi.fn(),
}));

const { executeTool } = await import("../../../tools/index.js");
const {
  shouldForceOcr,
  hasOcrableInputs,
  runDirectOcr,
} = await import("../../../services/ocrPipeline.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocrPipeline", () => {
  const ctx = {
    attachments: [
      {
        kind: "image",
        mimeType: "image/png",
        name: "bill.png",
        fileId: "file-1",
        dataBase64: "abc",
      },
    ],
  };

  it("detects OCR-able inputs", () => {
    expect(hasOcrableInputs([], ctx)).toBe(true);
    expect(hasOcrableInputs([], {})).toBe(false);
  });

  it("forces OCR for product chat examples", () => {
    expect(shouldForceOcr("Read this image", [], ctx)).toBe(true);
    expect(shouldForceOcr("Summarize this PDF", [], ctx)).toBe(true);
    expect(shouldForceOcr("What is written in this bill?", [], ctx)).toBe(true);
  });

  it("does not force OCR for edit requests", () => {
    expect(shouldForceOcr("add a dog", [], ctx)).toBe(false);
    expect(shouldForceOcr("remove the background", [], ctx)).toBe(false);
  });

  it("runs OCR and returns model/response parts for the LLM loop", async () => {
    executeTool.mockResolvedValueOnce({
      ok: true,
      success: true,
      text: "Total: ₹500",
      pages: [{ page: 1, text: "Total: ₹500" }],
      language: "eng+hin",
      metadata: { source: "image" },
    });

    const runner = runDirectOcr({
      userMessage: "What is written in this bill?",
      contents: [],
      toolContext: ctx,
    });

    const events = [];
    let outcome;
    while (true) {
      const next = await runner.next();
      if (next.done) {
        outcome = next.value;
        break;
      }
      events.push(next.value);
    }

    expect(events.some((e) => e.type === "tool_start" && e.name === "ocr")).toBe(
      true
    );
    expect(events.some((e) => e.type === "tool_done" && e.ok)).toBe(true);
    expect(outcome.ok).toBe(true);
    expect(outcome.modelParts[0].functionCall.name).toBe("ocr");
    expect(outcome.responseParts[0].functionResponse.response.text).toMatch(
      /₹500/
    );
    expect(executeTool).toHaveBeenCalledWith(
      "ocr",
      expect.objectContaining({ fileId: "file-1" }),
      expect.any(Object)
    );
  });
});
