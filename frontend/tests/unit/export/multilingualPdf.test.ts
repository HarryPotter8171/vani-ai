/**
 * Multilingual PDF font / script detection / rendering tests.
 */

import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  LANGUAGE_SCRIPT_MAP,
  PDF_FONT_CATALOG,
  collectScriptsInText,
  detectRequiredFontKeys,
  detectScript,
  isHelveticaSafe,
  scriptToFontKey,
} from '@/lib/export/pdfFontCatalog';
import {
  ensureUnicodePdfFonts,
  getRegisteredPdfFonts,
  needsUnicodeFont,
  sanitizePdfText,
  segmentPdfTextRuns,
  wrapPdfText,
  writePdfText,
} from '@/lib/export/unicodePdfFont';
import { prepareRtlArabic, reshapeArabic } from '@/lib/export/rtlText';
import { parseMarkdownBlocks } from '@/lib/export/markdownBlocks';

describe('pdfFontCatalog script detection', () => {
  it('classifies major scripts', () => {
    expect(detectScript('न'.codePointAt(0)!)).toBe('devanagari');
    expect(detectScript('ગ'.codePointAt(0)!)).toBe('gujarati');
    expect(detectScript('ਪ'.codePointAt(0)!)).toBe('gurmukhi');
    expect(detectScript('ব'.codePointAt(0)!)).toBe('bengali');
    expect(detectScript('ଓ'.codePointAt(0)!)).toBe('oriya');
    expect(detectScript('த'.codePointAt(0)!)).toBe('tamil');
    expect(detectScript('త'.codePointAt(0)!)).toBe('telugu');
    expect(detectScript('ಕ'.codePointAt(0)!)).toBe('kannada');
    expect(detectScript('മ'.codePointAt(0)!)).toBe('malayalam');
    expect(detectScript('ع'.codePointAt(0)!)).toBe('arabic');
    expect(detectScript('ש'.codePointAt(0)!)).toBe('hebrew');
    expect(detectScript('Я'.codePointAt(0)!)).toBe('cyrillic');
    expect(detectScript('Ω'.codePointAt(0)!)).toBe('greek');
    expect(detectScript('你'.codePointAt(0)!)).toBe('han_sc');
    expect(detectScript('あ'.codePointAt(0)!)).toBe('hiragana');
    expect(detectScript('ア'.codePointAt(0)!)).toBe('katakana');
    expect(detectScript('한'.codePointAt(0)!)).toBe('hangul');
    expect(detectScript('ก'.codePointAt(0)!)).toBe('thai');
    expect(detectScript('ሀ'.codePointAt(0)!)).toBe('ethiopic');
    expect(detectScript('ක'.codePointAt(0)!)).toBe('sinhala');
    expect(detectScript('က'.codePointAt(0)!)).toBe('myanmar');
    expect(detectScript('ក'.codePointAt(0)!)).toBe('khmer');
    expect(detectScript('ກ'.codePointAt(0)!)).toBe('lao');
    expect(detectScript('ᠮ'.codePointAt(0)!)).toBe('mongolian');
    expect(detectScript('ཀ'.codePointAt(0)!)).toBe('tibetan');
    expect(detectScript('ế'.codePointAt(0)!)).toBe('latin');
  });

  it('keeps ASCII / WinAnsi on Helvetica', () => {
    expect(isHelveticaSafe('A'.codePointAt(0)!)).toBe(true);
    expect(isHelveticaSafe('é'.codePointAt(0)!)).toBe(true);
    expect(isHelveticaSafe('ế'.codePointAt(0)!)).toBe(false);
    expect(isHelveticaSafe('न'.codePointAt(0)!)).toBe(false);
  });

  it('maps every catalog language sample to at least one font', () => {
    for (const [code, entry] of Object.entries(LANGUAGE_SCRIPT_MAP)) {
      const keys = detectRequiredFontKeys(entry.sample);
      // Pure WinAnsi Latin samples (en, fr, …) may need no Noto face.
      const needsNoto = [...collectScriptsInText(entry.sample)].some(
        (s) => s !== 'common' && s !== 'latin'
      ) || /[ĂăĄąĆćČčĎďĐđĘęĚěĹĺĽľŁłŃńŇňŐőŒœŔŕŘřŚśŠšŤťŮůŰűŹźŻżŽžẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẾếỀềỂểỄễỆệỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỨứỪừỬửỮữỰựạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/u.test(
        entry.sample
      );
      if (needsNoto) {
        expect(keys.size, `${code} ${entry.label}`).toBeGreaterThan(0);
      }
      for (const script of entry.scripts) {
        if (script === 'latin') continue;
        const key = scriptToFontKey(script === 'han_tc' ? 'han_tc' : script);
        if (key) expect(PDF_FONT_CATALOG[key]).toBeTruthy();
      }
    }
  });

  it('selects JP for Japanese kana + kanji', () => {
    const keys = detectRequiredFontKeys('こんにちは世界');
    expect(keys.has('noto_jp')).toBe(true);
    expect(keys.has('noto_sc')).toBe(false);
  });

  it('selects KR for Hangul', () => {
    const keys = detectRequiredFontKeys('안녕하세요');
    expect(keys.has('noto_kr')).toBe(true);
  });

  it('selects TC when Traditional markers appear', () => {
    const keys = detectRequiredFontKeys('繁體中文 匯出');
    expect(keys.has('noto_tc')).toBe(true);
  });
});

describe('rtlText', () => {
  it('reshapes Arabic letters into presentation forms', () => {
    const reshaped = reshapeArabic('سلام');
    expect(reshaped).not.toBe('سلام');
    expect(reshaped.length).toBeGreaterThan(0);
  });

  it('prepares Arabic for LTR drawing without throwing', () => {
    expect(() => prepareRtlArabic('مرحبا بالعالم')).not.toThrow();
    expect(prepareRtlArabic('مرحبا').length).toBeGreaterThan(0);
  });
});

describe('unicodePdfFont multilingual', () => {
  it('detects Unicode need and strips emoji', () => {
    expect(needsUnicodeFont('Hello')).toBe(false);
    expect(needsUnicodeFont('नमस्ते')).toBe(true);
    expect(needsUnicodeFont('Xin chào thế giới')).toBe(true);
    expect(sanitizePdfText('नमस्ते 🙏 दुनिया')).toBe('नमस्ते  दुनिया');
  });

  it('segments mixed English + Hindi + Arabic', () => {
    const runs = segmentPdfTextRuns('Hello नमस्ते مرحبا');
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs.some((r) => r.fontKey === 'noto_devanagari')).toBe(true);
    expect(runs.some((r) => r.fontKey === 'noto_arabic')).toBe(true);
    expect(runs.some((r) => r.fontKey === null && /Hello/.test(r.text))).toBe(true);
  });

  it('loads Devanagari + Arabic fonts and draws without throwing', async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const sample = 'Hello नमस्ते दुनिया مرحبا بالعالم 你好';
    await ensureUnicodePdfFonts(doc, sample);
    const registered = getRegisteredPdfFonts(doc);
    expect(registered).toContain('noto_devanagari');
    expect(registered).toContain('noto_arabic');

    const lines = wrapPdfText(doc, sample, 400);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => writePdfText(doc, line, 40, 60)).not.toThrow();
    }
    const data = doc.output('arraybuffer');
    expect(data.byteLength).toBeGreaterThan(5000);
  }, 60000);

  it('never registers Helvetica for Devanagari runs', async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await ensureUnicodePdfFonts(doc, 'हिंदी');
    const runs = segmentPdfTextRuns('हिंदी');
    expect(runs.every((r) => r.fontKey === 'noto_devanagari')).toBe(true);
  }, 30000);

  it('renders a smoke line for every LANGUAGE_SCRIPT_MAP entry', async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const allText = Object.values(LANGUAGE_SCRIPT_MAP)
      .map((e) => e.sample)
      .join('\n');
    const t0 = performance.now();
    await ensureUnicodePdfFonts(doc, allText);
    const loadMs = performance.now() - t0;

    let y = 40;
    doc.setFontSize(9);
    const t1 = performance.now();
    for (const entry of Object.values(LANGUAGE_SCRIPT_MAP)) {
      const line = `${entry.label}: ${entry.sample}`;
      const wrapped = wrapPdfText(doc, line, 500);
      for (const w of wrapped) {
        if (y > 780) {
          doc.addPage();
          y = 40;
        }
        expect(() => writePdfText(doc, w, 40, y)).not.toThrow();
        y += 12;
      }
    }
    const drawMs = performance.now() - t1;
    const buf = doc.output('arraybuffer');
    expect(buf.byteLength).toBeGreaterThan(50_000);
    // Soft perf budgets — CI machines vary; fail only on extreme regressions.
    expect(loadMs).toBeLessThan(120_000);
    expect(drawMs).toBeLessThan(30_000);
  }, 180000);
});

describe('markdown tables in PDF parser', () => {
  it('parses GFM tables', () => {
    const blocks = parseMarkdownBlocks(
      '| Lang | Sample |\n| --- | --- |\n| Hindi | नमस्ते |\n| Arabic | مرحبا |'
    );
    expect(blocks.some((b) => b.type === 'table')).toBe(true);
    const table = blocks.find((b) => b.type === 'table');
    if (table?.type === 'table') {
      expect(table.headers.length).toBe(2);
      expect(table.rows.length).toBe(2);
    }
  });
});
