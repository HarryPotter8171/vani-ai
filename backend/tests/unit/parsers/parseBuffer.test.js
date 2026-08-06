import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import {
  parseBuffer,
  detectFormat,
  getParser,
  SUPPORTED_FORMATS,
  UnsupportedFormatError,
} from "../../../services/parsers/index.js";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures");
const load = (name) => readFile(path.join(FIXTURES, name));

describe("services/parsers", () => {
  describe("detectFormat", () => {
    it("detects format from extension", () => {
      expect(detectFormat({ filename: "report.pdf" })).toBe("pdf");
      expect(detectFormat({ filename: "notes.md" })).toBe("markdown");
      expect(detectFormat({ filename: "data.CSV" })).toBe("csv");
      expect(detectFormat({ filename: "book.xlsx" })).toBe("xlsx");
      expect(detectFormat({ filename: "legacy.xls" })).toBe("xlsx");
      expect(detectFormat({ filename: "doc.docx" })).toBe("docx");
    });

    it("falls back to MIME type when extension is unknown", () => {
      expect(detectFormat({ filename: "file", mimeType: "application/pdf" })).toBe("pdf");
      expect(detectFormat({ mimeType: "text/csv" })).toBe("csv");
    });

    it("extension wins over a conflicting MIME type", () => {
      expect(detectFormat({ filename: "notes.md", mimeType: "application/pdf" })).toBe("markdown");
    });

    it("returns null for unrecognized input", () => {
      expect(detectFormat({ filename: "archive.zip" })).toBeNull();
      expect(detectFormat({})).toBeNull();
    });
  });

  describe("getParser / SUPPORTED_FORMATS", () => {
    it("exposes exactly the six supported formats", () => {
      expect(SUPPORTED_FORMATS).toEqual(
        expect.arrayContaining(["pdf", "docx", "txt", "markdown", "csv", "xlsx"])
      );
      expect(SUPPORTED_FORMATS.length).toBe(6);
    });

    it("returns null for an unknown format", () => {
      expect(getParser("exe")).toBeNull();
    });
  });

  describe("parseBuffer", () => {
    it("rejects non-Buffer input", async () => {
      await expect(parseBuffer("not a buffer")).rejects.toThrow(/Buffer/);
    });

    it("throws UnsupportedFormatError for unknown formats", async () => {
      await expect(
        parseBuffer(Buffer.from("data"), { filename: "file.exe" })
      ).rejects.toBeInstanceOf(UnsupportedFormatError);
    });

    it("extracts text from a real PDF fixture", async () => {
      const { format, text } = await parseBuffer(await load("sample.pdf"), {
        filename: "sample.pdf",
      });
      expect(format).toBe("pdf");
      expect(text).toContain("VANI AI test fixture document");
    });

    it("extracts text from a real DOCX fixture", async () => {
      const { format, text } = await parseBuffer(await load("sample.docx"), {
        filename: "sample.docx",
      });
      expect(format).toBe("docx");
      expect(text).toContain("VANI AI test fixture document");
    });

    it("extracts sheet text from a real XLSX fixture", async () => {
      const { format, text } = await parseBuffer(await load("sample.xlsx"), {
        filename: "sample.xlsx",
      });
      expect(format).toBe("xlsx");
      expect(text).toContain("Alice");
      expect(text).toContain("### Sheet: People");
    });

    it("passes through CSV as normalized plain text", async () => {
      const { format, text } = await parseBuffer(await load("sample.csv"), {
        filename: "sample.csv",
      });
      expect(format).toBe("csv");
      expect(text).toBe("name,age,city\nAlice,30,Mumbai\nBob,25,Delhi");
    });

    it("passes through Markdown source as plain text", async () => {
      const { format, text } = await parseBuffer(await load("sample.md"), {
        filename: "sample.md",
      });
      expect(format).toBe("markdown");
      expect(text).toContain("# Sample Markdown");
      expect(text).toContain("- item one");
    });

    it("decodes TXT with BOM stripped", async () => {
      const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hello world")]);
      const { text } = await parseBuffer(withBom, { filename: "bom.txt" });
      expect(text).toBe("hello world");
    });

    it("collapses excessive blank lines (normalizePlainText)", async () => {
      const noisy = Buffer.from("line one\n\n\n\n\nline two\r\ncrlf line   \n");
      const { text } = await parseBuffer(noisy, { filename: "noisy.txt" });
      expect(text).toBe("line one\n\nline two\ncrlf line");
    });

    it("respects an explicit format override even without a matching extension", async () => {
      const { format } = await parseBuffer(await load("sample.csv"), {
        filename: "weird-name-no-ext",
        format: "csv",
      });
      expect(format).toBe("csv");
    });
  });
});
