import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import { buildLargeImage } from "../helpers/perfFixtures.js";
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

describe("Performance: large images", () => {
  it("uploads and OCRs a large (2400x2400) PNG within budget", async () => {
    const { authHeader } = await createAuthedUser();

    const genStart = performance.now();
    const imageBuffer = await buildLargeImage({ width: 2400, height: 2400, text: "VANI PERF" });
    const genMs = performance.now() - genStart;
    expect(imageBuffer.length).toBeGreaterThan(10_000);

    const uploadStart = performance.now();
    const uploaded = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", imageBuffer, { filename: "big-scan.png", contentType: "image/png" });
    const uploadMs = performance.now() - uploadStart;
    expect(uploaded.status).toBe(201);
    const id = uploaded.body.files[0].id;
    uploadedIds.push(id);

    const understandStart = performance.now();
    const understood = await request(app)
      .post(`/api/files/${id}/understand`)
      .set("Authorization", authHeader);
    const understandMs = performance.now() - understandStart;

    expect(understood.status).toBe(200);
    expect(understood.body.extractionMethod).toBe("ocr");
    expect(understood.body.ocr.used).toBe(true);
    expect(understood.body.text.toUpperCase()).toContain("VANI");

    console.log(
      `[perf] 2400x2400 PNG OCR: generate=${genMs.toFixed(1)}ms upload=${uploadMs.toFixed(1)}ms ` +
        `understand(OCR)=${understandMs.toFixed(1)}ms`
    );

    expect(uploadMs).toBeLessThan(10_000);
    // OCR over a large multi-line image is the slow path — generous ceiling
    // to avoid sandbox/CI flakiness while still catching real regressions.
    expect(understandMs).toBeLessThan(45_000);
  }, 90_000);
});
