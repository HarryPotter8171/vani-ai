/**
 * Smoke-test document understanding for PDF, Image, and DOCX.
 * Usage: node scripts/verifyDocumentUnderstanding.js
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import AdmZip from "adm-zip";
import { UPLOADS_DIR } from "../config/upload.js";
import { writeUploadMetadata } from "../services/fileService.js";
import { understandUploadedDocument } from "../services/documentUnderstanding/index.js";
import { shutdownOcrWorker } from "../services/image/ocr.js";

function minimalPdf(text = "VANI AI Document Understanding") {
  // Simple text PDF (selectable text layer).
  const stream = `BT /F1 18 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
  );
  objects.push(
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj\n`
  );
  objects.push(
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
  );

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

async function minimalPngWithText() {
  // Sharp SVG → PNG so OCR has readable glyphs.
  const svg = `
    <svg width="640" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="40" y="110" font-size="42" font-family="Arial, Helvetica, sans-serif" fill="black">
        VANI OCR TEST
      </text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function minimalDocx(text = "VANI DOCX understanding works.") {
  const zip = new AdmZip();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(rels, "utf8"));
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf8"));
  return zip.toBuffer();
}

async function stageUpload({ filename, mimeType, kind, buffer }) {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const id = randomUUID();
  const ownerId = randomUUID();
  const ext = path.extname(filename);
  const storedName = `${id}${ext}`;
  const abs = path.join(UPLOADS_DIR, storedName);
  await fs.writeFile(abs, buffer);
  await writeUploadMetadata({
    id,
    ownerId,
    filename,
    size: buffer.length,
    mimeType,
    kind,
    path: path.posix.join("uploads", storedName),
  });
  return id;
}

async function assertCase(label, id, expectSubstring) {
  const result = await understandUploadedDocument(id, { force: true });
  const ok =
    typeof result.text === "string" &&
    result.text.toLowerCase().includes(expectSubstring.toLowerCase()) &&
    result.documentType &&
    result.capabilities;

  console.log(`\n=== ${label} ===`);
  console.log("documentType:", result.documentType);
  console.log("category:", result.category);
  console.log("extractionMethod:", result.extractionMethod);
  console.log("charCount:", result.charCount);
  console.log("ocr.used:", result.ocr?.used);
  console.log("text preview:", result.text.slice(0, 160).replace(/\n/g, "\\n"));
  console.log(ok ? "✅ PASS" : "❌ FAIL");
  if (!ok) {
    throw new Error(`${label} verification failed`);
  }
  return result;
}

async function main() {
  const pdfId = await stageUpload({
    filename: "sample.pdf",
    mimeType: "application/pdf",
    kind: "pdf",
    buffer: minimalPdf("Hello from VANI PDF"),
  });

  const pngId = await stageUpload({
    filename: "sample.png",
    mimeType: "image/png",
    kind: "image",
    buffer: await minimalPngWithText(),
  });

  const docxId = await stageUpload({
    filename: "sample.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
    buffer: minimalDocx("Hello from VANI DOCX"),
  });

  await assertCase("PDF", pdfId, "VANI PDF");
  await assertCase("Image", pngId, "VANI");
  await assertCase("DOCX", docxId, "VANI DOCX");

  console.log("\nAll document understanding checks passed.");
}

main()
  .catch((err) => {
    console.error("\nVerification failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownOcrWorker();
  });
