import { getGeminiClient } from "./geminiClient.js";

export const EMBEDDING_MODEL = process.env.VANI_EMBEDDING_MODEL || "text-embedding-004";
const MAX_BATCH = 16;

function cosineSimilarity(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export { cosineSimilarity };

/**
 * Embed one or more strings. Returns an array of number[] aligned to inputs.
 */
export async function embedTexts(texts = []) {
  const inputs = texts.map((t) => String(t || "").trim()).filter(Boolean);
  if (!inputs.length) return [];

  const client = getGeminiClient();
  const vectors = [];

  for (let i = 0; i < inputs.length; i += MAX_BATCH) {
    const batch = inputs.slice(i, i + MAX_BATCH);
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
    });

    const embeddings = response.embeddings || [];
    for (let j = 0; j < batch.length; j += 1) {
      const values = embeddings[j]?.values || embeddings[j]?.embedding?.values;
      if (!values?.length) {
        throw new Error("Embedding model returned an empty vector");
      }
      vectors.push(values);
    }
  }

  return vectors;
}

export async function embedQuery(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}
