import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";

import { createAuthedUser } from "../helpers/auth.js";
import Project from "../../models/Project.js";
import ProjectFile from "../../models/ProjectFile.js";
import KnowledgeChunk from "../../models/KnowledgeChunk.js";
import Chat from "../../models/Chat.js";

process.env.VANI_E2E_MODE = process.env.VANI_E2E_MODE || "true";

// Keep chat endpoint deterministic/offline while still exercising project+RAG
// integration through controller/service paths.
vi.mock("../../services/geminiService.js", () => ({
  prepareMessages: vi.fn(async (messages) => ({
    contents: [{ role: "user", parts: [{ text: messages.at(-1)?.content || "mock" }] }],
    persistedMessages: messages,
  })),
  streamAgentReply: vi.fn(async function* () {
    yield { type: "delta", text: "RAG-aware mock response." };
  }),
}));

// Prevent network/tool side effects during chat turn.
vi.mock("../../services/memory/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    autoCaptureFromChat: vi.fn(async () => {}),
    buildMemoryPromptExtras: vi.fn(async () => ({ extras: "", memories: [] })),
  };
});

const { getTestApp } = await import("../helpers/testApp.js");

let app;
beforeAll(() => {
  app = getTestApp();
});

function client({ authHeader, ip }) {
  const withHeaders = (req) =>
    req.set("Authorization", authHeader).set("X-Forwarded-For", ip);
  return {
    get: (url) => withHeaders(request(app).get(url)),
    post: (url) => withHeaders(request(app).post(url)),
    put: (url) => withHeaders(request(app).put(url)),
    delete: (url) => withHeaders(request(app).delete(url)),
  };
}

function parseSSE(text) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)));
}

async function createProject(c, payload = {}) {
  const res = await c.post("/api/projects").send({
    name: payload.name || "Project Alpha",
    description: payload.description || "Test project",
    ...payload,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function uploadKbFile(c, projectId, { name, content, mimeType = "text/plain", kind = "text" }) {
  const raw =
    Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8");
  const dataBase64 = raw.toString("base64");
  const res = await c.post(`/api/projects/${projectId}/files`).send({
    file: {
      name,
      mimeType,
      kind,
      size: raw.length,
      dataBase64,
    },
  });
  expect(res.status).toBe(201);
  return res.body;
}

function minimalPdf(text = "VANI OCR PDF project knowledge") {
  const stream = `BT /F1 18 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
  );
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj\n`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

describe("Projects: CRUD, persistence, permissions", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
  });

  it("creates, renames, lists, and deletes a project", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);

    const created = await createProject(c, { name: "Project One" });
    expect(created.name).toBe("Project One");

    const renamed = await c.put(`/api/projects/${created._id}/rename`).send({ name: "Project Uno" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Project Uno");

    const listed = await c.get("/api/projects");
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].name).toBe("Project Uno");

    const fetched = await c.get(`/api/projects/${created._id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe("Project Uno");

    const removed = await c.delete(`/api/projects/${created._id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);

    const after = await c.get("/api/projects");
    expect(after.body).toHaveLength(0);
  });

  it("enforces ownership across project endpoints (IDOR protection)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const ownerClient = client(owner);
    const attackerClient = client(attacker);

    const project = await createProject(ownerClient, { name: "Owner Project" });

    const getRes = await attackerClient.get(`/api/projects/${project._id}`);
    expect(getRes.status).toBe(404);

    const renameRes = await attackerClient
      .put(`/api/projects/${project._id}/rename`)
      .send({ name: "Hacked" });
    expect(renameRes.status).toBe(404);

    const deleteRes = await attackerClient.delete(`/api/projects/${project._id}`);
    expect(deleteRes.status).toBe(404);
  });
});

