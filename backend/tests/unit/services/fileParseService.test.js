import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../services/documentUnderstanding/extractors/pdf.js", () => ({
  understandPdf: vi.fn(async () => ({ text: "" })),
}));

vi.mock("../../../services/parsers/index.js", async () => {
  const actual = await vi.importActual("../../../services/parsers/index.js");
  return {
    ...actual,
    parseBuffer: vi.fn(async (_buffer, meta = {}) => {
      if (meta.filename?.includes("empty")) {
        return { format: "pdf", text: "" };
      }
      return {
        format: "pdf",
        text: "Question 1: What is 2+2?\nAnswer space.\nQuestion 2: Explain gravity.",
      };
    }),
  };
});

const { parseAttachment, buildMessageParts, messagesToGeminiContents, isWholePaperSolveCommand } =
  await import("../../../services/fileParseService.js");
const { understandPdf } = await import(
  "../../../services/documentUnderstanding/extractors/pdf.js"
);
const { parseBuffer } = await import("../../../services/parsers/index.js");

describe("fileParseService PDF routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects extracted PDF text into the model prompt instead of metadata-only", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 fake content for test").toString("base64");
    const { parts, persistedAttachments } = await buildMessageParts({
      role: "user",
      content: "solve this",
      attachments: [
        {
          name: "paper.pdf",
          kind: "pdf",
          mimeType: "application/pdf",
          dataBase64: pdfBytes,
        },
      ],
    });

    const textPart = parts.find((p) => typeof p.text === "string");
    expect(textPart?.text).toMatch(/--- File: paper\.pdf \(pdf\) ---/);
    expect(textPart?.text).toMatch(/Question 1: What is 2\+2\?/);
    expect(textPart?.text).toMatch(/solve this/i);
    expect(textPart?.text).not.toMatch(/^\[Attached pdf:/);
    expect(textPart?.text).toMatch(/referring to the attached document/i);

    // Useful text → no binary PDF inline (providers strip those to metadata).
    expect(parts.some((p) => p.inlineData?.mimeType === "application/pdf")).toBe(
      false
    );

    expect(persistedAttachments[0].extractedText).toMatch(/Question 1/);
    expect(parseBuffer).toHaveBeenCalled();
  });

  it("injects whole-paper sequential-solve policy for full-exam requests", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 fake").toString("base64");
    const { parts } = await buildMessageParts({
      role: "user",
      content: "solve the whole paper",
      attachments: [
        {
          name: "exam.pdf",
          kind: "pdf",
          mimeType: "application/pdf",
          dataBase64: pdfBytes,
        },
      ],
    });

    const textPart = parts.find((p) => typeof p.text === "string");
    expect(textPart?.text).toMatch(/ENTIRE uploaded exam\/paper/i);
    expect(textPart?.text).toMatch(/FORBIDDEN replies/i);
    expect(textPart?.text).toMatch(/I'll solve the paper sequentially/i);
  });

  it("reuses client-provided extractedText without re-parsing when already rich", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4").toString("base64");
    const existing =
      "Full exam paper text already extracted on upload. Solve every question carefully.";

    const parsed = await parseAttachment({
      name: "exam.pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      dataBase64: pdfBytes,
      extractedText: existing,
    });

    expect(parsed.text).toContain("Full exam paper text");
    expect(parsed.inlinePart).toBeNull();
    expect(parseBuffer).not.toHaveBeenCalled();
    expect(understandPdf).not.toHaveBeenCalled();
  });

  it("chunks oversized extracted documents and persists full text for later turns", async () => {
    const longBody = `Q1 start\n${"x".repeat(90_000)}\nQ99 end`;
    const pdfBytes = Buffer.from("%PDF-1.4").toString("base64");

    const { parts, persistedAttachments } = await buildMessageParts({
      role: "user",
      content: "pura paper solve kro",
      attachments: [
        {
          name: "huge.pdf",
          kind: "pdf",
          mimeType: "application/pdf",
          dataBase64: pdfBytes,
          extractedText: longBody,
        },
      ],
    });

    const textPart = parts.find((p) => typeof p.text === "string");
    expect(textPart?.text).toMatch(/part 1 of extracted text/);
    expect(textPart?.text).toMatch(/Document continues/);
    expect(textPart?.text).toMatch(/file_reader/i);
    expect(textPart?.text).toMatch(/Do not ask the user to continue/i);
    expect(textPart?.text.length).toBeLessThan(longBody.length);
    expect(persistedAttachments[0].extractedText.length).toBeGreaterThan(80_000);
  });

  it("injects whole-paper hint on follow-up turns that reuse prior document context", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 fake").toString("base64");
    const { contents } = await messagesToGeminiContents([
      {
        role: "user",
        content: "solve question 1",
        attachments: [
          {
            name: "exam.pdf",
            kind: "pdf",
            mimeType: "application/pdf",
            dataBase64: pdfBytes,
            extractedText: "Q1. 2+2=?\nQ2. Capital of France?",
          },
        ],
      },
      {
        role: "assistant",
        content: "Question 1: 4",
      },
      {
        role: "user",
        content: "give all correct options",
      },
    ]);

    const lastUser = contents[contents.length - 1];
    const text = lastUser.parts.map((p) => p.text || "").join("\n");
    expect(text).toMatch(/give all correct options/i);
    expect(text).toMatch(/ENTIRE uploaded exam\/paper/i);
    expect(text).toMatch(/FORBIDDEN replies/i);
  });
});

describe("isWholePaperSolveCommand", () => {
  it("matches full-paper / exam completion phrases", () => {
    expect(isWholePaperSolveCommand("solve the whole paper")).toBe(true);
    expect(isWholePaperSolveCommand("give all correct options")).toBe(true);
    expect(isWholePaperSolveCommand("complete this exam")).toBe(true);
    expect(isWholePaperSolveCommand("solve everything")).toBe(true);
    expect(isWholePaperSolveCommand("pura paper solve kro")).toBe(true);
    expect(isWholePaperSolveCommand("what is 2+2?")).toBe(false);
  });
});
