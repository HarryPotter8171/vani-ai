import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "../../config/upload.js";

const CACHE_SUFFIX = ".understand.json";

function cachePathFor(id) {
  return path.join(UPLOADS_DIR, `${id}${CACHE_SUFFIX}`);
}

/** Load a previously computed understanding result, if present. */
export async function readUnderstandingCache(id) {
  try {
    const raw = await fs.readFile(cachePathFor(id), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Persist understanding beside the upload binary for reuse (RAG / Agents). */
export async function writeUnderstandingCache(id, result) {
  await fs.writeFile(cachePathFor(id), JSON.stringify(result, null, 2), "utf8");
  return result;
}
