import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "../../config/upload.js";

const CACHE_SUFFIX = ".pdfintel.json";
const INDEX_SUFFIX = ".pdfintel.index.json";

function cachePathFor(id) {
  return path.join(UPLOADS_DIR, `${id}${CACHE_SUFFIX}`);
}

function indexPathFor(id) {
  return path.join(UPLOADS_DIR, `${id}${INDEX_SUFFIX}`);
}

export async function readPdfIntelCache(id) {
  try {
    const raw = await fs.readFile(cachePathFor(id), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writePdfIntelCache(id, result) {
  // Strip heavy embedding vectors from the analysis cache; they live in the index file.
  const { chunks, ...rest } = result;
  const toStore = {
    ...rest,
    chunkCount: Array.isArray(chunks) ? chunks.length : rest.chunkCount ?? 0,
  };
  await fs.writeFile(cachePathFor(id), JSON.stringify(toStore, null, 2), "utf8");
  return toStore;
}

export async function readPdfIntelIndex(id) {
  try {
    const raw = await fs.readFile(indexPathFor(id), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writePdfIntelIndex(id, index) {
  await fs.writeFile(indexPathFor(id), JSON.stringify(index), "utf8");
  return index;
}
