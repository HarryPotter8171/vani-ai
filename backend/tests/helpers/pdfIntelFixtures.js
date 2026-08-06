/**
 * Programmatic PDF fixtures for PDF Intelligence tests.
 * Covers 30 document scenarios without shipping binary fixtures.
 */
import PDFDocument from "pdfkit";

function buildPdf(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    draw(doc);
    doc.end();
  });
}

function addPage(doc, title, bodyLines = []) {
  doc.addPage();
  if (title) {
    doc.fontSize(16).text(title, { underline: false });
    doc.moveDown(0.5);
  }
  doc.fontSize(11);
  for (const line of bodyLines) {
    doc.text(String(line));
  }
}

/** 30 named PDF test cases used by unit + integration suites. */
export const PDF_TEST_CASES = [
  { id: "invoice", label: "Invoice", builder: buildInvoice },
  { id: "gst_invoice", label: "GST Invoice", builder: buildGstInvoice },
  { id: "research_paper", label: "Research Paper", builder: buildResearchPaper },
  { id: "annual_report", label: "Annual Report", builder: buildAnnualReport },
  { id: "contract", label: "Legal Contract", builder: buildContract },
  { id: "resume", label: "Resume", builder: buildResume },
  { id: "bank_statement", label: "Bank Statement", builder: buildBankStatement },
  { id: "electricity_bill", label: "Electricity Bill", builder: buildElectricityBill },
  { id: "insurance", label: "Insurance Policy", builder: buildInsurance },
  { id: "medical_report", label: "Medical Report", builder: buildMedicalReport },
  { id: "aadhaar", label: "Aadhaar", builder: buildAadhaar },
  { id: "pan", label: "PAN", builder: buildPan },
  { id: "passport", label: "Passport", builder: buildPassport },
  { id: "scanned_sparse", label: "Scanned PDF", builder: buildScannedSparse },
  { id: "multipage", label: "Multi-page PDF", builder: buildMultipage },
  { id: "table_heavy", label: "Table heavy PDF", builder: buildTableHeavy },
  { id: "hindi", label: "Hindi PDF", builder: buildHindi },
  { id: "english", label: "English PDF", builder: buildEnglish },
  { id: "mixed_language", label: "Mixed Language PDF", builder: buildMixedLanguage },
  { id: "form_heavy", label: "Form heavy PDF", builder: buildFormHeavy },
  { id: "policy_expiry", label: "Insurance with expiry", builder: buildInsuranceExpiry },
  { id: "clause_doc", label: "Contract with clauses", builder: buildClauseDoc },
  { id: "empty_pages", label: "PDF with empty middle page", builder: buildEmptyMiddle },
  { id: "long_500_cap", label: "Near max pages (12)", builder: () => buildNPages(12) },
  { id: "single_page", label: "Single page memo", builder: buildSingleMemo },
  { id: "totals_spread", label: "Totals across pages", builder: buildTotalsSpread },
  { id: "gst_mentions", label: "Multiple GST mentions", builder: buildGstMentions },
  { id: "headings_toc", label: "Headings / TOC", builder: buildHeadingsToc },
  { id: "corrupted_like", label: "Minimal valid PDF", builder: buildMinimal },
  { id: "invoice_table", label: "Invoice with pipe table", builder: buildInvoiceTable },
];

export async function buildPdfCase(id) {
  const entry = PDF_TEST_CASES.find((c) => c.id === id);
  if (!entry) throw new Error(`Unknown PDF test case: ${id}`);
  const buffer = await entry.builder();
  return { ...entry, buffer, filename: `${id}.pdf` };
}

export async function buildAllPdfCases() {
  const out = [];
  for (const c of PDF_TEST_CASES) {
    out.push(await buildPdfCase(c.id));
  }
  return out;
}

function buildInvoice() {
  return buildPdf((doc) => {
    addPage(doc, "INVOICE", [
      "Invoice Number: INV-2024-8841",
      "Bill To: Acme Corp",
      "Issued By: Contoso Supplies Pvt Ltd",
      "Subtotal: 20000",
      "Tax: 3600",
      "Total Amount Due: 23600",
      "Thank you for your business.",
    ]);
  });
}

function buildGstInvoice() {
  return buildPdf((doc) => {
    addPage(doc, "TAX INVOICE", [
      "GST Invoice",
      "GSTIN: 29AAAAA0000A1Z5",
      "Invoice No: GST-991",
      "HSN: 8471",
      "CGST: 9%",
      "SGST: 9%",
      "IGST: 0%",
      "Total Amount: Rs 24560",
      "Item | Qty | Amount",
      "Laptop | 1 | 24560",
    ]);
  });
}

function buildResearchPaper() {
  return buildPdf((doc) => {
    addPage(doc, "A Study of Retrieval-Augmented Generation", [
      "Abstract",
      "This paper investigates multi-page reasoning over long documents.",
      "Introduction",
      "Large language models struggle with long context without retrieval.",
      "Methodology",
      "We chunk documents by page and embed each segment.",
      "References",
      "1. Doe, J. (2024). DOI: 10.1000/xyz",
    ]);
    addPage(doc, "Conclusion", [
      "RAG with page citations improves trustworthiness.",
      "Fig. 1 shows latency vs page count.",
    ]);
  });
}

