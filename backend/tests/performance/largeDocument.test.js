import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import { buildLargePdf } from "../helpers/perfFixtures.js";
import { deleteUploadedFile } from "../../services/fileService.js";

const { getTestApp } = await import("../helpers/testApp.js");

let app;
const uploadedIds = [];

beforeAll(() => {
  app = getTestApp();
});

afterAll(async () => {
  await Promise.all(uploadedIds.map((id) => deleteUploadedFile(id)));
});

describe("Performance: large PDFs", () => {
  it("uploads, parses, and understands a 200-page text-heavy PDF within budget", async () => {
    const { authHeader } = await createAuthedUser();
    const pdfStart = performance.now();
    const pdfBuffer = await buildLargePdf({ pages: 200, paragraphsPerPage: 6 });
    const pdfGenMs = performance.now() - pdfStart;
    expect(pdfBuffer.length).toBeGreaterThan(50_000);

    const uploadStart = performance.now();
    const uploaded = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", pdfBuffer, { filename: "big-report.pdf", contentType: "application/pdf" });
    const uploadMs = performance.now() - uploadStart;
    expect(uploaded.status).toBe(201);
    const id = uploaded.body.files[0].id;
    uploadedIds.push(id);

    const parseStart = performance.now();
    const parsed = await request(app).post(`/api/files/${id}/parse`).set("Authorization", authHeader);
    const parseMs = performance.now() - parseStart;
    expect(parsed.status).toBe(200);
    expect(parsed.body.text.length).toBeGreaterThan(1000);

    const understandStart = performance.now();
    const understood = await request(app)
      .post(`/api/files/${id}/understand`)
      .set("Authorization", authHeader);
    const understandMs = performance.now() - understandStart;
    expect(understood.status).toBe(200);
    expect(understood.body.extractionMethod).toBe("text");
    expect(understood.body.ocr.used).toBe(false);

    console.log(
      `[perf] 200-page PDF: generate=${pdfGenMs.toFixed(1)}ms upload=${uploadMs.toFixed(1)}ms ` +
        `parse=${parseMs.toFixed(1)}ms understand=${understandMs.toFixed(1)}ms`
    );

    expect(uploadMs).toBeLessThan(10_000);
    expect(parseMs).toBeLessThan(10_000);
    expect(understandMs).toBeLessThan(10_000);
  }, 60_000);
});
