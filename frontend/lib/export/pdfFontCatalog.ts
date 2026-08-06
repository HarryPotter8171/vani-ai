/**
 * Unicode script ranges → PDF font family keys.
 *
 * Coverage targets the major world writing systems used in VANI PDF exports.
 * Ranges follow the Unicode Standard (simplified contiguous blocks).
 */

export type PdfScriptId =
  | 'latin'
  | 'devanagari'
  | 'gujarati'
  | 'gurmukhi'
  | 'bengali'
  | 'oriya'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'arabic'
  | 'hebrew'
  | 'cyrillic'
  | 'greek'
  | 'thai'
  | 'han_sc'
  | 'han_tc'
  | 'hiragana'
  | 'katakana'
  | 'hangul'
  | 'ethiopic'
  | 'sinhala'
  | 'myanmar'
  | 'khmer'
  | 'lao'
  | 'mongolian'
  | 'tibetan'
  | 'common'
  | 'unknown';

export type PdfFontKey =
  | 'noto_sans'
  | 'noto_devanagari'
  | 'noto_gujarati'
  | 'noto_gurmukhi'
  | 'noto_bengali'
  | 'noto_oriya'
  | 'noto_tamil'
  | 'noto_telugu'
  | 'noto_kannada'
  | 'noto_malayalam'
  | 'noto_arabic'
  | 'noto_hebrew'
  | 'noto_thai'
  | 'noto_sc'
  | 'noto_tc'
  | 'noto_jp'
  | 'noto_kr'
  | 'noto_ethiopic'
  | 'noto_sinhala'
  | 'noto_myanmar'
  | 'noto_khmer'
  | 'noto_lao'
  | 'noto_mongolian'
  | 'noto_tibetan';

export interface PdfFontDef {
  key: PdfFontKey;
  family: string;
  file: string;
  /** Relative URL under the app origin (served from /public). */
  publicPath: string;
  rtl?: boolean;
  scripts: PdfScriptId[];
}

/** Contiguous inclusive Unicode ranges for script detection. */
const SCRIPT_RANGES: Array<{ script: PdfScriptId; from: number; to: number }> = [
  // Latin Extended / Vietnamese / Central European etc.
  { script: 'latin', from: 0x0100, to: 0x024f },
  { script: 'latin', from: 0x1e00, to: 0x1eff },
  { script: 'latin', from: 0xa720, to: 0xa7ff },
  { script: 'latin', from: 0xab30, to: 0xab6f },

  { script: 'greek', from: 0x0370, to: 0x03ff },
  { script: 'greek', from: 0x1f00, to: 0x1fff },

  { script: 'cyrillic', from: 0x0400, to: 0x04ff },
  { script: 'cyrillic', from: 0x0500, to: 0x052f },
  { script: 'cyrillic', from: 0x2de0, to: 0x2dff },
  { script: 'cyrillic', from: 0xa640, to: 0xa69f },

  { script: 'hebrew', from: 0x0590, to: 0x05ff },
  { script: 'hebrew', from: 0xfb1d, to: 0xfb4f },

  { script: 'arabic', from: 0x0600, to: 0x06ff },
  { script: 'arabic', from: 0x0750, to: 0x077f },
  { script: 'arabic', from: 0x08a0, to: 0x08ff },
  { script: 'arabic', from: 0xfb50, to: 0xfdff },
  { script: 'arabic', from: 0xfe70, to: 0xfeff },

  { script: 'devanagari', from: 0x0900, to: 0x097f },
  { script: 'devanagari', from: 0xa8e0, to: 0xa8ff },

  { script: 'bengali', from: 0x0980, to: 0x09ff },
  { script: 'gurmukhi', from: 0x0a00, to: 0x0a7f },
  { script: 'gujarati', from: 0x0a80, to: 0x0aff },
  { script: 'oriya', from: 0x0b00, to: 0x0b7f },
  { script: 'tamil', from: 0x0b80, to: 0x0bff },
  { script: 'telugu', from: 0x0c00, to: 0x0c7f },
  { script: 'kannada', from: 0x0c80, to: 0x0cff },
  { script: 'malayalam', from: 0x0d00, to: 0x0d7f },
  { script: 'sinhala', from: 0x0d80, to: 0x0dff },
  { script: 'thai', from: 0x0e00, to: 0x0e7f },
  { script: 'lao', from: 0x0e80, to: 0x0eff },
  { script: 'tibetan', from: 0x0f00, to: 0x0fff },
  { script: 'myanmar', from: 0x1000, to: 0x109f },
  { script: 'myanmar', from: 0xaa60, to: 0xaa7f },
  { script: 'ethiopic', from: 0x1200, to: 0x137f },
  { script: 'ethiopic', from: 0x1380, to: 0x139f },
  { script: 'ethiopic', from: 0x2d80, to: 0x2ddf },
  { script: 'ethiopic', from: 0xab00, to: 0xab2f },

  { script: 'mongolian', from: 0x1800, to: 0x18af },

  { script: 'khmer', from: 0x1780, to: 0x17ff },
  { script: 'khmer', from: 0x19e0, to: 0x19ff },

  { script: 'hiragana', from: 0x3040, to: 0x309f },
  { script: 'katakana', from: 0x30a0, to: 0x30ff },
  { script: 'katakana', from: 0x31f0, to: 0x31ff },
  { script: 'hangul', from: 0x1100, to: 0x11ff },
  { script: 'hangul', from: 0x3130, to: 0x318f },
  { script: 'hangul', from: 0xac00, to: 0xd7af },
  { script: 'hangul', from: 0xa960, to: 0xa97f },
  { script: 'hangul', from: 0xd7b0, to: 0xd7ff },

  // CJK Unified Ideographs — default to Simplified; TC/JP pickers refine via context.
  { script: 'han_sc', from: 0x4e00, to: 0x9fff },
  { script: 'han_sc', from: 0x3400, to: 0x4dbf },
  { script: 'han_sc', from: 0xf900, to: 0xfaff },
  { script: 'han_sc', from: 0x3000, to: 0x303f }, // CJK punctuation
  { script: 'han_sc', from: 0xff00, to: 0xffef }, // fullwidth forms
];

