import PDFDocument from "pdfkit";
import sharp from "sharp";

/** Builds a multi-page, text-heavy PDF buffer for parsing/OCR-skip benchmarks. */
export function buildLargePdf({ pages = 200, paragraphsPerPage = 8 } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const paragraph =
      "VANI AI performance fixture. Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";

    for (let p = 0; p < pages; p += 1) {
      doc.addPage();
      doc.fontSize(11).text(`Page ${p + 1} of ${pages}`, { align: "center" });
      doc.moveDown();
      for (let i = 0; i < paragraphsPerPage; i += 1) {
        doc.text(paragraph.repeat(3));
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}

/** Builds a large (megapixel-scale) PNG buffer with rendered text, for OCR benchmarks. */
export async function buildLargeImage({ width = 3000, height = 3000, text = "VANI AI" } = {}) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const y = 150 + i * (height / 14);
        return `<text x="60" y="${y}" font-size="72" font-family="sans-serif" fill="black">${text} line ${i + 1}</text>`;
      }).join("\n")}
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
