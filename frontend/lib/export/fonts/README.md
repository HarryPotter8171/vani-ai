# PDF export fonts (multilingual)

Google **Noto** faces used by the shared Unicode PDF layer
(`lib/export/unicodePdfFont.ts`). Served from `public/fonts/pdf/` and
**lazy-loaded per export** based on automatic Unicode script detection — they
are **not** inlined into the JS bundle.

| File | Scripts |
|------|---------|
| `NotoSans-Regular.ttf` | Latin Extended, Greek, Cyrillic (Vietnamese, Polish, Russian, …) |
| `NotoSansDevanagari-Regular.ttf` | Hindi, Sanskrit, Marathi, Nepali |
| `NotoSansGujarati-Regular.ttf` | Gujarati |
| `NotoSansGurmukhi-Regular.ttf` | Punjabi (Gurmukhi) |
| `NotoSansBengali-Regular.ttf` | Bengali, Assamese |
| `NotoSansOriya-Regular.ttf` | Odia |
| `NotoSansTamil-Regular.ttf` | Tamil |
| `NotoSansTelugu-Regular.ttf` | Telugu |
| `NotoSansKannada-Regular.ttf` | Kannada |
| `NotoSansMalayalam-Regular.ttf` | Malayalam |
| `NotoSansArabic-Regular.ttf` | Arabic, Persian, Urdu |
| `NotoSansHebrew-Regular.ttf` | Hebrew |
| `NotoSansThai-Regular.ttf` | Thai |
| `NotoSansSC/TC/JP/KR-Regular.ttf` | Chinese Simplified/Traditional, Japanese, Korean (Noto CJK Variable TTF subsets — jsPDF-compatible) |
| `NotoSansEthiopic-Regular.ttf` | Amharic |
| `NotoSansSinhala-Regular.ttf` | Sinhala |
| `NotoSansMyanmar-Regular.ttf` | Burmese |
| `NotoSansKhmer-Regular.ttf` | Khmer |
| `NotoSansLao-Regular.ttf` | Lao |
| `NotoSansMongolian-Regular.ttf` | Mongolian |
| `NotoSerifTibetan-Regular.ttf` | Tibetan (Serif — no Sans Regular upstream) |

License: SIL Open Font License 1.1 (Google Noto)  
Upstream: https://github.com/googlefonts/noto-fonts · https://github.com/googlefonts/noto-cjk

## Download / refresh

```bash
# From frontend/
bash scripts/downloadPdfFonts.sh
```

CJK subset OTFs are large (~5–8 MB each). They are only fetched into the PDF
when the exported document contains those scripts.

## Legacy base64 module

`NotoSansDevanagari-Regular.base64.ts` is obsolete for new exports (kept only
if referenced elsewhere). Prefer files under `public/fonts/pdf/`.