/** Common / punctuation that may ride with either Latin or Unicode fonts. */
function isCommonNeutral(cp: number): boolean {
  if (cp <= 0x7f) return true; // ASCII
  if (cp >= 0xa0 && cp <= 0xff) return true; // Latin-1 Supplement (WinAnsi-ish)
  if (cp >= 0x2000 && cp <= 0x206f) return true; // general punctuation
  if (cp >= 0x20a0 && cp <= 0x20cf) return true; // currency
  if (cp >= 0x2100 && cp <= 0x214f) return true; // letterlike
  if (cp >= 0x2190 && cp <= 0x21ff) return true; // arrows
  if (cp >= 0x2200 && cp <= 0x22ff) return true; // math
  return false;
}

/**
 * WinAnsi / Helvetica can paint these code points safely.
 * Everything else must use an embedded Noto face — never Helvetica.
 */
export function isHelveticaSafe(cp: number): boolean {
  if (cp >= 0x20 && cp <= 0x7e) return true;
  // Common WinAnsi extras used in Western European PDFs
  const winAnsiExtras = new Set([
    0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac,
    0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba,
    0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
    0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4,
    0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf, 0xe0, 0xe1,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xee,
    0xef, 0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xfb,
    0xfc, 0xfd, 0xfe, 0xff,
    // Typographic punctuation often remapped by jsPDF
    0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac,
  ]);
  return winAnsiExtras.has(cp);
}

export function detectScript(cp: number): PdfScriptId {
  if (isCommonNeutral(cp) || isHelveticaSafe(cp)) return 'common';
  for (const range of SCRIPT_RANGES) {
    if (cp >= range.from && cp <= range.to) return range.script;
  }
  return 'unknown';
}

/**
 * Map a detected script to the font that can render it.
 * Japanese kana → JP; Hangul → KR; Han ideographs → SC by default
 * (TC is selected when Traditional-only characters or explicit hint appear).
 */
