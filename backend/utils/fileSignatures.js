import fs from "fs/promises";
import path from "path";

/**
 * Magic-byte / content sniffing for uploaded files.
 * Extension + MIME are checked earlier; this rejects spoofed binaries.
 */

function startsWithBytes(buf, bytes) {
  if (!buf || buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

function isAsciiPrintableOrWhitespace(byte) {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
}

/** UTF-8 / ASCII-ish text: allow BOM, reject dense NUL / control noise. */
function looksLikeText(buf) {
  if (!buf.length) return true;
  let offset = 0;
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) offset = 3;
  // UTF-16 LE/BE BOM — treat as text documents
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
    return true;
  }

  const sample = buf.subarray(offset, Math.min(buf.length, offset + 4096));
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) {
      suspicious += 4;
      continue;
    }
    // Allow high-bit UTF-8; flag low control chars.
    if (b < 0x08 || (b >= 0x0e && b < 0x20)) suspicious += 1;
  }
  return suspicious / sample.length < 0.08;
}

function isZipContainer(buf) {
  // Local file header or empty archive / spanned.
  return (
    startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(buf, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(buf, [0x50, 0x4b, 0x07, 0x08])
  );
}

function zipContainsPathHint(buf, hints) {
  // Lightweight scan of central/local headers for path fragments (no full unzip).
  const hay = buf.subarray(0, Math.min(buf.length, 512 * 1024)).toString("binary");
  return hints.some((h) => hay.includes(h));
}

/**
 * @param {Buffer} buf
 * @param {string} ext  e.g. ".pdf"
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateFileSignature(buf, ext) {
  const extension = String(ext || "").toLowerCase();

  switch (extension) {
    case ".png":
      if (!startsWithBytes(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { ok: false, error: "File content is not a valid PNG." };
      }
      return { ok: true };

    case ".jpg":
    case ".jpeg":
      if (!startsWithBytes(buf, [0xff, 0xd8, 0xff])) {
        return { ok: false, error: "File content is not a valid JPEG." };
      }
      return { ok: true };

    case ".webp":
      if (
        !startsWithBytes(buf, [0x52, 0x49, 0x46, 0x46]) ||
        buf.length < 12 ||
        buf.toString("ascii", 8, 12) !== "WEBP"
      ) {
        return { ok: false, error: "File content is not a valid WEBP." };
      }
      return { ok: true };

    case ".gif":
      if (!startsWithBytes(buf, [0x47, 0x49, 0x46, 0x38])) {
        return { ok: false, error: "File content is not a valid GIF." };
      }
      return { ok: true };

    case ".bmp":
      if (!startsWithBytes(buf, [0x42, 0x4d])) {
        return { ok: false, error: "File content is not a valid BMP." };
      }
      return { ok: true };

    case ".heic":
    case ".heif":
      // ISO Base Media File Format — ftyp box at offset 4.
      if (
        buf.length < 12 ||
        buf.toString("ascii", 4, 8) !== "ftyp"
      ) {
        return { ok: false, error: "File content is not a valid HEIC/HEIF." };
      }
      return { ok: true };

    case ".pdf":
      // Allow leading whitespace / BOM some exporters add.
      {
        const head = buf.subarray(0, Math.min(buf.length, 1024)).toString("latin1");
        if (!/%PDF-/.test(head)) {
          return { ok: false, error: "File content is not a valid PDF." };
        }
      }
      return { ok: true };

    case ".docx":
      if (!isZipContainer(buf)) {
        return { ok: false, error: "File content is not a valid DOCX." };
      }
      if (!zipContainsPathHint(buf, ["word/", "[Content_Types].xml"])) {
        return { ok: false, error: "File content is not a valid DOCX package." };
      }
      return { ok: true };

    case ".xlsx":
      if (!isZipContainer(buf)) {
        return { ok: false, error: "File content is not a valid XLSX." };
      }
      if (!zipContainsPathHint(buf, ["xl/", "[Content_Types].xml"])) {
        return { ok: false, error: "File content is not a valid XLSX package." };
      }
      return { ok: true };

    case ".xls":
      // OLE Compound Document
      if (!startsWithBytes(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
        return { ok: false, error: "File content is not a valid XLS." };
      }
      return { ok: true };

    case ".zip":
      if (!isZipContainer(buf)) {
        return { ok: false, error: "File content is not a valid ZIP archive." };
      }
      return { ok: true };

    case ".txt":
    case ".md":
    case ".markdown":
    case ".csv":
      if (!looksLikeText(buf)) {
        return { ok: false, error: "File content does not look like plain text." };
      }
      return { ok: true };

    default:
      return { ok: false, error: `Unsupported extension for signature check: ${extension || "(none)"}.` };
  }
}

/**
 * Read the start of a stored file and validate its signature against extension.
 */
export async function validateStoredFileSignature(absolutePath, originalName) {
  const ext = path.extname(originalName || absolutePath).toLowerCase();
  const handle = await fs.open(absolutePath, "r");
  try {
    const stat = await handle.stat();
    const size = Math.min(stat.size, 512 * 1024);
    const buf = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buf, 0, size, 0);
    return validateFileSignature(buf.subarray(0, bytesRead), ext);
  } finally {
    await handle.close();
  }
}
