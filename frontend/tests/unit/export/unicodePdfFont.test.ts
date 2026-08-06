/**
 * Unit tests for Unicode PDF font helpers (Devanagari smoke + API surface).
 * Full multilingual coverage lives in multilingualPdf.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  ensureUnicodePdfFonts,
  getRegisteredPdfFonts,
  needsUnicodeFont,
  sanitizePdfText,
  segmentPdfTextRuns,
  wrapPdfText,
  writePdfText,
  UNICODE_PDF_FONT,
} from '@/lib/export/unicodePdfFont';

describe('unicodePdfFont', () => {
  it('detects Devanagari as needing Unicode font', () => {
    expect(needsUnicodeFont('Hello')).toBe(false);
    expect(needsUnicodeFont('नमस्ते')).toBe(true);
    expect(needsUnicodeFont('Hello नमस्ते')).toBe(true);
  });

  it('strips emoji without removing Hindi', () => {
    expect(sanitizePdfText('नमस्ते 🙏 दुनिया')).toBe('नमस्ते  दुनिया');
    expect(sanitizePdfText('Hello 😀')).toBe('Hello ');
  });

  it('segments mixed English + Hindi into font runs', () => {
    const runs = segmentPdfTextRuns('Hello नमस्ते world');
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.some((r) => r.fontKey === 'noto_devanagari' && r.text.includes('नमस्ते'))).toBe(
      true
    );
    expect(runs.some((r) => r.fontKey === null && /Hello/.test(r.text))).toBe(true);
  });

  it('registers Noto Sans Devanagari on jsPDF', async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await ensureUnicodePdfFonts(doc, 'नमस्ते');
    await ensureUnicodePdfFonts(doc, 'नमस्ते'); // idempotent
    const fonts = doc.getFontList();
    expect(fonts[UNICODE_PDF_FONT] || fonts.NotoSansDevanagari).toBeTruthy();
    expect(getRegisteredPdfFonts(doc)).toContain('noto_devanagari');
  }, 30000);

  it('wraps and draws Hindi without throwing', async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await ensureUnicodePdfFonts(doc, 'नमस्ते दुनिया — यह एक परीक्षण है। Hello mixed English.');
    const lines = wrapPdfText(
      doc,
      'नमस्ते दुनिया — यह एक परीक्षण है। Hello mixed English.',
      200
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => writePdfText(doc, line, 40, 60)).not.toThrow();
    }
    const data = doc.output('arraybuffer');
    expect(data.byteLength).toBeGreaterThan(1000);
  }, 30000);
});