export function scriptToFontKey(script: PdfScriptId): PdfFontKey | null {
  switch (script) {
    case 'latin':
    case 'greek':
    case 'cyrillic':
      return 'noto_sans';
    case 'devanagari':
      return 'noto_devanagari';
    case 'gujarati':
      return 'noto_gujarati';
    case 'gurmukhi':
      return 'noto_gurmukhi';
    case 'bengali':
      return 'noto_bengali';
    case 'oriya':
      return 'noto_oriya';
    case 'tamil':
      return 'noto_tamil';
    case 'telugu':
      return 'noto_telugu';
    case 'kannada':
      return 'noto_kannada';
    case 'malayalam':
      return 'noto_malayalam';
    case 'arabic':
      return 'noto_arabic';
    case 'hebrew':
      return 'noto_hebrew';
    case 'thai':
      return 'noto_thai';
    case 'han_sc':
      return 'noto_sc';
    case 'han_tc':
      return 'noto_tc';
    case 'hiragana':
    case 'katakana':
      return 'noto_jp';
    case 'hangul':
      return 'noto_kr';
    case 'ethiopic':
      return 'noto_ethiopic';
    case 'sinhala':
      return 'noto_sinhala';
    case 'myanmar':
      return 'noto_myanmar';
    case 'khmer':
      return 'noto_khmer';
    case 'lao':
      return 'noto_lao';
    case 'mongolian':
      return 'noto_mongolian';
    case 'tibetan':
      return 'noto_tibetan';
    case 'common':
    case 'unknown':
      return null;
  }
}

export const PDF_FONT_CATALOG: Record<PdfFontKey, PdfFontDef> = {
  noto_sans: {
    key: 'noto_sans',
    family: 'NotoSans',
    file: 'NotoSans-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSans-Regular.ttf',
    scripts: ['latin', 'greek', 'cyrillic'],
  },
  noto_devanagari: {
    key: 'noto_devanagari',
    family: 'NotoSansDevanagari',
    file: 'NotoSansDevanagari-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansDevanagari-Regular.ttf',
    scripts: ['devanagari'],
  },
  noto_gujarati: {
    key: 'noto_gujarati',
    family: 'NotoSansGujarati',
    file: 'NotoSansGujarati-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansGujarati-Regular.ttf',
    scripts: ['gujarati'],
  },
  noto_gurmukhi: {
    key: 'noto_gurmukhi',
    family: 'NotoSansGurmukhi',
    file: 'NotoSansGurmukhi-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansGurmukhi-Regular.ttf',
    scripts: ['gurmukhi'],
  },
  noto_bengali: {
    key: 'noto_bengali',
    family: 'NotoSansBengali',
    file: 'NotoSansBengali-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansBengali-Regular.ttf',
    scripts: ['bengali'],
  },
  noto_oriya: {
    key: 'noto_oriya',
    family: 'NotoSansOriya',
    file: 'NotoSansOriya-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansOriya-Regular.ttf',
    scripts: ['oriya'],
  },
  noto_tamil: {
    key: 'noto_tamil',
    family: 'NotoSansTamil',
    file: 'NotoSansTamil-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansTamil-Regular.ttf',
    scripts: ['tamil'],
  },
  noto_telugu: {
    key: 'noto_telugu',
    family: 'NotoSansTelugu',
    file: 'NotoSansTelugu-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansTelugu-Regular.ttf',
    scripts: ['telugu'],
  },
  noto_kannada: {
    key: 'noto_kannada',
    family: 'NotoSansKannada',
    file: 'NotoSansKannada-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansKannada-Regular.ttf',
    scripts: ['kannada'],
  },
  noto_malayalam: {
    key: 'noto_malayalam',
    family: 'NotoSansMalayalam',
    file: 'NotoSansMalayalam-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansMalayalam-Regular.ttf',
    scripts: ['malayalam'],
  },
  noto_arabic: {
    key: 'noto_arabic',
    family: 'NotoSansArabic',
    file: 'NotoSansArabic-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansArabic-Regular.ttf',
    rtl: true,
    scripts: ['arabic'],
  },
  noto_hebrew: {
    key: 'noto_hebrew',
    family: 'NotoSansHebrew',
    file: 'NotoSansHebrew-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansHebrew-Regular.ttf',
    rtl: true,
    scripts: ['hebrew'],
  },
  noto_thai: {
    key: 'noto_thai',
    family: 'NotoSansThai',
    file: 'NotoSansThai-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansThai-Regular.ttf',
    scripts: ['thai'],
  },
  noto_sc: {
    key: 'noto_sc',
    family: 'NotoSansSC',
    file: 'NotoSansSC-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansSC-Regular.ttf',
    scripts: ['han_sc'],
  },
  noto_tc: {
    key: 'noto_tc',
    family: 'NotoSansTC',
    file: 'NotoSansTC-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansTC-Regular.ttf',
    scripts: ['han_tc'],
  },
  noto_jp: {
    key: 'noto_jp',
    family: 'NotoSansJP',
    file: 'NotoSansJP-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansJP-Regular.ttf',
    scripts: ['hiragana', 'katakana', 'han_sc'],
  },
  noto_kr: {
    key: 'noto_kr',
    family: 'NotoSansKR',
    file: 'NotoSansKR-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansKR-Regular.ttf',
    scripts: ['hangul'],
  },
  noto_ethiopic: {
    key: 'noto_ethiopic',
    family: 'NotoSansEthiopic',
    file: 'NotoSansEthiopic-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansEthiopic-Regular.ttf',
    scripts: ['ethiopic'],
  },
  noto_sinhala: {
    key: 'noto_sinhala',
    family: 'NotoSansSinhala',
    file: 'NotoSansSinhala-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansSinhala-Regular.ttf',
    scripts: ['sinhala'],
  },
  noto_myanmar: {
    key: 'noto_myanmar',
    family: 'NotoSansMyanmar',
    file: 'NotoSansMyanmar-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansMyanmar-Regular.ttf',
    scripts: ['myanmar'],
  },
  noto_khmer: {
    key: 'noto_khmer',
    family: 'NotoSansKhmer',
    file: 'NotoSansKhmer-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansKhmer-Regular.ttf',
    scripts: ['khmer'],
  },
  noto_lao: {
    key: 'noto_lao',
    family: 'NotoSansLao',
    file: 'NotoSansLao-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansLao-Regular.ttf',
    scripts: ['lao'],
  },
  noto_mongolian: {
    key: 'noto_mongolian',
    family: 'NotoSansMongolian',
    file: 'NotoSansMongolian-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSansMongolian-Regular.ttf',
    scripts: ['mongolian'],
  },
  noto_tibetan: {
    key: 'noto_tibetan',
    // Upstream ships Tibetan as Noto Serif (no Sans Regular in noto-fonts).
    family: 'NotoSerifTibetan',
    file: 'NotoSerifTibetan-Regular.ttf',
    publicPath: '/fonts/pdf/NotoSerifTibetan-Regular.ttf',
    scripts: ['tibetan'],
  },
};

