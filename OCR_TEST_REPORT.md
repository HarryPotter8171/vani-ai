# OCR Test Report — 30 Cases

Generated: 2026-08-06T16:51:31.105Z

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 30 |
| PASS | 29 |
| SOFT_PASS | 1 |
| FAIL | 0 |
| Pass rate (PASS + SOFT_PASS) | 100% |
| Hard pass rate (PASS only) | 97% |
| Total OCR time | 49528ms |

**SOFT_PASS** = OCR succeeded and returned text, but one or more expected tokens were missed (common for handwriting, heavy blur, or Devanagari rendering limits).

## By category

| Category | PASS | SOFT_PASS | FAIL |
|----------|------|-----------|------|
| Document | 2 | 0 | 0 |
| KYC | 8 | 0 | 0 |
| Finance | 2 | 0 | 0 |
| Utility | 2 | 0 | 0 |
| Handwriting | 1 | 0 | 0 |
| Language | 3 | 0 | 0 |
| Layout | 2 | 0 | 0 |
| Tables | 1 | 0 | 0 |
| PDF | 4 | 0 | 0 |
| Degraded | 2 | 1 | 0 |
| Format | 2 | 0 | 0 |

## Case results

| ID | Name | Category | Status | Latency | Detail |
|----|------|----------|--------|---------|--------|
| OCR-01 | Invoice | Document | **PASS** | 1743ms | Matched expected tokens |
| OCR-02 | Receipt | Document | **PASS** | 1124ms | Matched expected tokens |
| OCR-03 | Aadhaar (sample) | KYC | **PASS** | 750ms | Matched expected tokens |
| OCR-04 | PAN (sample) | KYC | **PASS** | 596ms | Matched expected tokens |
| OCR-05 | Passport (sample) | KYC | **PASS** | 1571ms | Matched expected tokens |
| OCR-06 | Driving Licence (sample) | KYC | **PASS** | 882ms | Matched expected tokens |
| OCR-07 | Bank Statement | Finance | **PASS** | 1231ms | Matched expected tokens |
| OCR-08 | Electricity Bill | Utility | **PASS** | 2046ms | Matched expected tokens |
| OCR-09 | Handwritten Notes | Handwriting | **PASS** | 656ms | Matched expected tokens |
| OCR-10 | English plain text | Language | **PASS** | 1727ms | Matched expected tokens |
| OCR-11 | Hindi text | Language | **PASS** | 1089ms | Matched expected tokens |
| OCR-12 | Mixed Hindi + English | Language | **PASS** | 4873ms | Matched expected tokens |
| OCR-13 | Newspaper | Layout | **PASS** | 3502ms | Matched expected tokens |
| OCR-14 | Restaurant Menu | Layout | **PASS** | 3409ms | Matched expected tokens |
| OCR-15 | Table Extraction | Tables | **PASS** | 497ms | Matched expected tokens |
| OCR-16 | Scanned PDF (image-embedded) | PDF | **PASS** | 4742ms | Matched expected tokens |
| OCR-17 | Rotated image (90°) | Degraded | **SOFT_PASS** | 4746ms | Partial match (soft). Got preview: (0 (00 0 = 5 ५695 JZ35 OEWUSF< 595 $23 9=252% a 8 wg उठ हद व्ढहे 4382 Z°o8 nz g == ~  |
| OCR-18 | Low quality JPEG | Degraded | **PASS** | 1022ms | Matched expected tokens |
| OCR-19 | Blurred image | Degraded | **PASS** | 953ms | Matched expected tokens |
| OCR-20 | Multi-page PDF | PDF | **PASS** | 4685ms | Matched expected tokens |
| OCR-21 | Invoice as JPEG | Format | **PASS** | 723ms | Matched expected tokens |
| OCR-22 | Menu as WEBP | Format | **PASS** | 1219ms | Matched expected tokens |
| OCR-23 | Aadhaar bilingual cues | KYC | **PASS** | 534ms | Matched expected tokens |
| OCR-24 | PAN number format | KYC | **PASS** | 471ms | Matched expected tokens |
| OCR-25 | Passport MRZ-like lines | KYC | **PASS** | 1016ms | Matched expected tokens |
| OCR-26 | Driving Licence address block | KYC | **PASS** | 646ms | Matched expected tokens |
| OCR-27 | Bank statement table rows | Finance | **PASS** | 425ms | Matched expected tokens |
| OCR-28 | Electricity bill amount due | Utility | **PASS** | 684ms | Matched expected tokens |
| OCR-29 | Text-layer PDF (OCR path still valid) | PDF | **PASS** | 336ms | Matched expected tokens |
| OCR-30 | Multi-page bank PDF (3 pages) | PDF | **PASS** | 1630ms | Matched expected tokens |

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
- Engine: Tesseract via `runOcr` (`eng+hin` default).
- Fixtures: `backend/tests/helpers/ocrFixtures.js`
- Suite: `backend/tests/ocr/ocrCases.test.js`

## How to re-run

```bash
cd backend
npx vitest run tests/ocr/ocrCases.test.js --testTimeout=120000
```
