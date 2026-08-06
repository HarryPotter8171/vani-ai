import mammoth from "mammoth";
import { ParseFailedError, normalizePlainText } from "./shared.js";

export const format = "docx";
export const extensions = [".docx"];
export const mimeTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Extract raw plain text from a DOCX buffer via mammoth. */
export async function parse(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: normalizePlainText(result?.value || "") };
  } catch (err) {
    throw new ParseFailedError(`Failed to parse DOCX: ${err.message}`, err);
  }
}
