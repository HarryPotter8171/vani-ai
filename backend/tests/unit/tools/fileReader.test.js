import { describe, it, expect } from "vitest";
import { fileReaderTool } from "../../../tools/implementations/fileReader.js";

describe("fileReaderTool", () => {
  it("errors when no attachments or extracted text exist", async () => {
    const result = await fileReaderTool.execute({}, { attachments: [], contents: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no attached files/i);
  });

  it("returns extracted text for an attachment", async () => {
    const result = await fileReaderTool.execute(
      {},
      { attachments: [{ name: "report.pdf", kind: "pdf", extractedText: "Quarterly results were strong." }] }
    );
    expect(result.ok).toBe(true);
    expect(result.content).toMatch(/Quarterly results/);
    expect(result.available).toHaveLength(1);
  });

  it("filters by filename when multiple attachments are present", async () => {
    const attachments = [
      { name: "a.txt", extractedText: "Content of A" },
      { name: "b.txt", extractedText: "Content of B" },
    ];
    const result = await fileReaderTool.execute({ filename: "b.txt" }, { attachments });
    expect(result.ok).toBe(true);
    expect(result.content).toContain("Content of B");
    expect(result.content).not.toContain("Content of A");
  });

  it("returns an error listing available files when filename doesn't match", async () => {
    const attachments = [{ name: "a.txt", extractedText: "Content of A" }];
    const result = await fileReaderTool.execute({ filename: "nope.txt" }, { attachments });
    expect(result.ok).toBe(false);
    expect(result.available).toHaveLength(1);
  });

  it("falls back to extracting file blocks from prior conversation contents", async () => {
    const contents = [
      {
        role: "user",
        parts: [{ text: "--- File: notes.txt (text) ---\nImportant meeting notes here." }],
      },
    ];
    const result = await fileReaderTool.execute({}, { attachments: [], contents });
    expect(result.ok).toBe(true);
    expect(result.content).toMatch(/Important meeting notes/);
  });

  it("truncates very long content", async () => {
    const longText = "x".repeat(70_000);
    const result = await fileReaderTool.execute(
      {},
      { attachments: [{ name: "big.txt", extractedText: longText }] }
    );
    expect(result.ok).toBe(true);
    expect(result.content.length).toBeLessThan(70_000);
    expect(result.content).toMatch(/Truncated|continue/i);
  });

  it("handles PDF attachments without extracted text honestly", async () => {
    const result = await fileReaderTool.execute(
      {},
      { attachments: [{ name: "doc.pdf", kind: "pdf" }] }
    );
    expect(result.ok).toBe(true);
    expect(result.content).toMatch(/could not be extracted|re-upload/i);
  });

  it("handles image attachments without OCR text", async () => {
    const result = await fileReaderTool.execute(
      {},
      { attachments: [{ name: "photo.png", kind: "image" }] }
    );
    expect(result.ok).toBe(true);
    expect(result.content).toMatch(/vision_analyze/);
  });
});