/**
 * Languages → expected primary script(s) for documentation / sample PDF.
 */
export const LANGUAGE_SCRIPT_MAP: Record<
  string,
  { label: string; scripts: PdfScriptId[]; sample: string }
> = {
  en: { label: 'English', scripts: ['latin'], sample: 'Hello, world — PDF export works.' },
  hi: { label: 'Hindi', scripts: ['devanagari'], sample: 'नमस्ते दुनिया — पीडीएफ निर्यात।' },
  sa: { label: 'Sanskrit', scripts: ['devanagari'], sample: 'संस्कृतम् अस्ति। ॐ शान्तिः।' },
  mr: { label: 'Marathi', scripts: ['devanagari'], sample: 'नमस्कार, मराठी मजकूर.' },
  gu: { label: 'Gujarati', scripts: ['gujarati'], sample: 'નમસ્તે, ગુજરાતી લખાણ.' },
  pa: { label: 'Punjabi (Gurmukhi)', scripts: ['gurmukhi'], sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਪੰਜਾਬੀ ਲਿਖਤ।' },
  bn: { label: 'Bengali', scripts: ['bengali'], sample: 'নমস্কার, বাংলা লেখা।' },
  as: { label: 'Assamese', scripts: ['bengali'], sample: 'নমস্কাৰ, অসমীয়া লিখন।' },
  or: { label: 'Odia', scripts: ['oriya'], sample: 'ନମସ୍କାର, ଓଡ଼ିଆ ଲେଖା।' },
  ta: { label: 'Tamil', scripts: ['tamil'], sample: 'வணக்கம், தமிழ் உரை.' },
  te: { label: 'Telugu', scripts: ['telugu'], sample: 'నమస్కారం, తెలుగు పాఠం.' },
  kn: { label: 'Kannada', scripts: ['kannada'], sample: 'ನಮಸ್ಕಾರ, ಕನ್ನಡ ಪಠ್ಯ.' },
  ml: { label: 'Malayalam', scripts: ['malayalam'], sample: 'നമസ്കാരം, മലയാളം എഴുത്ത്.' },
  ur: { label: 'Urdu', scripts: ['arabic'], sample: 'السلام علیکم، اردو متن۔' },
  ar: { label: 'Arabic', scripts: ['arabic'], sample: 'مرحبا بالعالم — تصدير PDF.' },
  fa: { label: 'Persian (Farsi)', scripts: ['arabic'], sample: 'سلام دنیا — خروجی PDF.' },
  he: { label: 'Hebrew', scripts: ['hebrew'], sample: 'שלום עולם — ייצוא PDF.' },
  ru: { label: 'Russian', scripts: ['cyrillic'], sample: 'Привет, мир — экспорт PDF.' },
  uk: { label: 'Ukrainian', scripts: ['cyrillic'], sample: 'Привіт, світ — експорт PDF.' },
  el: { label: 'Greek', scripts: ['greek'], sample: 'Γεια σου κόσμε — εξαγωγή PDF.' },
  zh_Hans: { label: 'Chinese Simplified', scripts: ['han_sc'], sample: '你好，世界 — PDF 导出。' },
  zh_Hant: { label: 'Chinese Traditional', scripts: ['han_tc'], sample: '你好，世界 — PDF 匯出。' },
  ja: { label: 'Japanese', scripts: ['hiragana', 'katakana', 'han_sc'], sample: 'こんにちは世界 — PDF出力。' },
  ko: { label: 'Korean', scripts: ['hangul'], sample: '안녕하세요 — PDF 내보내기.' },
  th: { label: 'Thai', scripts: ['thai'], sample: 'สวัสดีโลก — ส่งออก PDF' },
  vi: { label: 'Vietnamese', scripts: ['latin'], sample: 'Xin chào thế giới — xuất PDF.' },
  tr: { label: 'Turkish', scripts: ['latin'], sample: 'Merhaba dünya — PDF dışa aktarma.' },
  id: { label: 'Indonesian', scripts: ['latin'], sample: 'Halo dunia — ekspor PDF.' },
  ms: { label: 'Malay', scripts: ['latin'], sample: 'Halo dunia — eksport PDF.' },
  fil: { label: 'Filipino', scripts: ['latin'], sample: 'Kumusta mundo — export ng PDF.' },
  fr: { label: 'French', scripts: ['latin'], sample: 'Bonjour le monde — export PDF.' },
  de: { label: 'German', scripts: ['latin'], sample: 'Hallo Welt — PDF-Export.' },
  es: { label: 'Spanish', scripts: ['latin'], sample: 'Hola mundo — exportación PDF.' },
  pt: { label: 'Portuguese', scripts: ['latin'], sample: 'Olá mundo — exportação PDF.' },
  it: { label: 'Italian', scripts: ['latin'], sample: 'Ciao mondo — esportazione PDF.' },
  nl: { label: 'Dutch', scripts: ['latin'], sample: 'Hallo wereld — PDF-export.' },
  pl: { label: 'Polish', scripts: ['latin'], sample: 'Witaj świecie — eksport PDF.' },
  cs: { label: 'Czech', scripts: ['latin'], sample: 'Ahoj světe — export PDF.' },
  sk: { label: 'Slovak', scripts: ['latin'], sample: 'Ahoj svet — export PDF.' },
  hu: { label: 'Hungarian', scripts: ['latin'], sample: 'Helló világ — PDF export.' },
  ro: { label: 'Romanian', scripts: ['latin'], sample: 'Bună lume — export PDF.' },
  sr: { label: 'Serbian', scripts: ['cyrillic'], sample: 'Здраво свете — PDF извоз.' },
  hr: { label: 'Croatian', scripts: ['latin'], sample: 'Pozdrav svijete — izvoz PDF.' },
  bs: { label: 'Bosnian', scripts: ['latin'], sample: 'Zdravo svijete — izvoz PDF.' },
  bg: { label: 'Bulgarian', scripts: ['cyrillic'], sample: 'Здравей свят — PDF експорт.' },
  fi: { label: 'Finnish', scripts: ['latin'], sample: 'Hei maailma — PDF-vienti.' },
  sv: { label: 'Swedish', scripts: ['latin'], sample: 'Hej världen — PDF-export.' },
  no: { label: 'Norwegian', scripts: ['latin'], sample: 'Hei verden — PDF-eksport.' },
  da: { label: 'Danish', scripts: ['latin'], sample: 'Hej verden — PDF-eksport.' },
  is: { label: 'Icelandic', scripts: ['latin'], sample: 'Halló heimur — PDF útflutningur.' },
  sw: { label: 'Swahili', scripts: ['latin'], sample: 'Habari dunia — hamisha PDF.' },
  am: { label: 'Amharic', scripts: ['ethiopic'], sample: 'ሰላም ዓለም — የ PDF ወጪ።' },
  si: { label: 'Sinhala', scripts: ['sinhala'], sample: 'ආයුබෝවන් — PDF අපනයනය.' },
  ne: { label: 'Nepali', scripts: ['devanagari'], sample: 'नमस्ते संसार — PDF निर्यात।' },
  my: { label: 'Burmese', scripts: ['myanmar'], sample: 'မင်္ဂလာပါ — PDF ထုတ်ယူခြင်း။' },
  km: { label: 'Khmer', scripts: ['khmer'], sample: 'សួស្តី​ពិភពលោក — នាំចេញ PDF។' },
  lo: { label: 'Lao', scripts: ['lao'], sample: 'ສະບາຍດີໂລກ — ສົ່ງອອກ PDF.' },
  mn: { label: 'Mongolian', scripts: ['mongolian'], sample: 'Сайн байна уу — PDF экспорт. ᠰᠠᠶᠢᠨ ᠪᠠᠶᠢᠨ᠎ᠠ।' },
  bo: { label: 'Tibetan', scripts: ['tibetan'], sample: 'བཀྲ་ཤིས་བདེ་ལེགས། — PDF ཕྱིར་འདྲེན།' },
};

/** Traditional Chinese marker characters (rarely in SC texts). */
const TRADITIONAL_MARKERS = /[繁體臺灣澳門發揮個們這來說時會過還為對匯齣與門開關]/u;

/**
 * Detect which font keys are required to render `text`.
 * When Japanese kana appear, prefer JP for nearby Han; Hangul → KR;
 * Traditional markers → TC.
 */
export function detectRequiredFontKeys(text: string): Set<PdfFontKey> {
  const keys = new Set<PdfFontKey>();
  const input = String(text || '');
  let hasKana = false;
  let hasHangul = false;
  let hasHan = false;
  let preferTc = TRADITIONAL_MARKERS.test(input);

  for (const ch of input) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (isHelveticaSafe(cp)) continue;
    const script = detectScript(cp);
    if (script === 'hiragana' || script === 'katakana') hasKana = true;
    if (script === 'hangul') hasHangul = true;
    if (script === 'han_sc' || script === 'han_tc') hasHan = true;
    const key = scriptToFontKey(script === 'han_sc' && preferTc ? 'han_tc' : script);
    if (key) keys.add(key);
  }

  // Refine CJK: kana ⇒ JP covers Han too; Hangul-only docs keep KR.
  if (hasKana) {
    keys.add('noto_jp');
    keys.delete('noto_sc');
    keys.delete('noto_tc');
  } else if (preferTc && hasHan) {
    keys.add('noto_tc');
    keys.delete('noto_sc');
  } else if (hasHangul && !hasHan) {
    // hangul only
  } else if (hasHan && !hasKana) {
    if (preferTc) keys.add('noto_tc');
    else keys.add('noto_sc');
  }

  // Latin-extended / Greek / Cyrillic need Noto Sans (not Helvetica).
  for (const ch of input) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (!isHelveticaSafe(cp)) {
      const script = detectScript(cp);
      if (script === 'latin' || script === 'greek' || script === 'cyrillic') {
        keys.add('noto_sans');
      }
    }
  }

  return keys;
}

export function collectScriptsInText(text: string): Set<PdfScriptId> {
  const scripts = new Set<PdfScriptId>();
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    scripts.add(detectScript(cp));
  }
  return scripts;
}