function buildAnnualReport() {
  return buildPdf((doc) => {
    addPage(doc, "ANNUAL REPORT 2024-25", [
      "Director's Report",
      "Financial Year 2024-25",
      "Revenue from operations: 1200 Cr",
      "Shareholders letter",
    ]);
    addPage(doc, "Auditor's Report", [
      "Consolidated Balance Sheet",
      "Financial Statements are fairly presented.",
    ]);
  });
}

function buildContract() {
  return buildPdf((doc) => {
    addPage(doc, "SERVICE AGREEMENT", [
      "This Agreement is entered into by and between the parties.",
      "WHEREAS the parties desire to set forth terms and conditions;",
      "NOW THEREFORE, the parties agree as follows.",
      "Clause 1. Definitions",
      "Clause 2. Obligations",
      "Governing Law: Laws of India",
      "INDEMNIFICATION: Each party shall indemnify the other.",
    ]);
  });
}

function buildResume() {
  return buildPdf((doc) => {
    addPage(doc, "JANE DOE — Resume", [
      "Professional Summary",
      "Senior engineer with 8 years experience.",
      "Work Experience",
      "Acme — Staff Engineer (2020-2024)",
      "Education",
      "B.Tech Computer Science",
      "Skills",
      "Python, TypeScript, RAG systems",
    ]);
  });
}

function buildBankStatement() {
  return buildPdf((doc) => {
    addPage(doc, "Bank Statement", [
      "Account Number: 1234567890",
      "IFSC: HDFC0001234",
      "Opening Balance: 50000",
      "Date | Description | Debit | Credit",
      "01-01 | Salary |  | 80000",
      "05-01 | Rent | 25000 | ",
      "Closing Balance: 105000",
      "Transaction details for January.",
    ]);
  });
}

function buildElectricityBill() {
  return buildPdf((doc) => {
    addPage(doc, "Electricity Bill", [
      "Consumer Number: EB-77881",
      "Units Consumed: 320 kWh",
      "Energy Charges: 2400",
      "Sanctioned Load: 5 kW",
      "Power Distribution Company: State Power Ltd",
      "Total Amount: 2650",
    ]);
  });
}

function buildInsurance() {
  return buildPdf((doc) => {
    addPage(doc, "Insurance Policy", [
      "Policy Number: POL-445566",
      "Policy Holder: Rahul Sharma",
      "Premium: 12000",
      "Sum Assured: 500000",
      "Coverage: Health",
      "Nominee: Priya Sharma",
      "Policy Period: 01-Apr-2024 to 31-Mar-2025",
      "Expiry Date: 31-Mar-2025",
    ]);
  });
}

function buildMedicalReport() {
  return buildPdf((doc) => {
    addPage(doc, "Medical Report", [
      "Patient Name: Amit Kumar",
      "Patient ID: MR-1001",
      "Diagnosis: Type 2 Diabetes",
      "Laboratory",
      "Blood Sugar: 142 mg/dL",
      "HbA1c: 7.1",
      "Blood Pressure: 130/85",
      "Clinical Findings: Stable",
      "Prescription: Metformin 500mg",
    ]);
  });
}

function buildAadhaar() {
  return buildPdf((doc) => {
    addPage(doc, "Aadhaar", [
      "Unique Identification Authority of India",
      "UIDAI",
      "Name: Ravi Verma",
      "Aadhaar: 1234 5678 9012",
      "VID: 1234567890123456",
    ]);
  });
}

function buildPan() {
  return buildPdf((doc) => {
    addPage(doc, "Permanent Account Number", [
      "Income Tax Department",
      "PAN: ABCDE1234F",
      "Name: Ravi Verma",
    ]);
  });
}

function buildPassport() {
  return buildPdf((doc) => {
    addPage(doc, "Passport", [
      "Republic of India",
      "Passport No: Z1234567",
      "Nationality: Indian",
      "Place of Birth: Delhi",
      "MRZ: P<INDRVERMA<<RAVI",
    ]);
  });
}

function buildScannedSparse() {
  // Very little alphanumeric text — mimics a weak text layer on a scan
  return buildPdf((doc) => {
    doc.addPage();
    doc.fontSize(8).fillColor("#eeeeee").text(".", 50, 50);
  });
}

function buildMultipage() {
  return buildPdf((doc) => {
    for (let i = 1; i <= 8; i += 1) {
      addPage(doc, `Chapter ${i}`, [
        `This is page ${i} of a multi-page PDF.`,
        `Key point on page ${i}: topic-${i}`,
        i === 4 ? "Important clause about liability appears here." : "Supporting detail.",
      ]);
    }
  });
}

