import KnowledgeChunk from "../models/KnowledgeChunk.js";
import ProjectFile from "../models/ProjectFile.js";
import Project from "../models/Project.js";
import { parseAttachment } from "./fileParseService.js";
import { chunkText } from "./chunkingService.js";
import { cosineSimilarity, embedQuery, embedTexts, EMBEDDING_MODEL } from "./embeddingService.js";
import { CHAT_MODEL, getGeminiClient } from "./geminiClient.js";

const MAX_EXTRACTED_STORE = 200_000;

async function extractTextForIndexing(attachment) {
  const parsed = await parseAttachment(attachment);

  if (parsed.text?.trim()) return parsed.text.trim();

  // PDFs / images: ask Gemini Vision to extract readable text for the KB.
  if (parsed.inlinePart) {
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract all readable text from this file for a knowledge base. Preserve headings, lists, and tables as plain text. Return only the extracted content.",
            },
            parsed.inlinePart,
          ],
        },
      ],
    });
    return (response.text || "").trim();
  }

  return "";
}

async function refreshProjectStats(projectId) {
  const [fileCount, chunkCount] = await Promise.all([
    ProjectFile.countDocuments({ project: projectId }),
    KnowledgeChunk.countDocuments({ project: projectId }),
  ]);
  await Project.findByIdAndUpdate(projectId, {
    $set: { "stats.fileCount": fileCount, "stats.chunkCount": chunkCount },
  });
  return { fileCount, chunkCount };
}

/**
 * Parse → chunk → embed → persist knowledge chunks for one project file.
 */
export async function indexProjectFile(fileDoc, attachment) {
  const fileId = fileDoc._id;
  const projectId = fileDoc.project;

  await ProjectFile.findByIdAndUpdate(fileId, {
    status: "indexing",
    error: "",
  });

  try {
    const extracted = await extractTextForIndexing(attachment);
    if (!extracted) {
      throw new Error("No extractable text found in this file");
    }

    const storedText = extracted.slice(0, MAX_EXTRACTED_STORE);
    const chunks = chunkText(storedText);
    if (!chunks.length) throw new Error("Chunking produced no content");

    // Replace prior chunks for this file (re-index safe).
    await KnowledgeChunk.deleteMany({ file: fileId });

    const vectors = await embedTexts(chunks.map((c) => c.content));
    const docs = chunks.map((chunk, i) => ({
      project: projectId,
      file: fileId,
      user: fileDoc.user,
      fileName: fileDoc.name,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenEstimate: chunk.tokenEstimate,
      embedding: vectors[i],
      embeddingModel: EMBEDDING_MODEL,
    }));

    // Insert in batches for large documents.
    const BATCH = 50;
    for (let i = 0; i < docs.length; i += BATCH) {
      await KnowledgeChunk.insertMany(docs.slice(i, i + BATCH), { ordered: true });
    }

    await ProjectFile.findByIdAndUpdate(fileId, {
      status: "ready",
      extractedText: storedText,
      chunkCount: docs.length,
      error: "",
    });

    await refreshProjectStats(projectId);
    return { chunkCount: docs.length };
  } catch (err) {
    await ProjectFile.findByIdAndUpdate(fileId, {
      status: "error",
      error: err.message || "Indexing failed",
      chunkCount: 0,
    });
    await KnowledgeChunk.deleteMany({ file: fileId });
    await refreshProjectStats(projectId);
    throw err;
  }
}

/**
 * Semantic search over a project's knowledge base.
 * Uses project-scoped vectors (scalable: never scans other projects).
 */
export async function searchKnowledgeBase(projectId, query, { topK = 6, maxChars = 8000 } = {}) {
  const q = String(query || "").trim();
  if (!q || !projectId) return { chunks: [], contextText: "" };

  const queryEmbedding = await embedQuery(q);

  // Load candidate chunks for this project only (embedding selected explicitly).
  // Cap candidates for memory safety; Atlas Vector Search can replace this later.
  const candidateLimit = Math.min(
    Number(process.env.VANI_RAG_CANDIDATE_LIMIT) || 400,
    2000
  );

  const candidates = await KnowledgeChunk.find({ project: projectId })
    .select("+embedding content fileName chunkIndex tokenEstimate file")
    .sort({ createdAt: -1 })
    .limit(candidateLimit)
    .lean();

  if (!candidates.length) return { chunks: [], contextText: "" };

  const scored = candidates
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, c.embedding || []),
    }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  let used = 0;
  const selected = [];
  for (const chunk of scored) {
    const len = chunk.content.length + 80;
    if (used + len > maxChars && selected.length) break;
    selected.push(chunk);
    used += len;
  }

  const contextText = selected
    .map(
      (c, i) =>
        `[KB ${i + 1} | ${c.fileName} | score=${c.score.toFixed(3)}]\n${c.content}`
    )
    .join("\n\n");

  return {
    chunks: selected.map(({ embedding, ...rest }) => rest),
    contextText,
  };
}

export async function deleteFileKnowledge(fileId, projectId) {
  await KnowledgeChunk.deleteMany({ file: fileId });
  await ProjectFile.findByIdAndDelete(fileId);
  await refreshProjectStats(projectId);
}

export async function deleteProjectKnowledge(projectId) {
  await Promise.all([
    KnowledgeChunk.deleteMany({ project: projectId }),
    ProjectFile.deleteMany({ project: projectId }),
  ]);
}
