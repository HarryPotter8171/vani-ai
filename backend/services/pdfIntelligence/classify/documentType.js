/**
 * Semantic document-type classifier for Indian + global business PDFs.
 * Rule-based, fast, and deterministic — no LLM required.
 */

const TYPES = Object.freeze([
  {
    type: "GST Invoice",
    score: 12,
    patterns: [
      /\bgst\s*invoice\b/i,
      /\bgstin\b/i,
      /\bh\s*\/?\s*sn\b/i,
      /\bcgst\b/i,
      /\bsgst\b/i,
      /\bigst\b/i,
      /\btax\s+invoice\b/i,
    ],
  },
  {
    type: "Invoice",
    score: 8,
    patterns: [
      /\binvoice\b/i,
      /\binvoice\s*(no|number|#)\b/i,
      /\bbill\s+to\b/i,
      /\bamount\s+due\b/i,
      /\bsubtotal\b/i,
      /\btotal\s*(amount|due)?\b/i,
    ],
  },
  {
    type: "Bank Statement",
    score: 11,
    patterns: [
      /\bbank\s+statement\b/i,
      /\baccount\s+(number|no\.?|statement)\b/i,
      /\bopening\s+balance\b/i,
      /\bclosing\s+balance\b/i,
      /\bdebit\b/i,
      /\bcredit\b/i,
      /\bifsc\b/i,
      /\btransaction\s+(id|date|details)\b/i,
    ],
  },
  {
    type: "Resume",
    score: 10,
    patterns: [
      /\bcurriculum\s+vitae\b/i,
      /\bresum[eé]\b/i,
      /\bwork\s+experience\b/i,
      /\beducation\b/i,
      /\bskills\b/i,
      /\bprofessional\s+summary\b/i,
      /\bobjective\b/i,
    ],
  },
  {
    type: "Research Paper",
    score: 10,
    patterns: [
      /\babstract\b/i,
      /\bintroduction\b/i,
      /\breferences\b/i,
      /\bcitation\b/i,
      /\bdoi\s*:/i,
      /\bmethodology\b/i,
      /\bliterature\s+review\b/i,
      /\bfig\.\s*\d+/i,
    ],
  },
  {
    type: "Legal Contract",
    score: 10,
    patterns: [
      /\bagreement\b/i,
      /\bhereinafter\b/i,
      /\bparty\s+of\s+the\s+(first|second)\s+part\b/i,
      /\bwhereas\b/i,
      /\bindemnif/i,
      /\bgoverning\s+law\b/i,
      /\bterms\s+and\s+conditions\b/i,
      /\bclause\s+\d+/i,
      /\bwitnesseth\b/i,
    ],
  },
  {
    type: "Aadhaar",
    score: 14,
    patterns: [
      /\baadhaa?r\b/i,
      /\bunique\s+identification\s+authority\b/i,
      /\buidai\b/i,
      /\b\d{4}\s+\d{4}\s+\d{4}\b/,
      /\bvid\b/i,
    ],
  },
  {
    type: "PAN",
    score: 14,
    patterns: [
      /\bpermanent\s+account\s+number\b/i,
      /\bincome\s+tax\s+department\b/i,
      /\b\bpan\b/i,
      /\b[A-Z]{5}\d{4}[A-Z]\b/,
    ],
  },
  {
    type: "Passport",
    score: 12,
    patterns: [
      /\bpassport\b/i,
      /\brepublic\s+of\s+india\b/i,
      /\bplace\s+of\s+birth\b/i,
      /\bpassport\s+no/i,
      /\bnationality\b/i,
      /\bmrz\b/i,
    ],
  },
  {
    type: "Medical Report",
    score: 10,
    patterns: [
      /\bmedical\s+(report|record|history)\b/i,
      /\bpatient\s+(name|id|details)\b/i,
      /\bdiagnosis\b/i,
      /\bprescription\b/i,
      /\blaboratory\b/i,
      /\bhbA1c\b/i,
      /\bblood\s+(pressure|sugar|test)\b/i,
      /\bclinical\s+findings\b/i,
    ],
  },
  {
    type: "Electricity Bill",
    score: 12,
    patterns: [
      /\belectricity\s+bill\b/i,
      /\bconsumer\s+(number|no|id)\b/i,
      /\bunits\s+consumed\b/i,
      /\bkwh\b/i,
      /\benergy\s+charges\b/i,
      /\bpower\s+distribution\b/i,
      /\bsanctioned\s+load\b/i,
    ],
  },
  {
    type: "Annual Report",
    score: 10,
    patterns: [
      /\bannual\s+report\b/i,
      /\bfinancial\s+(year|statements)\b/i,
      /\bconsolidated\s+(balance\s+sheet|financials)\b/i,
      /\bshareholders?\b/i,
      /\bdirector'?s?\s+report\b/i,
      /\bauditor'?s?\s+report\b/i,
      /\brevenue\s+from\s+operations\b/i,
    ],
  },
  {
    type: "Insurance Policy",
    score: 11,
    patterns: [
      /\binsurance\s+policy\b/i,
      /\bpolicy\s+(number|no|holder)\b/i,
      /\bpremium\b/i,
      /\bsum\s+assured\b/i,
      /\bcoverage\b/i,
      /\bnominee\b/i,
      /\bexpiry\s+date\b/i,
      /\bpolicy\s+period\b/i,
    ],
  },
]);

/**
 * @param {string} text
 * @param {{ pageCount?: number|null, filename?: string }} [meta]
 * @returns {{ documentType: string, confidence: number, scores: Record<string, number> }}
 */
export function classifyDocumentType(text = "", meta = {}) {
  const sample = String(text || "").slice(0, 40_000);
  const filename = String(meta.filename || "").toLowerCase();
  const scores = {};

  for (const entry of TYPES) {
    let score = 0;
    for (const re of entry.patterns) {
      if (re.test(sample)) score += 1;
    }
    // Filename hints
    const slug = entry.type.toLowerCase().replace(/\s+/g, "");
    if (filename.includes(slug) || filename.includes(entry.type.toLowerCase().split(" ")[0])) {
      score += 2;
    }
    if (score > 0) scores[entry.type] = score;
  }

  let best = "Document";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    const threshold = TYPES.find((t) => t.type === type)?.score || 8;
    // Normalize: require roughly 30% of patterns, or absolute ≥ 2 hits.
    const weight = score >= 2 || score >= threshold * 0.25 ? score : 0;
    if (weight > bestScore) {
      bestScore = weight;
      best = type;
    }
  }

  // Prefer GST Invoice over generic Invoice when GST signals dominate.
  if (scores["GST Invoice"] && scores.Invoice) {
    if ((scores["GST Invoice"] || 0) >= (scores.Invoice || 0)) {
      best = "GST Invoice";
      bestScore = scores["GST Invoice"];
    }
  }

  const maxPossible = 8;
  const confidence =
    best === "Document"
      ? 0.2
      : Math.min(0.98, 0.35 + bestScore / maxPossible);

  return {
    documentType: best,
    confidence: Math.round(confidence * 100) / 100,
    scores,
  };
}

export const DOCUMENT_TYPES = TYPES.map((t) => t.type);