function buildTableHeavy() {
  return buildPdf((doc) => {
    addPage(doc, "Quarterly Metrics", [
      "Region | Revenue | Growth",
      "North | 120 | 12%",
      "South | 98 | 8%",
      "East | 76 | 15%",
      "West | 110 | 9%",
      "",
      "Product | Units | ASP",
      "Alpha | 500 | 20",
      "Beta | 300 | 35",
      "Gamma | 150 | 50",
    ]);
  });
}

function buildHindi() {
  return buildPdf((doc) => {
    // PDFKit default fonts may not embed Devanagari glyphs; include
    // transliteration + Hindi keywords so classifiers / search still work.
    addPage(doc, "Hindi Document / हिंदी दस्तावेज़", [
      "Yeh ek Hindi PDF hai.",
      "मुख्य बिंदु: बिल की राशि 24560 रुपये है।",
      "GST numbers: GSTIN 07BBBBB0000B1Z5",
      "Anuvad ke liye taiyar.",
    ]);
  });
}

function buildEnglish() {
  return buildPdf((doc) => {
    addPage(doc, "English Summary", [
      "This is a plain English PDF fixture.",
      "It contains several key points for summarization tests.",
      "Point one: reliability.",
      "Point two: citations with page numbers.",
    ]);
  });
}

function buildMixedLanguage() {
  return buildPdf((doc) => {
    addPage(doc, "Mixed Language Report", [
      "English section: Project status is green.",
      "Hindi section: परियोजना सफलतापूर्वक पूर्ण हुई।",
      "Invoice Number: MIX-42",
      "Total amount: 9999",
    ]);
  });
}

function buildFormHeavy() {
  return buildPdf((doc) => {
    addPage(doc, "Application Form", [
      "Full Name: Anita Desai",
      "Date of Birth: 12-05-1990",
      "Address: 42 MG Road, Bengaluru",
      "Phone: 9876543210",
      "Email: anita@example.com",
      "Issued By: Municipal Corporation",
    ]);
  });
}

function buildInsuranceExpiry() {
  return buildInsurance();
}

function buildClauseDoc() {
  return buildPdf((doc) => {
    addPage(doc, "Master Services Agreement", [
      "Clause 7. Confidentiality",
      "Each party shall keep confidential information secret.",
      "Clause 8. Termination",
      "Either party may terminate with 30 days written notice.",
      "Clause 9. Governing Law",
      "This agreement is governed by the laws of India.",
    ]);
  });
}

function buildEmptyMiddle() {
  return buildPdf((doc) => {
    addPage(doc, "Page One", ["Content on page 1."]);
    doc.addPage(); // empty
    addPage(doc, "Page Three", ["Content on page 3."]);
  });
}

function buildNPages(n) {
  return buildPdf((doc) => {
    for (let i = 1; i <= n; i += 1) {
      addPage(doc, `Page ${i}`, [`Body text for page ${i}.`]);
    }
  });
}

function buildSingleMemo() {
  return buildPdf((doc) => {
    addPage(doc, "Internal Memo", [
      "Subject: Office relocation",
      "Please note the move date is 15 August.",
    ]);
  });
}

function buildTotalsSpread() {
  return buildPdf((doc) => {
    addPage(doc, "Order Summary", [
      "Line A subtotal: 1000",
      "Line B subtotal: 2500",
    ]);
    addPage(doc, "Taxes", ["CGST: 315", "SGST: 315"]);
    addPage(doc, "Grand Total", [
      "Total Amount: 4130",
      "Paid via NEFT",
    ]);
  });
}

function buildGstMentions() {
  return buildPdf((doc) => {
    addPage(doc, "Vendor List", [
      "Vendor A GSTIN 27AAAAA0000A1Z5",
      "Vendor B GSTIN 29BBBBB0000B1Z5",
    ]);
    addPage(doc, "More Vendors", [
      "Vendor C GSTIN 07CCCCC0000C1Z5",
      "Find all mentions of GST here.",
    ]);
  });
}

function buildHeadingsToc() {
  return buildPdf((doc) => {
    addPage(doc, "TABLE OF CONTENTS", [
      "1. Introduction",
      "2. Scope",
      "2.1. Inclusions",
      "3. Appendix",
    ]);
    addPage(doc, "INTRODUCTION", ["Body of introduction."]);
    addPage(doc, "SCOPE", ["Body of scope.", "2.1. Inclusions", "Listed items."]);
  });
}

function buildMinimal() {
  return buildPdf((doc) => {
    doc.addPage();
    doc.fontSize(10).text("Minimal PDF");
  });
}

function buildInvoiceTable() {
  return buildPdf((doc) => {
    addPage(doc, "Invoice", [
      "Invoice Number: TAB-100",
      "Item | Qty | Price",
      "Widget | 2 | 100",
      "Gadget | 1 | 250",
      "Total Amount: 450",
    ]);
  });
}

/** Invalid / non-PDF buffers for error-path tests */
export function buildCorruptedBuffer() {
  return Buffer.from("%PDF-1.4\nthis is not a valid pdf structure\n%%EOF");
}

export function buildNonPdfBuffer() {
  return Buffer.from("PK\x03\x04not-a-pdf");
}

export function buildEmptyBuffer() {
  return Buffer.alloc(0);
}
