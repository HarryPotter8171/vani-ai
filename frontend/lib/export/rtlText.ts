/**
 * Lightweight Arabic presentation-form reshaper for jsPDF.
 *
 * jsPDF does not run OpenType shaping, so isolated Arabic code points render
 * as disconnected letters. This maps letters to contextual presentation forms
 * (initial/medial/final/isolated) — good enough for readable PDF export of
 * Arabic / Persian / Urdu without a full HarfBuzz dependency.
 *
 * Hebrew only needs visual reordering (handled by bidiReorder).
 */

type Form = [isolated: number, final: number, initial: number, medial: number];

/** Common Arabic letters → [isolated, final, initial, medial]. 0 = no form. */
const FORMS: Record<number, Form> = {
  0x0621: [0xfe80, 0, 0, 0], // hamza
  0x0622: [0xfe81, 0xfe82, 0, 0], // alef madda
  0x0623: [0xfe83, 0xfe84, 0, 0], // alef hamza above
  0x0624: [0xfe85, 0xfe86, 0, 0], // waw hamza
  0x0625: [0xfe87, 0xfe88, 0, 0], // alef hamza below
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // yeh hamza
  0x0627: [0xfe8d, 0xfe8e, 0, 0], // alef
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // beh
  0x0629: [0xfe93, 0xfe94, 0, 0], // teh marbuta
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], // teh
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // theh
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // jeem
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], // hah
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], // khah
  0x062f: [0xfea9, 0xfeaa, 0, 0], // dal
  0x0630: [0xfeab, 0xfeac, 0, 0], // thal
  0x0631: [0xfead, 0xfeae, 0, 0], // reh
  0x0632: [0xfeaf, 0xfeb0, 0, 0], // zain
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // seen
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // sheen
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // sad
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], // dad
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], // tah
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], // zah
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], // ain
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0], // ghain
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], // feh
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], // qaf
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], // kaf
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], // lam
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], // meem
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8], // noon
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], // heh
  0x0648: [0xfeed, 0xfeee, 0, 0], // waw
  0x0649: [0xfeef, 0xfef0, 0, 0], // alef maksura
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4], // yeh
  // Persian / Urdu extras
  0x067e: [0xfb56, 0xfb57, 0xfb58, 0xfb59], // peh
  0x0686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], // tcheh
  0x0698: [0xfb8a, 0xfb8b, 0, 0], // jeh
  0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91], // keheh
  0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95], // gaf
  0x06cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff], // farsi yeh
  0x06d2: [0xfbae, 0xfbaf, 0, 0], // yeh barree
};

const TRANSPARENT = new Set([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0653,
  0x0654, 0x0655, 0x0656, 0x0657, 0x0658, 0x0670, 0x06d6, 0x06d7, 0x06d8,
  0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e3,
  0x06e4, 0x06e7, 0x06e8, 0x06ea, 0x06eb, 0x06ec, 0x06ed,
]);

function canConnect(cp: number): boolean {
  const f = FORMS[cp];
  return !!(f && f[2] && f[3]);
}

function nextLetter(chars: number[], i: number): number | null {
  for (let j = i + 1; j < chars.length; j++) {
    if (TRANSPARENT.has(chars[j])) continue;
    return chars[j];
  }
  return null;
}

function prevLetter(chars: number[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) {
    if (TRANSPARENT.has(chars[j])) continue;
    return chars[j];
  }
  return null;
}

/** Reshape a run of Arabic-script text into presentation forms. */
export function reshapeArabic(text: string): string {
  const chars: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp != null) chars.push(cp);
  }

  const out: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i];
    if (TRANSPARENT.has(cp) || !FORMS[cp]) {
      out.push(cp);
      continue;
    }

    const form = FORMS[cp];
    const prev = prevLetter(chars, i);
    const next = nextLetter(chars, i);
    const joinsPrev = prev != null && canConnect(prev) && FORMS[prev];
    const joinsNext = next != null && FORMS[next] != null && canConnect(cp);

    let mapped: number;
    if (joinsPrev && joinsNext && form[3]) mapped = form[3];
    else if (joinsPrev && form[1]) mapped = form[1];
    else if (joinsNext && form[2]) mapped = form[2];
    else mapped = form[0] || cp;

    out.push(mapped || cp);
  }

  return String.fromCodePoint(...out);
}

/**
 * Visual reorder for a single RTL run so LTR jsPDF paints correctly.
 * Mixed LTR digits inside RTL are kept in logical clusters via a simple
 * BiDi (base RTL) pass.
 */
export function bidiReorderRtl(text: string): string {
  // Split into RTL vs LTR/neutral runs, then reverse the overall order of
  // RTL-dominant output while keeping LTR digit/Latin islands intact.
  type Chunk = { text: string; rtl: boolean };
  const chunks: Chunk[] = [];
  let buf = '';
  let rtl: boolean | null = null;

  const isRtlChar = (cp: number) =>
    (cp >= 0x0590 && cp <= 0x05ff) ||
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff) ||
    (cp >= 0xfb1d && cp <= 0xfb4f);

  const isNeutral = (ch: string) => /[\s\d.,:;!?()[\]{}'"«»٪۰-۹٠-٩]/.test(ch);

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const charRtl: boolean = isRtlChar(cp)
      ? true
      : isNeutral(ch)
        ? rtl === true
        : false;

    if (rtl === null) {
      rtl = isRtlChar(cp) || !isNeutral(ch) ? isRtlChar(cp) : true;
      buf = ch;
      continue;
    }
    if (charRtl === rtl || isNeutral(ch)) {
      buf += ch;
    } else {
      chunks.push({ text: buf, rtl });
      buf = ch;
      rtl = charRtl;
    }
  }
  if (buf) chunks.push({ text: buf, rtl: rtl !== false });

  // For RTL base direction: reverse chunk order, reverse chars inside RTL chunks.
  const ordered = [...chunks].reverse();
  return ordered
    .map((c) => (c.rtl ? [...c.text].reverse().join('') : c.text))
    .join('');
}

/** Full Arabic/Persian/Urdu prep: reshape then visual-reorder. */
export function prepareRtlArabic(text: string): string {
  return bidiReorderRtl(reshapeArabic(text));
}

/** Hebrew: visual reorder only (no joining). */
export function prepareRtlHebrew(text: string): string {
  return bidiReorderRtl(text);
}
