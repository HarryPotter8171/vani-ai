import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import { deleteUploadedFile } from "../../services/fileService.js";
import { buildPdfCase, buildCorruptedBuffer } from "../helpers/pdfIntelFixtures.js";
import { _resetConversations } from "../../services/pdfIntelligence/session/conversation.js";

const { getTestApp } = await import("../helpers/testApp.js");

let app;
const uploadedIds = [];

beforeAll(() => {
  app = getTestApp();
  _resetConversations();
});

afterAll(async () => {
  await Promise.all(uploadedIds.map((id) => deleteUploadedFile(id)));
});

async function uploadPdf(authHeader, buffer, filename) {
  const res = await request(app)
    .post("/api/files/upload")
    .set("Authorization", authHeader)
    .attach("files", buffer, { filename, contentType: "application/pdf" });
  const id = res.body?.files?.[0]?.id;
  if (id) uploadedIds.push(id);
  return res;
}

describe("PDF Intelligence API", () => {
  it("requires auth for analyze", async () => {
    const res = await request(app).post(
      "/api/files/00000000-0000-4000-8000-000000000000/pdf/analyze"
    );
    expect(res.status).toBe(401);
  });

  it("analyzes a GST invoice and returns semantic type + tables", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("gst_invoice");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    expect(uploaded.status).toBe(201);
    const id = uploaded.body.files[0].id;

    const res = await request(app)
      .post(`/api/files/${id}/pdf/analyze`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.pageCount).toBeGreaterThanOrEqual(1);
    expect(res.body.semanticType.documentType).toBe("GST Invoice");
    expect(res.body.capabilities.qa).toBe(true);
    expect(res.body.capabilities.citations).toBe(true);
    expect(Array.isArray(res.body.pageIndex)).toBe(true);
    // Full page texts should not be dumped in analyze response
    expect(res.body.pages).toBeUndefined();
  });

  it("answers page-count and GST find questions with citations", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("gst_mentions");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const pages = await request(app)
      .post(`/api/files/${id}/pdf/ask`)
      .set("Authorization", authHeader)
      .send({ question: "How many pages?" });
    expect(pages.status).toBe(200);
    expect(pages.body.answer).toMatch(/2/);
    expect(pages.body.sessionId).toBeTruthy();

    const gst = await request(app)
      .post(`/api/files/${id}/pdf/ask`)
      .set("Authorization", authHeader)
      .send({
        question: "Find all GST numbers",
        sessionId: pages.body.sessionId,
      });
    expect(gst.status).toBe(200);
    expect(gst.body.answer).toMatch(/GSTIN/i);
    expect(gst.body.citations?.length || gst.body.mentions?.length).toBeGreaterThan(0);
  });

  it("preserves conversation for follow-ups", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("clause_doc");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const first = await request(app)
      .post(`/api/files/${id}/pdf/ask`)
      .set("Authorization", authHeader)
      .send({ question: "What does clause 8 mean?" });
    expect(first.status).toBe(200);
    expect(first.body.answer.toLowerCase()).toMatch(/terminat|notice|clause/);
    expect(first.body.answer).toMatch(/Page\s+\d+/i);

    const second = await request(app)
      .post(`/api/files/${id}/pdf/ask`)
      .set("Authorization", authHeader)
      .send({
        question: "Explain page 1",
        sessionId: first.body.sessionId,
      });
    expect(second.status).toBe(200);
    expect(second.body.answer).toMatch(/Page 1/i);
  });

  it("returns structured tables JSON", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("table_heavy");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const res = await request(app)
      .get(`/api/files/${id}/pdf/tables`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tables)).toBe(true);
    expect(res.body.tables.length).toBeGreaterThanOrEqual(1);
    expect(res.body.tables[0]).toHaveProperty("columns");
    expect(res.body.tables[0]).toHaveProperty("rows");
  });

  it("semantic/keyword search returns page-grounded hits", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("multipage");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const res = await request(app)
      .post(`/api/files/${id}/pdf/search`)
      .set("Authorization", authHeader)
      .send({ query: "liability" });
    expect(res.status).toBe(200);
    expect(res.body.pageCount).toBe(8);
    // Keyword path works even without embeddings
    const hasHit =
      (res.body.hits && res.body.hits.length > 0) ||
      (res.body.mentions && res.body.mentions.length > 0);
    expect(hasHit).toBe(true);
  });

  it("streams analyze progress over SSE", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("english");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const res = await request(app)
      .post(`/api/files/${id}/pdf/analyze/stream`)
      .set("Authorization", authHeader)
      .buffer(true)
      .parse((response, cb) => {
        const data = [];
        response.on("data", (chunk) => data.push(chunk));
        response.on("end", () => cb(null, Buffer.concat(data).toString("utf8")));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    const body = res.body;
    expect(body).toMatch(/progress|result|done/);
    expect(body).toMatch(/Reading PDF|Extracting|Analyzing|done|cached/i);
  });

  it("hides another user's PDF (IDOR → 404)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("invoice");
    const uploaded = await uploadPdf(owner.authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const res = await request(app)
      .post(`/api/files/${id}/pdf/analyze`)
      .set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("returns friendly error for corrupted PDF", async () => {
    const { authHeader } = await createAuthedUser();
    // Upload may reject on signature — if upload succeeds, analyze should 422
    const uploaded = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", buildCorruptedBuffer(), {
        filename: "bad.pdf",
        contentType: "application/pdf",
      });

    if (uploaded.status === 201) {
      const id = uploaded.body.files[0].id;
      uploadedIds.push(id);
      const res = await request(app)
        .post(`/api/files/${id}/pdf/analyze`)
        .set("Authorization", authHeader);
      expect([415, 422]).toContain(res.status);
      expect(res.body.error).toBeTruthy();
      expect(res.body.code).toMatch(/PDF_/);
    } else {
      // Signature validation catching corruption at upload is also acceptable
      expect(uploaded.status).toBe(400);
    }
  });

  it("does not break existing /understand for PDFs", async () => {
    const { authHeader } = await createAuthedUser();
    const { buffer, filename } = await buildPdfCase("english");
    const uploaded = await uploadPdf(authHeader, buffer, filename);
    const id = uploaded.body.files[0].id;

    const res = await request(app)
      .post(`/api/files/${id}/understand`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("text");
    expect(res.body).toHaveProperty("extractionMethod");
    expect(res.body.format).toBe("pdf");
  });
});
