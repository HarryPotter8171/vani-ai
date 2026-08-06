/**
 * 30 production OCR test cases for VANI AI.
 *
 * Covers invoices, KYC docs, bills, handwriting, EN/HI/mixed, tables,
 * scanned/multi-page PDFs, and degraded images (rotate / blur / low quality).
 *
 * Writes OCR_TEST_REPORT.md at repo root after the suite finishes.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shutdownOcrWorker } from "../../services/image/ocr.js";
import { runOcr as runProductionOcr } from "../../services/ocr/runOcr.js";
import {
  DOCUMENTS,
  buildScannedPdf,
  buildTextPdf,
  blurImage,
  buildOcrCase,
  degradeImage,
  rotateImage,
  toJpeg,
  toWebp,
} from "../helpers/ocrFixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.resolve(__dirname, "../../../OCR_TEST_REPORT.md");

/** @type {Array<{id:string,name:string,category:string,status:string,ms:number,detail:string,language?:string,textPreview?:string}>} */
const results = [];

function record(entry) {
  results.push(entry);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(haystack, needles) {
  const h = normalize(haystack);
  return needles.some((n) => h.includes(normalize(n)));
}

function includesAll(haystack, needles) {
  const h = normalize(haystack);
  return needles.every((n) => h.includes(normalize(n)));
}

/**
 * Soft pass: OCR returned success + non-empty text, even if expected tokens
 * were partially missed (common for handwriting / heavy blur / Hindi glyphs).
 */
function evaluate(result, caseDef) {
  if (!result?.success) {
    return {
      ok: false,
      softOk: false,
      detail: result?.error || "OCR returned success:false",
    };
  }
  const text = result.text || "";
  if (!text.trim()) {
    return { ok: false, softOk: false, detail: "OCR returned empty text" };
  }

  const allOk =
    !caseDef.expectAll?.length || includesAll(text, caseDef.expectAll);
  const anyOk =
    !caseDef.expectAny?.length || includesAny(text, caseDef.expectAny);

  if (allOk && anyOk) {
    return { ok: true, softOk: true, detail: "Matched expected tokens" };
  }

  if (caseDef.soft && text.trim().length >= 8) {
    return {
      ok: false,
      softOk: true,
      detail: `Partial match (soft). Got preview: ${text.slice(0, 120).replace(/\n/g, " ")}`,
    };
  }

  return {
    ok: false,
    softOk: false,
    detail: `Missing expected tokens. Preview: ${text.slice(0, 160).replace(/\n/g, " ")}`,
  };
}

async function runCase(caseDef) {
  const built = await buildOcrCase(caseDef);
  const started = performance.now();
  let result;
  try {
    result = await runProductionOcr(built.buffer, {
      filename: built.filename,
      mimeType: built.mimeType,
      language: caseDef.language || "eng+hin",
    });
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    record({
      id: caseDef.id,
      name: caseDef.name,
      category: caseDef.category,
      status: "FAIL",
      ms,
      detail: err?.message || String(err),
    });
    throw err;
  }

  const ms = Math.round(performance.now() - started);
  const verdict = evaluate(result, caseDef);
  const status = verdict.ok ? "PASS" : verdict.softOk ? "SOFT_PASS" : "FAIL";

  record({
    id: caseDef.id,
    name: caseDef.name,
    category: caseDef.category,
    status,
    ms,
    detail: verdict.detail,
    language: result.language,
    textPreview: String(result.text || "")
      .slice(0, 180)
      .replace(/\n/g, " "),
    pageCount: Array.isArray(result.pages) ? result.pages.length : 0,
    tableCount: result.metadata?.tableCount ?? null,
  });

  // Hard assert: must succeed + produce text. Soft cases allow token miss.
  expect(result.success).toBe(true);
  expect(String(result.text || "").trim().length).toBeGreaterThan(0);
  expect(result).toMatchObject({
    success: true,
    pages: expect.any(Array),
    language: expect.any(String),
    metadata: expect.any(Object),
  });

  if (!caseDef.soft) {
    expect(verdict.ok, verdict.detail).toBe(true);
  }
}

/** 30 OCR cases */
const CASES = [
  {
    id: "OCR-01",
    name: "Invoice",
    category: "Document",
    expectAny: ["INVOICE", "INV-TEST", "Grand Total", "578"],
    async build() {
      const buffer = await DOCUMENTS.invoice();
      return { buffer, filename: "invoice.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-02",
    name: "Receipt",
    category: "Document",
    expectAny: ["RECEIPT", "TOTAL", "105", "Masala"],
    async build() {
      const buffer = await DOCUMENTS.receipt();
      return { buffer, filename: "receipt.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-03",
    name: "Aadhaar (sample)",
    category: "KYC",
    expectAny: ["AADHAAR", "TEST USER", "9999", "Bengaluru"],
    async build() {
      const buffer = await DOCUMENTS.aadhaar();
      return { buffer, filename: "aadhaar-sample.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-04",
    name: "PAN (sample)",
    category: "KYC",
    expectAny: ["PAN", "ABCDE1234F", "INCOME TAX", "TEST USER"],
    async build() {
      const buffer = await DOCUMENTS.pan();
      return { buffer, filename: "pan-sample.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-05",
    name: "Passport (sample)",
    category: "KYC",
    expectAny: ["PASSPORT", "Z0000000", "REPUBLIC", "TEST USER"],
    async build() {
      const buffer = await DOCUMENTS.passport();
      return { buffer, filename: "passport-sample.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-06",
    name: "Driving Licence (sample)",
    category: "KYC",
    expectAny: ["DRIVING", "LICENCE", "KA01", "TEST USER"],
    async build() {
      const buffer = await DOCUMENTS.drivingLicence();
      return { buffer, filename: "dl-sample.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-07",
    name: "Bank Statement",
    category: "Finance",
    expectAny: ["STATEMENT", "Balance", "NEFT", "73800", "VANI BANK"],
    async build() {
      const buffer = await DOCUMENTS.bankStatement();
      return {
        buffer,
        filename: "bank-statement.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-08",
    name: "Electricity Bill",
    category: "Utility",
    expectAny: ["ELECTRICITY", "Units", "1138", "Consumer"],
    async build() {
      const buffer = await DOCUMENTS.electricityBill();
      return {
        buffer,
        filename: "electricity-bill.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-09",
    name: "Handwritten Notes",
    category: "Handwriting",
    soft: true,
    expectAny: ["OCR", "Meeting", "Notes", "Ship", "Hindi"],
    async build() {
      const buffer = await DOCUMENTS.handwrittenNotes();
      return {
        buffer,
        filename: "handwritten-notes.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-10",
    name: "English plain text",
    category: "Language",
    expectAny: ["quick brown fox", "VANI AI", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    async build() {
      const buffer = await DOCUMENTS.english();
      return { buffer, filename: "english.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-11",
    name: "Hindi text",
    category: "Language",
    soft: true,
    expectAny: ["वानी", "नमूना", "परीक्षा", "बेंगलुरु", "रुपये"],
    language: "eng+hin",
    async build() {
      const buffer = await DOCUMENTS.hindi();
      return { buffer, filename: "hindi.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-12",
    name: "Mixed Hindi + English",
    category: "Language",
    soft: true,
    expectAny: ["Mixed", "INR", "1500", "धन्यवाद", "नाम", "VANI"],
    language: "eng+hin",
    async build() {
      const buffer = await DOCUMENTS.mixedLanguage();
      return { buffer, filename: "mixed-lang.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-13",
    name: "Newspaper",
    category: "Layout",
    expectAny: ["VANI DAILY", "Bengaluru", "OCR", "Weather"],
    async build() {
      const buffer = await DOCUMENTS.newspaper();
      return { buffer, filename: "newspaper.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-14",
    name: "Restaurant Menu",
    category: "Layout",
    expectAny: ["MENU", "Biryani", "Masala Chai", "Paneer"],
    async build() {
      const buffer = await DOCUMENTS.restaurantMenu();
      return { buffer, filename: "menu.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-15",
    name: "Table Extraction",
    category: "Tables",
    expectAny: ["SKU", "Tea", "Coffee", "Sandwich", "ORDER"],
    async build() {
      const buffer = await DOCUMENTS.tableExtraction();
      return { buffer, filename: "table.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-16",
    name: "Scanned PDF (image-embedded)",
    category: "PDF",
    expectAny: ["INVOICE", "INV-TEST", "SAMPLE"],
    async build() {
      const page = await DOCUMENTS.invoice();
      const buffer = await buildScannedPdf([page]);
      return {
        buffer,
        filename: "scanned-invoice.pdf",
        mimeType: "application/pdf",
      };
    },
  },
  {
    id: "OCR-17",
    name: "Rotated image (90°)",
    category: "Degraded",
    soft: true,
    expectAny: ["INVOICE", "INV-TEST", "Grand Total", "SAMPLE"],
    async build() {
      const base = await DOCUMENTS.invoice();
      const buffer = await rotateImage(base, 90);
      return {
        buffer,
        filename: "invoice-rotated.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-18",
    name: "Low quality JPEG",
    category: "Degraded",
    soft: true,
    expectAny: ["RECEIPT", "TOTAL", "105", "VANI"],
    async build() {
      const base = await DOCUMENTS.receipt();
      const buffer = await degradeImage(base, { scale: 0.4, jpegQuality: 22 });
      return {
        buffer,
        filename: "receipt-lowq.jpg",
        mimeType: "image/jpeg",
      };
    },
  },
  {
    id: "OCR-19",
    name: "Blurred image",
    category: "Degraded",
    soft: true,
    expectAny: ["RECEIPT", "TOTAL", "VANI", "105"],
    async build() {
      const base = await DOCUMENTS.receipt();
      const buffer = await blurImage(base, 2.2);
      return {
        buffer,
        filename: "receipt-blur.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-20",
    name: "Multi-page PDF",
    category: "PDF",
    expectAny: ["PAGE 1", "PAGE 2", "PAGE 3", "VANI"],
    async build() {
      const p1 = await renderPageLabel("PAGE 1 — VANI OCR MULTI", "Invoice summary SAMPLE");
      const p2 = await renderPageLabel("PAGE 2 — VANI OCR MULTI", "Line items SAMPLE");
      const p3 = await renderPageLabel("PAGE 3 — VANI OCR MULTI", "Totals SAMPLE");
      const buffer = await buildScannedPdf([p1, p2, p3]);
      return {
        buffer,
        filename: "multi-page.pdf",
        mimeType: "application/pdf",
      };
    },
  },
  {
    id: "OCR-21",
    name: "Invoice as JPEG",
    category: "Format",
    expectAny: ["INVOICE", "GST", "578"],
    async build() {
      const buffer = await toJpeg(await DOCUMENTS.invoice(), 85);
      return { buffer, filename: "invoice.jpg", mimeType: "image/jpeg" };
    },
  },
  {
    id: "OCR-22",
    name: "Menu as WEBP",
    category: "Format",
    expectAny: ["MENU", "Dal Tadka", "Naan"],
    async build() {
      const buffer = await toWebp(await DOCUMENTS.restaurantMenu(), 90);
      return { buffer, filename: "menu.webp", mimeType: "image/webp" };
    },
  },
  {
    id: "OCR-23",
    name: "Aadhaar bilingual cues",
    category: "KYC",
    expectAny: ["AADHAAR", "UNIQUE IDENTIFICATION", "SAMPLE"],
    async build() {
      const buffer = await DOCUMENTS.aadhaar();
      return {
        buffer,
        filename: "aadhaar-bilingual.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-24",
    name: "PAN number format",
    category: "KYC",
    expectAll: ["ABCDE1234F"],
    expectAny: ["PAN"],
    async build() {
      const buffer = await DOCUMENTS.pan();
      return { buffer, filename: "pan-number.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-25",
    name: "Passport MRZ-like lines",
    category: "KYC",
    soft: true,
    expectAny: ["P<IND", "Z0000000", "PASSPORT"],
    async build() {
      const buffer = await DOCUMENTS.passport();
      return { buffer, filename: "passport-mrz.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-26",
    name: "Driving Licence address block",
    category: "KYC",
    expectAny: ["Bengaluru", "Sample Street", "LMV"],
    async build() {
      const buffer = await DOCUMENTS.drivingLicence();
      return { buffer, filename: "dl-address.png", mimeType: "image/png" };
    },
  },
  {
    id: "OCR-27",
    name: "Bank statement table rows",
    category: "Finance",
    expectAny: ["UPI Credit", "POS Debit", "5000", "Debit"],
    async build() {
      const buffer = await DOCUMENTS.bankStatement();
      return {
        buffer,
        filename: "bank-rows.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-28",
    name: "Electricity bill amount due",
    category: "Utility",
    expectAny: ["1138.50", "Due Date", "150"],
    async build() {
      const buffer = await DOCUMENTS.electricityBill();
      return {
        buffer,
        filename: "ebill-amount.png",
        mimeType: "image/png",
      };
    },
  },
  {
    id: "OCR-29",
    name: "Text-layer PDF (OCR path still valid)",
    category: "PDF",
    expectAny: ["VANI", "OCR", "BANK", "STATEMENT"],
    async build() {
      const buffer = await buildTextPdf({
        pages: [
          {
            lines: [
              "VANI BANK STATEMENT — SAMPLE",
              "Account: TEST-0001",
              "Period: Aug 2026",
              "Closing Balance: 73800.00",
              "OCR FIXTURE PAGE",
            ],
          },
        ],
      });
      return {
        buffer,
        filename: "text-statement.pdf",
        mimeType: "application/pdf",
      };
    },
  },
  {
    id: "OCR-30",
    name: "Multi-page bank PDF (3 pages)",
    category: "PDF",
    expectAny: ["STATEMENT", "PAGE", "VANI", "Balance"],
    async build() {
      const pages = [];
      for (let i = 1; i <= 3; i += 1) {
        pages.push(
          await renderPageLabel(
            `VANI BANK STATEMENT PAGE ${i}`,
            `Balance carry ${i * 1000}.00 SAMPLE`
          )
        );
      }
      const buffer = await buildScannedPdf(pages);
      return {
        buffer,
        filename: "bank-multipage.pdf",
        mimeType: "application/pdf",
      };
    },
  },
];

async function renderPageLabel(title, subtitle) {
  const { default: sharpMod } = await import("sharp");
  const svg = `
    <svg width="800" height="1100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="50" y="120" font-size="36" font-family="Arial, sans-serif" fill="#000">${title}</text>
      <text x="50" y="200" font-size="28" font-family="Arial, sans-serif" fill="#222">${subtitle}</text>
      <text x="50" y="280" font-size="24" font-family="Arial, sans-serif" fill="#333">VANI AI OCR multi-page fixture</text>
    </svg>
  `;
  return sharpMod(Buffer.from(svg)).png().toBuffer();
}

beforeAll(() => {
  // Ensure eng pack is available; hin is optional but preferred.
  expect(CASES).toHaveLength(30);
});

afterAll(async () => {
  const passed = results.filter((r) => r.status === "PASS").length;
  const soft = results.filter((r) => r.status === "SOFT_PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const totalMs = results.reduce((a, r) => a + (r.ms || 0), 0);
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] = byCategory[r.category] || {
      pass: 0,
      soft: 0,
      fail: 0,
    };
    if (r.status === "PASS") byCategory[r.category].pass += 1;
    else if (r.status === "SOFT_PASS") byCategory[r.category].soft += 1;
    else byCategory[r.category].fail += 1;
  }

  const rows = results
    .map(
      (r) =>
        `| ${r.id} | ${r.name} | ${r.category} | **${r.status}** | ${r.ms}ms | ${String(r.detail || "").replace(/\|/g, "/").slice(0, 120)} |`
    )
    .join("\n");

  const catRows = Object.entries(byCategory)
    .map(
      ([cat, s]) =>
        `| ${cat} | ${s.pass} | ${s.soft} | ${s.fail} |`
    )
    .join("\n");

  const report = `# OCR Test Report — 30 Cases

Generated: ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Total cases | ${results.length} |
| PASS | ${passed} |
| SOFT_PASS | ${soft} |
| FAIL | ${failed} |
| Pass rate (PASS + SOFT_PASS) | ${results.length ? Math.round(((passed + soft) / results.length) * 100) : 0}% |
| Hard pass rate (PASS only) | ${results.length ? Math.round((passed / results.length) * 100) : 0}% |
| Total OCR time | ${totalMs}ms |

**SOFT_PASS** = OCR succeeded and returned text, but one or more expected tokens were missed (common for handwriting, heavy blur, or Devanagari rendering limits).

## By category

| Category | PASS | SOFT_PASS | FAIL |
|----------|------|-----------|------|
${catRows}

## Case results

| ID | Name | Category | Status | Latency | Detail |
|----|------|----------|--------|---------|--------|
${rows}

## Coverage map

| Requirement | Cases |
|-------------|-------|
| Invoice | OCR-01, OCR-21 |
| Receipt | OCR-02, OCR-18, OCR-19 |
| Aadhaar | OCR-03, OCR-23 |
| PAN | OCR-04, OCR-24 |
| Passport | OCR-05, OCR-25 |
| Driving Licence | OCR-06, OCR-26 |
| Bank Statement | OCR-07, OCR-27, OCR-30 |
| Electricity Bill | OCR-08, OCR-28 |
| Handwritten Notes | OCR-09 |
| English | OCR-10 |
| Hindi | OCR-11 |
| Mixed Language | OCR-12 |
| Newspaper | OCR-13 |
| Restaurant Menu | OCR-14, OCR-22 |
| Table Extraction | OCR-15 |
| Scanned PDF | OCR-16 |
| Rotated Images | OCR-17 |
| Low Quality Images | OCR-18 |
| Blur Images | OCR-19 |
| Multi-page PDF | OCR-20, OCR-30 |
| Extra formats / PDF paths | OCR-21–22, OCR-29 |

## Notes

- All KYC/finance fixtures use clearly labeled **SAMPLE / TEST** data — not real PII.
- Engine: Tesseract via \`runOcr\` (\`eng+hin\` default).
- Fixtures: \`backend/tests/helpers/ocrFixtures.js\`
- Suite: \`backend/tests/ocr/ocrCases.test.js\`

## How to re-run

\`\`\`bash
cd backend
npx vitest run tests/ocr/ocrCases.test.js --testTimeout=120000
\`\`\`
`;

  await fs.writeFile(REPORT_PATH, report, "utf8");
  // eslint-disable-next-line no-console
  console.log(`\n[ocr-report] wrote ${REPORT_PATH}`);
  console.log(
    `[ocr-report] PASS=${passed} SOFT_PASS=${soft} FAIL=${failed} totalMs=${totalMs}`
  );

  try {
    await shutdownOcrWorker();
  } catch {
    // ignore
  }
});

describe("VANI OCR — 30 production cases", () => {
  for (const caseDef of CASES) {
    it(
      `${caseDef.id}: ${caseDef.name}`,
      async () => {
        await runCase(caseDef);
      },
      120_000
    );
  }
});
