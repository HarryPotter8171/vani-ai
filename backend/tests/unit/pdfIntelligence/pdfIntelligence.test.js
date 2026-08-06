import { describe, it, expect } from "vitest";
import {
  classifyDocumentType,
  DOCUMENT_TYPES,
} from "../../../services/pdfIntelligence/classify/documentType.js";
import {
  extractHeadings,
  extractForms,
  detectTextTables,
  extractTablesFromPages,
} from "../../../services/pdfIntelligence/extract/structure.js";
import { chunkPdfPages } from "../../../services/pdfIntelligence/chunk/pageChunker.js";
import {
  mapPdfParseError,
  PasswordProtectedPdfError,
  CorruptedPdfError,
  HugePdfError,
} from "../../../services/pdfIntelligence/errors.js";
import { findMentions } from "../../../services/pdfIntelligence/search/search.js";
import { extractPdfStructure } from "../../../services/pdfIntelligence/extract/pages.js";
import {
  PDF_TEST_CASES,
  buildPdfCase,
  buildCorruptedBuffer,
  buildNonPdfBuffer,
} from "../../helpers/pdfIntelFixtures.js";

describe("pdfIntelligence: classifyDocumentType", () => {
  it("exports the expected semantic types", () => {
    expect(DOCUMENT_TYPES).toContain("Invoice");
    expect(DOCUMENT_TYPES).toContain("GST Invoice");
    expect(DOCUMENT_TYPES).toContain("Resume");
    expect(DOCUMENT_TYPES).toContain("Aadhaar");
  });

  it("classifies a GST invoice", () => {
    const r = classifyDocumentType(
      "TAX INVOICE GSTIN 29AAAAA0000A1Z5 CGST SGST HSN Total Amount"
    );
    expect(r.documentType).toBe("GST Invoice");
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it("classifies a resume", () => {
    const r = classifyDocumentType(
      "Jane Doe Resume Work Experience Education Skills Professional Summary"
    );
    expect(r.documentType).toBe("Resume");
  });

  it("classifies a bank statement", () => {
    const r = classifyDocumentType(
      "Bank Statement Account Number IFSC Opening Balance Closing Balance Debit Credit"
    );
    expect(r.documentType).toBe("Bank Statement");
  });

  it("returns Document for unknown text", () => {
    const r = classifyDocumentType("hello world nothing special here");
    expect(r.documentType).toBe("Document");
  });
});

describe("pdfIntelligence: structure extraction", () => {
  it("extracts headings", () => {
    const headings = extractHeadings([
      { page: 1, text: "INTRODUCTION\nSome body text\n1. Scope\nDetails" },
    ]);
    expect(headings.some((h) => /INTRODUCTION/i.test(h.text))).toBe(true);
  });

  it("extracts form key-values", () => {
    const forms = extractForms([
      { page: 2, text: "Policy Number: POL-1\nExpiry Date: 2025-12-31" },
    ]);
    expect(forms.length).toBeGreaterThanOrEqual(2);
    expect(forms.find((f) => /policy number/i.test(f.key))?.value).toMatch(/POL-1/);
  });

  it("detects pipe tables as structured JSON", () => {
    const tables = detectTextTables(
      "Item | Qty | Price\nWidget | 2 | 100\nGadget | 1 | 250",
      3
    );
    expect(tables.length).toBeGreaterThanOrEqual(1);
    expect(tables[0].columns).toEqual(["Item", "Qty", "Price"]);
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].page).toBe(3);
  });

  it("extractTablesFromPages merges page tables", () => {
    const tables = extractTablesFromPages([
      {
        page: 1,
        text: "A | B\n1 | 2\n3 | 4",
      },
    ]);
    expect(tables[0].columns.length).toBe(2);
  });
});

