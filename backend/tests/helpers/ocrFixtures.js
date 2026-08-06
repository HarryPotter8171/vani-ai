/**
 * Synthetic OCR fixtures for VANI production OCR tests.
 * All documents use clearly FAKE / SAMPLE data — never real PII.
 */

import PDFDocument from "pdfkit";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const DEVANAGARI_FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/DevanagariMT.ttc",
  "/Library/Fonts/Arial Unicode.ttf",
];

const SANS_FONT =
  "/System/Library/Fonts/Supplemental/Arial.ttf";

function pickDevanagariFont() {
  for (const p of DEVANAGARI_FONT_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render multiline text onto a white PNG via SVG → sharp.
 */
export async function renderTextImage({
  lines = [],
  width = 900,
  height = 1200,
  fontSize = 28,
  lineHeight = 40,
  marginX = 40,
  marginY = 50,
  fill = "#111111",
  background = "#ffffff",
  fontFamily = "Arial, Devanagari MT, Kohinoor Devanagari, sans-serif",
} = {}) {
  const textNodes = lines
    .map((line, i) => {
      const y = marginY + i * lineHeight;
      return `<text x="${marginX}" y="${y}" font-size="${fontSize}" font-family="${fontFamily}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${background}"/>
      ${textNodes}
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Render a simple table as an image.
 */
export async function renderTableImage({
  headers = [],
  rows = [],
  title = "",
  width = 1000,
  colGap = 220,
} = {}) {
  const lines = [];
  if (title) lines.push(title);
  lines.push(headers.join("     "));
  lines.push("-".repeat(Math.min(60, headers.join(" ").length + 20)));
  for (const row of rows) {
    lines.push(row.join("     "));
  }
  // Also draw absolute-positioned columns for better OCR column detection
  const headerY = title ? 90 : 50;
  const cells = [];
  headers.forEach((h, c) => {
    cells.push(
      `<text x="${40 + c * colGap}" y="${headerY}" font-size="26" font-family="Arial, sans-serif" fill="#000">${escapeXml(h)}</text>`
    );
  });
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      cells.push(
        `<text x="${40 + c * colGap}" y="${headerY + 40 + r * 36}" font-size="24" font-family="Arial, sans-serif" fill="#111">${escapeXml(cell)}</text>`
      );
    });
  });

  const height = headerY + 60 + rows.length * 40 + 40;
  const titleNode = title
    ? `<text x="40" y="45" font-size="30" font-family="Arial, sans-serif" font-weight="bold" fill="#000">${escapeXml(title)}</text>`
    : "";

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      ${titleNode}
      ${cells.join("\n")}
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function toJpeg(buffer, quality = 40) {
  return sharp(buffer).jpeg({ quality }).toBuffer();
}

export async function toWebp(buffer, quality = 80) {
  return sharp(buffer).webp({ quality }).toBuffer();
}

export async function rotateImage(buffer, degrees = 90) {
  return sharp(buffer).rotate(degrees).png().toBuffer();
}

export async function blurImage(buffer, sigma = 2.5) {
  return sharp(buffer).blur(sigma).png().toBuffer();
}

export async function degradeImage(buffer, { scale = 0.35, jpegQuality = 25 } = {}) {
  const meta = await sharp(buffer).metadata();
  const w = Math.max(80, Math.round((meta.width || 800) * scale));
  const h = Math.max(80, Math.round((meta.height || 1000) * scale));
  return sharp(buffer)
    .resize(w, h)
    .jpeg({ quality: jpegQuality })
    .toBuffer();
}

/** Build a multi-page PDF with rendered text (selectable + OCR-able when screenshotted). */
export function buildTextPdf({ pages = [] } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontPath = pickDevanagariFont();
    for (const page of pages) {
      doc.addPage();
      if (fontPath && page.useDevanagari) {
        try {
          doc.font(fontPath);
        } catch {
          doc.font("Helvetica");
        }
      } else if (fs.existsSync(SANS_FONT)) {
        try {
          doc.font(SANS_FONT);
        } catch {
          doc.font("Helvetica");
        }
      } else {
        doc.font("Helvetica");
      }
      doc.fontSize(page.fontSize || 14);
      for (const line of page.lines || []) {
        doc.text(line, { lineGap: 6 });
      }
    }
    doc.end();
  });
}

/** Image-only / scanned-style PDF: embed PNG page screenshots. */
export async function buildScannedPdf(imageBuffers = []) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      for (const img of imageBuffers) {
        const meta = await sharp(img).metadata();
        const width = meta.width || 600;
        const height = meta.height || 800;
        // PDF points ≈ pixels for fixture simplicity
        doc.addPage({ size: [width, height], margin: 0 });
        doc.image(img, 0, 0, { width, height });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Document-type fixture builders — all SAMPLE / TEST data. */
export const DOCUMENTS = {
  async invoice() {
    return renderTextImage({
      lines: [
        "TAX INVOICE — SAMPLE ONLY",
        "VANI RETAIL PVT LTD",
        "Invoice No: INV-TEST-1001",
        "Date: 04-08-2026",
        "Bill To: Test Customer",
        "GSTIN: 29AAAAA0000A1Z5",
        "",
        "Item          Qty    Rate     Amount",
        "Notebook        2     120        240",
        "Pen Set         1     250        250",
        "",
        "Subtotal: 490",
        "GST 18%: 88.20",
        "Grand Total: INR 578.20",
      ],
      height: 900,
    });
  },

  async receipt() {
    return renderTextImage({
      lines: [
        "VANI CAFE — RECEIPT (SAMPLE)",
        "Order #R-9081",
        "Date: 04 Aug 2026  14:32",
        "--------------------------------",
        "Masala Chai           40.00",
        "Samosa x2             60.00",
        "--------------------------------",
        "Subtotal             100.00",
        "Tax                   5.00",
        "TOTAL INR            105.00",
        "Paid by UPI",
        "Thank you! Visit again",
      ],
      width: 500,
      height: 700,
      fontSize: 24,
      lineHeight: 34,
    });
  },

  async aadhaar() {
    return renderTextImage({
      lines: [
        "UNIQUE IDENTIFICATION AUTHORITY OF INDIA",
        "AADHAAR — SAMPLE / TEST CARD ONLY",
        "Name: TEST USER VANI",
        "DOB: 01/01/1990",
        "Gender: Male",
        "VID: 0000 0000 0000",
        "Aadhaar: 9999 8888 7777",
        "Address: 12 Sample Street, Test Nagar,",
        "Bengaluru, Karnataka 560001",
        "THIS IS NOT A REAL AADHAAR",
      ],
      width: 1000,
      height: 620,
      fontSize: 26,
      lineHeight: 42,
    });
  },

  async pan() {
    return renderTextImage({
      lines: [
        "INCOME TAX DEPARTMENT",
        "PERMANENT ACCOUNT NUMBER CARD — SAMPLE",
        "Name: TEST USER VANI",
        "Father's Name: SAMPLE FATHER",
        "Date of Birth: 01/01/1990",
        "PAN: ABCDE1234F",
        "Signature: TEST",
        "NOT A REAL PAN CARD",
      ],
      width: 900,
      height: 520,
      fontSize: 28,
      lineHeight: 44,
    });
  },

  async passport() {
    return renderTextImage({
      lines: [
        "REPUBLIC OF INDIA — PASSPORT (SAMPLE)",
        "Type: P   Country Code: IND",
        "Passport No: Z0000000",
        "Surname: VANI",
        "Given Names: TEST USER",
        "Nationality: INDIAN",
        "Date of Birth: 01 JAN 1990",
        "Sex: M   Place of Birth: DELHI",
        "Date of Issue: 01 JAN 2020",
        "Date of Expiry: 31 DEC 2029",
        "P<INDVANI<<TEST<USER<<<<<<<<<<<<<<<<<<",
        "Z0000000<0IND9001011M2912317<<<<<<<<<<<00",
        "SAMPLE DOCUMENT — NOT REAL",
      ],
      width: 1000,
      height: 720,
      fontSize: 24,
      lineHeight: 36,
    });
  },

  async drivingLicence() {
    return renderTextImage({
      lines: [
        "DRIVING LICENCE — SAMPLE / TEST ONLY",
        "Indian Union — Transport Department",
        "DL No: KA01 20260000000",
        "Name: TEST USER VANI",
        "DOB: 01-01-1990",
        "Address: 12 Sample Street, Test Nagar",
        "Bengaluru KA 560001",
        "Blood Group: O+",
        "Valid Till: 01-01-2035",
        "Class: LMV  MCWG",
        "NOT A REAL DRIVING LICENCE",
      ],
      width: 900,
      height: 650,
      fontSize: 26,
      lineHeight: 40,
    });
  },

  async bankStatement() {
    return renderTableImage({
      title: "VANI BANK — STATEMENT (SAMPLE)",
      headers: ["Date", "Description", "Debit", "Credit", "Balance"],
      rows: [
        ["01-08-2026", "Opening Bal", "-", "-", "25000.00"],
        ["02-08-2026", "UPI Credit", "-", "5000.00", "30000.00"],
        ["03-08-2026", "POS Debit", "1200.00", "-", "28800.00"],
        ["04-08-2026", "NEFT Salary", "-", "45000.00", "73800.00"],
      ],
      width: 1100,
      colGap: 200,
    });
  },

  async electricityBill() {
    return renderTextImage({
      lines: [
        "STATE ELECTRICITY BOARD — SAMPLE BILL",
        "Consumer Name: TEST USER VANI",
        "Consumer No: EB-TEST-445566",
        "Billing Period: Jul 2026",
        "Meter Reading Previous: 1200",
        "Meter Reading Current: 1350",
        "Units Consumed: 150",
        "Energy Charges: 975.00",
        "Fixed Charges: 60.00",
        "Tax: 103.50",
        "Total Amount Due: INR 1138.50",
        "Due Date: 20-08-2026",
        "SAMPLE BILL — NOT REAL",
      ],
      height: 800,
    });
  },

  async handwrittenNotes() {
    // Simulate handwriting with italic + slightly irregular spacing
    const lines = [
      "Meeting Notes — SAMPLE",
      "1) Ship OCR tool today",
      "2) Add Hindi + English support",
      "3) Cover invoices and KYC docs",
      "Follow up with QA on blur cases",
      "- signed: Test User",
    ];
    const nodes = lines
      .map((line, i) => {
        const x = 50 + (i % 3) * 4;
        const y = 80 + i * 55 + (i % 2) * 3;
        return `<text x="${x}" y="${y}" font-size="30" font-family="Comic Sans MS, Brush Script MT, cursive" font-style="italic" fill="#1a1a1a">${escapeXml(line)}</text>`;
      })
      .join("\n");
    const svg = `
      <svg width="900" height="500" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#fffef5"/>
        ${nodes}
      </svg>
    `;
    return sharp(Buffer.from(svg)).png().toBuffer();
  },

  async english() {
    return renderTextImage({
      lines: [
        "VANI AI English OCR Fixture",
        "The quick brown fox jumps over the lazy dog.",
        "Pack my box with five dozen liquor jugs.",
        "Invoice total equals five hundred seventy eight.",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "abcdefghijklmnopqrstuvwxyz",
        "0123456789",
      ],
      height: 500,
      fontSize: 28,
    });
  },

  async hindi() {
    return renderTextImage({
      lines: [
        "वानी एआई हिंदी ओसीआर परीक्षा",
        "यह एक नमूना दस्तावेज़ है।",
        "नाम: परीक्षा उपयोगकर्ता",
        "पता: नमूना नगर, बेंगलुरु",
        "कुल राशि: पाँच सौ रुपये",
        "यह असली दस्तावेज़ नहीं है।",
      ],
      height: 520,
      fontSize: 32,
      lineHeight: 52,
      fontFamily: "Devanagari MT, Kohinoor Devanagari, Arial Unicode MS, sans-serif",
    });
  },

  async mixedLanguage() {
    return renderTextImage({
      lines: [
        "VANI AI Mixed Language / मिश्रित भाषा",
        "Name / नाम: Test User / परीक्षा उपयोगकर्ता",
        "Amount / राशि: INR 1500",
        "Address / पता: Sample Street, Test Nagar",
        "Bill Date / बिल तिथि: 04-08-2026",
        "Thank you / धन्यवाद",
        "SAMPLE ONLY — परीक्षण मात्र",
      ],
      height: 560,
      fontSize: 28,
      lineHeight: 48,
      fontFamily: "Arial Unicode MS, Devanagari MT, Kohinoor Devanagari, sans-serif",
    });
  },

  async newspaper() {
    return renderTextImage({
      lines: [
        "THE VANI DAILY — SAMPLE EDITION",
        "Bengaluru, Tuesday 4 August 2026",
        "",
        "AI Startup Ships Production OCR",
        "Local engineers announced a new OCR tool",
        "that reads invoices, KYC cards, and bills",
        "in English and Hindi with table support.",
        "",
        "Weather: Partly cloudy. High 29C.",
        "Sports: Test XI wins by 4 wickets.",
        "SAMPLE NEWSPAPER PAGE — NOT REAL",
      ],
      width: 900,
      height: 700,
      fontSize: 24,
      lineHeight: 36,
    });
  },

  async restaurantMenu() {
    return renderTextImage({
      lines: [
        "VANI KITCHEN — MENU (SAMPLE)",
        "Starters",
        "Paneer Tikka .............. 220",
        "Veg Spring Roll ........... 160",
        "Mains",
        "Dal Tadka ................. 180",
        "Butter Naan ...............  50",
        "Biryani (Veg) ............. 280",
        "Desserts",
        "Gulab Jamun ...............  90",
        "Beverages",
        "Masala Chai ...............  40",
        "Fresh Lime Soda ...........  60",
        "All prices in INR. SAMPLE MENU.",
      ],
      width: 700,
      height: 900,
      fontSize: 26,
      lineHeight: 40,
    });
  },

  async tableExtraction() {
    return renderTableImage({
      title: "ORDER TABLE — SAMPLE",
      headers: ["SKU", "Item", "Qty", "Price"],
      rows: [
        ["A01", "Tea", "2", "80"],
        ["A02", "Coffee", "1", "120"],
        ["B10", "Sandwich", "3", "450"],
        ["C03", "Juice", "2", "160"],
      ],
      width: 900,
      colGap: 200,
    });
  },
};

/**
 * Resolve a named OCR case into { buffer, filename, mimeType, expect }.
 * `expect` lists substrings that should appear in OCR text (best-effort).
 */
export async function buildOcrCase(caseDef) {
  const built = await caseDef.build();
  return {
    id: caseDef.id,
    name: caseDef.name,
    category: caseDef.category,
    buffer: built.buffer,
    filename: built.filename,
    mimeType: built.mimeType,
    expectAny: caseDef.expectAny || [],
    expectAll: caseDef.expectAll || [],
    soft: Boolean(caseDef.soft),
  };
}

export { pickDevanagariFont, path };