describe("RAG: upload, indexing, retrieval, duplicates, cleanup", () => {
  it("uploads documents, indexes chunks, and retrieves relevant context", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);
    const project = await createProject(c, { name: "RAG Project" });

    const fileA = await uploadKbFile(c, project._id, {
      name: "billing.txt",
      content:
        "Razorpay settlement timeline is usually T+2 business days. Chargebacks are resolved separately.",
      mimeType: "text/plain",
      kind: "text",
    });
    expect(fileA.status).toBe("ready");
    expect(fileA.chunkCount).toBeGreaterThan(0);

    const fileB = await uploadKbFile(c, project._id, {
      name: "research.txt",
      content:
        "Deep research synthesizes sources, tracks confidence, and lists citations for each section.",
      mimeType: "text/plain",
      kind: "text",
    });
    expect(fileB.status).toBe("ready");

    const projectDoc = await Project.findById(project._id).lean();
    expect(projectDoc.stats.fileCount).toBe(2);
    expect(projectDoc.stats.chunkCount).toBeGreaterThanOrEqual(2);

    const search = await c
      .post(`/api/projects/${project._id}/knowledge/search`)
      .send({ query: "What is the settlement timeline for Razorpay?", topK: 4, maxChars: 4000 });
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body.chunks)).toBe(true);
    expect(search.body.chunks.length).toBeGreaterThan(0);
    expect(search.body.contextText).toMatch(/Razorpay|settlement/i);

    const files = await c.get(`/api/projects/${project._id}/files`);
    expect(files.status).toBe(200);
    expect(files.body).toHaveLength(2);

    const chunkCount = await KnowledgeChunk.countDocuments({ project: project._id });
    expect(chunkCount).toBeGreaterThan(0);
  });

  it("supports duplicate uploads and cleanly removes file-specific chunks on deletion", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);
    const project = await createProject(c, { name: "Dup Project" });

    const payload = {
      name: "duplicate.txt",
      content: "Same title, different body content for duplicate upload behavior.",
      mimeType: "text/plain",
      kind: "text",
    };
    const first = await uploadKbFile(c, project._id, payload);
    const second = await uploadKbFile(c, project._id, payload);

    expect(String(first._id)).not.toBe(String(second._id));

    const beforeDeleteChunks = await KnowledgeChunk.countDocuments({ project: project._id });
    expect(beforeDeleteChunks).toBeGreaterThan(0);

    const delOne = await c.delete(`/api/projects/${project._id}/files/${first._id}`);
    expect(delOne.status).toBe(200);
    expect(delOne.body.deleted).toBe(true);

    const remainingFiles = await c.get(`/api/projects/${project._id}/files`);
    expect(remainingFiles.status).toBe(200);
    expect(remainingFiles.body).toHaveLength(1);

    const afterDeleteChunks = await KnowledgeChunk.countDocuments({ project: project._id });
    expect(afterDeleteChunks).toBeGreaterThanOrEqual(0);
    expect(afterDeleteChunks).toBeLessThan(beforeDeleteChunks);
  });

  it("returns a client error for malformed file ids during deletion (edge-case reliability)", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);
    const project = await createProject(c, { name: "Malformed FileId Project" });

    const bad = await c.delete(`/api/projects/${project._id}/files/not-a-valid-objectid`);
    // Should not be a 500 for malformed ids.
    expect([400, 404]).toContain(bad.status);
  });

  it("indexes large documents into multiple chunks and keeps retrieval latency bounded", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);
    const project = await createProject(c, { name: "Large Doc Project" });

    const largeText = Array.from({ length: 320 }, (_, i) =>
      `Section ${i + 1}: Vector retrieval evaluates semantic similarity and returns ranked chunks.`
    ).join("\n");

    const file = await uploadKbFile(c, project._id, {
      name: "large.txt",
      content: largeText,
      mimeType: "text/plain",
      kind: "text",
    });
    expect(file.chunkCount).toBeGreaterThan(1);

    const started = Date.now();
    const search = await c
      .post(`/api/projects/${project._id}/knowledge/search`)
      .send({ query: "How does semantic similarity ranking work?", topK: 6, maxChars: 8000 });
    const elapsedMs = Date.now() - started;

    expect(search.status).toBe(200);
    expect(search.body.chunks.length).toBeGreaterThan(0);
    // Generous latency guard for CI/local variability while still catching hangs/regressions.
    expect(elapsedMs).toBeLessThan(5000);
  });

  it("indexes uploaded PDFs and retrieves their text in project knowledge search", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);
    const project = await createProject(c, { name: "PDF RAG Project" });

    const pdf = minimalPdf("OCR and PDF intelligence integration for project retrieval");
    const file = await uploadKbFile(c, project._id, {
      name: "ocr-notes.pdf",
      content: pdf,
      mimeType: "application/pdf",
      kind: "pdf",
    });
    expect(file.status).toBe("ready");
    expect(file.chunkCount).toBeGreaterThan(0);

    const search = await c
      .post(`/api/projects/${project._id}/knowledge/search`)
      .send({ query: "What does the OCR integration note mention?", topK: 4, maxChars: 4000 });
    expect(search.status).toBe(200);
    expect(search.body.contextText).toMatch(/OCR and PDF intelligence integration/i);
  });
});

describe("Integration: chat context injection with project RAG", () => {
  it("injects RAG context for project chat turns and emits rag-used SSE metadata", async () => {
    const authed = await createAuthedUser();
    const c = client(authed);
    const project = await createProject(c, { name: "Chat+RAG Project" });

    await uploadKbFile(c, project._id, {
      name: "auth-notes.txt",
      content:
        "Authentication sync endpoint is /api/auth/sync and should be called after login to issue backend JWT.",
      mimeType: "text/plain",
      kind: "text",
    });

    const res = await c.post("/api/chat").send({
      projectId: String(project._id),
      message: "Where should we sync auth after login?",
      model: "gemini",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSSE(res.text);
    expect(events.some((e) => e.rag?.used === true)).toBe(true);
    expect(events.some((e) => e.done)).toBe(true);

    const done = events.find((e) => e.done);
    const saved = await Chat.findById(done.chatId).lean();
    expect(String(saved.project)).toBe(String(project._id));
    expect(saved.messages.at(-1).content).toContain("RAG-aware mock response.");
  });
});

