import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../services/chatAttachmentService.js", () => ({
  attachmentFromUploadId: vi.fn(),
}));

vi.mock("../../../services/ocr/index.js", () => ({
  runOcr: vi.fn(),
  isOcrSupported: ({ filename = "", mimeType = "" } = {}) => {
    const name = String(filename).toLowerCase();
    const mime = String(mimeType).toLowerCase();
    return (
      /\.(jpe?g|png|webp|pdf)$/i.test(name) ||
      mime === "image/jpeg" ||
      mime === "image/jpg" ||
      mime === "image/png" ||
      mime === "image/webp" ||
      mime === "application/pdf"
    );
  },
}));

vi.mock("../../../services/ocrToolIntent.js", async () => {
  const actual = await vi.importActual("../../../services/ocrToolIntent.js");
  return {
    ...actual,
    ocrUnavailableMessage: () => "The OCR service is temporarily unavailable.",
  };
});

const { runOcr } = await import("../../../services/ocr/index.js");
const { ocrTool } = await import("../../../tools/implementations/ocr.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocrTool", () => {
  it("exposes the ocr tool contract", () => {
    expect(ocrTool.name).toBe("ocr");
    expect(ocrTool.id).toBe("ocr");
    expect(ocrTool.schema).toBeTruthy();
  });

  it("errors when no image/PDF is available", async () => {
    const result = await ocrTool.execute({}, { contents: [], attachments: [] });
    expect(result.ok).toBe(false);
    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(result.pages).toEqual([]);
    expect(result.error).toMatch(/no ocr-compatible/i);
    expect(runOcr).not.toHaveBeenCalled();
  });

  it("returns the production API shape on success", async () => {
    runOcr.mockResolvedValueOnce({
      success: true,
      text: "Hello VANI",
      pages: [{ page: 1, text: "Hello VANI", confidence: 90, tables: [] }],
      language: "eng+hin",
      metadata: { source: "image", pageCount: 1 },
    });

    const result = await ocrTool.execute(
      {},
      {
        contents: [],
        attachments: [
          {
            kind: "image",
            name: "bill.png",
            mimeType: "image/png",
            dataBase64: Buffer.from("fake-png").toString("base64"),
          },
        ],
      }
    );

    expect(result.success).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("Hello VANI");
    expect(result.pages).toHaveLength(1);
    expect(result.language).toBe("eng+hin");
    expect(result.metadata).toMatchObject({ source: "image" });
    expect(runOcr).toHaveBeenCalledOnce();
  });

  it("OCRs a PDF attachment", async () => {
    runOcr.mockResolvedValueOnce({
      success: true,
      text: "Invoice total 1200",
      pages: [{ page: 1, text: "Invoice total 1200" }],
      language: "eng+hin",
      metadata: { source: "pdf", pageCount: 1 },
    });

    const result = await ocrTool.execute(
      { focus: "Summarize this PDF" },
      {
        attachments: [
          {
            kind: "pdf",
            name: "scan.pdf",
            mimeType: "application/pdf",
            dataBase64: Buffer.from("%PDF-1.4").toString("base64"),
          },
        ],
      }
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Invoice/);
    expect(result.metadata.focus).toMatch(/Summarize/i);
  });

  it("rejects unsupported formats", async () => {
    const result = await ocrTool.execute(
      {},
      {
        attachments: [
          {
            kind: "image",
            name: "photo.gif",
            mimeType: "image/gif",
            dataBase64: Buffer.from("gif").toString("base64"),
          },
        ],
      }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported|no ocr-compatible/i);
  });

  it("propagates OCR engine failures with the API shape", async () => {
    runOcr.mockResolvedValueOnce({
      success: false,
      text: "",
      pages: [],
      language: "eng+hin",
      metadata: {},
      error: "OCR failed: worker down",
    });

    const result = await ocrTool.execute(
      {},
      {
        attachments: [
          {
            kind: "image",
            name: "a.jpg",
            mimeType: "image/jpeg",
            dataBase64: Buffer.from("jpg").toString("base64"),
          },
        ],
      }
    );

    expect(result.ok).toBe(false);
    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.error).toMatch(/worker down/i);
  });
});