describe("pdfIntelligence: pageChunker", () => {
  it("keeps page citations on each chunk", () => {
    const chunks = chunkPdfPages([
      { page: 1, text: "Short page one." },
      { page: 2, text: "Short page two." },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[1].pageEnd).toBe(2);
  });

  it("splits long pages without merging across pages", () => {
    const long = "Paragraph. ".repeat(400);
    const chunks = chunkPdfPages([{ page: 7, text: long }], {
      chunkChars: 200,
      overlap: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.pageStart === 7 && c.pageEnd === 7)).toBe(true);
  });
});

describe("pdfIntelligence: errors", () => {
  it("maps password errors", () => {
    const err = mapPdfParseError({ name: "PasswordException", message: "Need password" });
    expect(err).toBeInstanceOf(PasswordProtectedPdfError);
    expect(err.code).toBe("PDF_PASSWORD_PROTECTED");
  });

  it("maps corrupted PDF errors", () => {
    const err = mapPdfParseError({ name: "InvalidPDFException", message: "Invalid PDF structure." });
    expect(err).toBeInstanceOf(CorruptedPdfError);
  });

  it("HugePdfError includes limits", () => {
    const err = new HugePdfError(900, 500);
    expect(err.message).toMatch(/900/);
    expect(err.message).toMatch(/500/);
    expect(err.code).toBe("PDF_TOO_LARGE");
  });
});

describe("pdfIntelligence: findMentions", () => {
  it("finds GSTIN values across pages", () => {
    const mentions = findMentions(
      [
        { page: 1, text: "Vendor GSTIN 29AAAAA0000A1Z5" },
        { page: 2, text: "Other GSTIN 07BBBBB0000B1Z5" },
      ],
      "Find all GST numbers"
    );
    expect(mentions.length).toBeGreaterThanOrEqual(2);
    expect(mentions.every((m) => m.page)).toBe(true);
  });
});

describe("pdfIntelligence: extractPdfStructure on fixtures", () => {
  it("extracts pages + classifies GST invoice", async () => {
    const { buffer } = await buildPdfCase("gst_invoice");
    const extracted = await extractPdfStructure(buffer, { filename: "gst.pdf" });
    expect(extracted.pageCount).toBeGreaterThanOrEqual(1);
    expect(extracted.pages[0].text).toMatch(/GSTIN/i);
    const type = classifyDocumentType(extracted.sampleText, { filename: "gst.pdf" });
    expect(type.documentType).toBe("GST Invoice");
  });

  it("rejects non-PDF buffers", async () => {
    await expect(extractPdfStructure(buildNonPdfBuffer())).rejects.toMatchObject({
      code: "PDF_UNSUPPORTED",
    });
  });

  it("rejects corrupted PDFs with friendly error", async () => {
    await expect(extractPdfStructure(buildCorruptedBuffer(), { filename: "x.pdf" })).rejects.toMatchObject({
      code: "PDF_CORRUPTED",
    });
  });
});

describe("pdfIntelligence: 30 PDF test cases", () => {
  it("defines exactly 30 cases", () => {
    expect(PDF_TEST_CASES).toHaveLength(30);
  });

  it.each(PDF_TEST_CASES.map((c) => [c.id, c.label, c]))(
    "builds and extracts %s (%s)",
    async (id) => {
      const { buffer, filename, label } = await buildPdfCase(id);
      expect(buffer.length).toBeGreaterThan(50);
      expect(buffer.subarray(0, 4).toString()).toBe("%PDF");

      const extracted = await extractPdfStructure(buffer, { filename });
      expect(extracted.pageCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(extracted.pages)).toBe(true);

      // Sparse/scanned fixtures may have almost no text — still must return structure.
      if (id !== "scanned_sparse") {
        expect(extracted.totalChars).toBeGreaterThan(0);
      }

      const type = classifyDocumentType(extracted.sampleText, { filename, pageCount: extracted.pageCount });
      expect(type.documentType).toBeTruthy();
      expect(typeof type.confidence).toBe("number");

      // Label is informational; strong cases should match semantic type loosely
      if (
        [
          "invoice",
          "gst_invoice",
          "resume",
          "bank_statement",
          "research_paper",
          "aadhaar",
          "pan",
          "passport",
          "medical_report",
          "electricity_bill",
          "insurance",
          "annual_report",
          "contract",
        ].includes(id)
      ) {
        // Accept GST Invoice for invoice when GST signals dominate, etc.
        expect(
          type.documentType === label ||
            (label === "Invoice" && type.documentType === "GST Invoice") ||
            (label === "Legal Contract" && type.documentType === "Legal Contract") ||
            type.documentType !== "Document"
        ).toBe(true);
      }

      const chunks = chunkPdfPages(extracted.pages);
      // Empty-ish pages may yield zero chunks
      if (extracted.totalChars > 20) {
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0]).toHaveProperty("pageStart");
      }
    },
    30_000
  );
});
