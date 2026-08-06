# Multilingual PDF Export — Compatibility Report

**Date:** 2026-08-04  
**Scope:** Chat, Canvas, Research, Analytics PDF exports (client-side jsPDF)  
**Sample:** `frontend/tmp/multilingual-unicode-sample.pdf` (also under `lib/export/fonts/verification/`)

## Verdict

Production-grade worldwide multilingual PDF export is implemented: Unicode scripts are auto-detected, matching Noto faces are lazy-loaded from `/fonts/pdf`, mixed-language lines switch fonts per run, Helvetica is never used for non-WinAnsi text, and emoji are stripped safely. Automated tests cover script detection, RTL prep, font registration, and a full language-map smoke render.

## Fonts used

| Family | File | Scripts |
|--------|------|---------|
| NotoSans | `NotoSans-Regular.ttf` | Latin Extended, Greek, Cyrillic |
| NotoSansDevanagari | `NotoSansDevanagari-Regular.ttf` | Hindi, Sanskrit, Marathi, Nepali |
| NotoSansGujarati | … | Gujarati |
| NotoSansGurmukhi | … | Punjabi (Gurmukhi) |
| NotoSansBengali | … | Bengali, Assamese |
| NotoSansOriya | … | Odia |
| NotoSansTamil / Telugu / Kannada / Malayalam | … | Dravidian scripts |
| NotoSansArabic | … | Arabic, Persian (Farsi), Urdu |
| NotoSansHebrew | … | Hebrew |
| NotoSansThai | … | Thai |
| NotoSansSC / TC / JP / KR | Variable TTF subsets | Chinese Simplified / Traditional, Japanese, Korean |
| NotoSansEthiopic | … | Amharic |
| NotoSansSinhala | … | Sinhala |
| NotoSansMyanmar | … | Burmese |
| NotoSansKhmer / Lao | … | Khmer, Lao |
| NotoSansMongolian | … | Mongolian |
| NotoSerifTibetan | `NotoSerifTibetan-Regular.ttf` | Tibetan (no Sans Regular upstream) |

WinAnsi-safe Latin (ASCII + Western European) still uses Helvetica/Courier for body/code metrics; everything else uses Noto.

## Scripts / languages supported

All languages listed in the request are covered via `LANGUAGE_SCRIPT_MAP` (59 entries), including:

- Indic: Hindi, Sanskrit, Marathi, Gujarati, Punjabi, Bengali, Assamese, Odia, Tamil, Telugu, Kannada, Malayalam, Nepali, Sinhala  
- Middle East: Arabic, Persian, Urdu, Hebrew  
- CJK: Chinese Simplified/Traditional, Japanese, Korean  
- SEA: Thai, Vietnamese, Burmese, Khmer, Lao, Indonesian, Malay, Filipino  
- Europe: Latin, Greek, Cyrillic families (Russian, Ukrainian, Serbian, Bulgarian, Polish, Czech, …)  
- Other: Amharic, Mongolian, Tibetan, Swahili, Icelandic, …

## Unsupported / limited

| Area | Limitation |
|------|------------|
| Full OpenType shaping | jsPDF has no HarfBuzz; complex Indic conjuncts / Khmer clusters may look suboptimal |
| Arabic RTL | Presentation-form reshape + visual BiDi (readable; not full Unicode BiDi) |
| Vertical Mongolian | Drawn LTR horizontally |
| Emoji | Stripped (never crash); not rendered as color glyphs |
| Variable CJK fonts | Noto CJK Variable TTF subsets work; CFF OTFs do **not** (encode errors) |

No major world script from the requirement list is left without a font.

## Bundle size impact

| Metric | Value |
|--------|-------|
| JS bundle (fonts) | **~0** — fonts are static assets under `public/fonts/pdf`, lazy-loaded |
| Prior Devanagari base64 in JS | ~286 KB removed from the export path |
| Disk / deploy assets | **~51.2 MB** (24 files; ~47 MB is CJK) |
| Sample PDF (all languages) | ~4.1 MB (embeds only fonts used in that doc) |

Only scripts present in a given export are fetched and embedded.

## Rendering performance (measured)

From `generateMultilingualPdfSample.mts` (all 59 language samples):

| Step | Time |
|------|------|
| Font load + register | ~500 ms |
| Draw all lines | ~50 ms |
| Unit smoke (`multilingualPdf.test.ts`) | ~2 s total suite |

CJK-heavy first loads dominate; subsequent exports reuse the in-memory base64 cache.

## Applied exporters

| Surface | Wiring |
|---------|--------|
| Chat | `exportConversationToPdf` → async `ensureUnicodePdfFonts(corpus)` |
| Canvas | `exportCanvas('pdf')` → same |
| Research | `downloadResearchPdf` → same |
| Analytics | `exportAnalyticsPdf` → same |

Markdown tables are parsed and drawn in Chat/Research PDFs; bullets, code blocks, and pagination preserved.

## Test suite

```bash
cd frontend
npm test -- tests/unit/export/multilingualPdf.test.ts tests/unit/export/unicodePdfFont.test.ts
npm run fonts:pdf          # refresh Noto assets
npm run sample:pdf-i18n    # regenerate worldwide sample PDF
```

- `multilingualPdf.test.ts` — script detection, RTL, all-language smoke, GFM tables  
- `unicodePdfFont.test.ts` — Devanagari / API regression  

## How to refresh fonts

```bash
bash frontend/scripts/downloadPdfFonts.sh
```
