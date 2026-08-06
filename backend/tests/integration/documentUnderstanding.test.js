import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createAuthedUser, fileTokenFor } from "../helpers/auth.js";
import { deleteUploadedFile } from "../../services/fileService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(__dirname, "../fixtures", name);

const { getTestApp } = await import("../helpers/testApp.js");

let app;
const uploadedIds = [];

beforeAll(() => {
  app = getTestApp();
});

afterAll(async () => {
  await Promise.all(uploadedIds.map((id) => deleteUploadedFile(id)));
});

async function upload(authHeader, filePath) {
  const res = await request(app)
    .post("/api/files/upload")
    .set("Authorization", authHeader)
    .attach("files", filePath);
  const id = res.body?.files?.[0]?.id;
  if (id) uploadedIds.push(id);
  return res;
}

describe("Files: upload + metadata", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/files/upload").attach("files", fixture("sample.txt"));
    expect(res.status).toBe(401);
  });

  it("rejects an empty upload", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).post("/api/files/upload").set("Authorization", authHeader);
    expect(res.status).toBe(400);
  });

  it("rejects a disallowed extension", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", fixture("sample.txt"), "malware.exe");
    expect(res.status).toBe(400);
  });

  it("uploads a text file and returns public-safe metadata", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await upload(authHeader, fixture("sample.txt"));
    expect(res.status).toBe(201);
    expect(res.body.files).toHaveLength(1);
    const file = res.body.files[0];
    expect(file).toMatchObject({ filename: "sample.txt", mimeType: "text/plain", kind: "text" });
    expect(file.path).toBeUndefined();
    expect(file.absolutePath).toBeUndefined();
  });

  it("fetches metadata for an owned file", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).get(`/api/files/${id}`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.file.id).toBe(id);
  });

  it("hides another user's file metadata (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const uploaded = await upload(owner.authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).get(`/api/files/${id}`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("rejects a malformed file id", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/files/not-a-uuid").set("Authorization", authHeader);
    expect(res.status).toBe(400);
  });

  it("404s for an unknown (but valid-shaped) file id", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .get("/api/files/00000000-0000-4000-8000-000000000000")
      .set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });
});

describe("Files: content access + signed URLs", () => {
  it("streams file content with a session token", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).get(`/api/files/${id}/content`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.text).toContain("VANI");
  });

  it("rejects content access for a non-owner session token (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const uploaded = await upload(owner.authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).get(`/api/files/${id}/content`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("issues a signed URL and grants content access via file-scoped token", async () => {
    const { authHeader, user } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const signed = await request(app).get(`/api/files/${id}/signed-url`).set("Authorization", authHeader);
    expect(signed.status).toBe(200);
    expect(signed.body.url).toContain(`files/${id}/content?access_token=`);

    const token = new URL(`http://x/${signed.body.url}`).searchParams.get("access_token");
    const res = await request(app).get(`/api/files/${id}/content`).query({ access_token: token });
    expect(res.status).toBe(200);
    expect(res.text).toContain("VANI");
  });

  it("rejects a file-scoped token for the wrong file id (IDOR)", async () => {
    const { authHeader, user } = await createAuthedUser();
    const uploadedA = await upload(authHeader, fixture("sample.txt"));
    const uploadedB = await upload(authHeader, fixture("sample.csv"));
    const idA = uploadedA.body.files[0].id;
    const idB = uploadedB.body.files[0].id;

    const scopedToA = await fileTokenFor(idA, user._id);
    const res = await request(app)
      .get(`/api/files/${idB}/content`)
      .set("Authorization", scopedToA);
    expect(res.status).toBe(404);
  });

  it("rejects a file-scoped token used against the metadata endpoint", async () => {
    const { authHeader, user } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;
    const scoped = await fileTokenFor(id, user._id);

    const res = await request(app).get(`/api/files/${id}`).set("Authorization", scoped);
    expect(res.status).toBe(401);
  });
});

describe("Files: parse", () => {
  it("extracts plain text from an uploaded .txt file", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/parse`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("txt");
    expect(res.body.text).toContain("VANI");
  });

  it("extracts rows from an uploaded .csv file", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.csv"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/parse`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("csv");
    expect(res.body.text.length).toBeGreaterThan(0);
  });

  it("extracts text from an uploaded .docx file", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.docx"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/parse`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("docx");
    expect(res.body.text.length).toBeGreaterThan(0);
  });

  it("rejects parsing another user's file (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const uploaded = await upload(owner.authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/parse`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });
});

describe("Document Understanding: /api/files/:id/understand", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/files/00000000-0000-4000-8000-000000000000/understand");
    expect(res.status).toBe(401);
  });

  it("understands a plain text document (no OCR)", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/understand`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.text).toContain("VANI");
    expect(res.body.extractionMethod).toBe("text");
    expect(res.body.ocr.used).toBe(false);
    expect(res.body.cached).toBe(false);
  });

  it("caches results on repeat calls, and force=true bypasses the cache", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.csv"));
    const id = uploaded.body.files[0].id;

    const first = await request(app).post(`/api/files/${id}/understand`).set("Authorization", authHeader);
    expect(first.body.cached).toBe(false);

    const second = await request(app).post(`/api/files/${id}/understand`).set("Authorization", authHeader);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.text).toBe(first.body.text);

    const forced = await request(app)
      .post(`/api/files/${id}/understand?force=true`)
      .set("Authorization", authHeader);
    expect(forced.status).toBe(200);
    expect(forced.body.cached).toBe(false);
  });

  it("understands a spreadsheet and splits sheet sections", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.xlsx"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/understand`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.structured.sheets)).toBe(true);
    expect(res.body.structured.sheets.length).toBeGreaterThan(0);
  });

  it("understands a PDF via its selectable text layer", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.pdf"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/understand`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.text.length).toBeGreaterThan(0);
    expect(typeof res.body.pageCount === "number" || res.body.pageCount === null).toBe(true);
  });

  it("understands an image via OCR", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = await upload(authHeader, fixture("sample.png"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/understand`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.extractionMethod).toBe("ocr");
    expect(res.body.ocr.used).toBe(true);
  }, 30_000);

  it("rejects understanding another user's file (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const uploaded = await upload(owner.authHeader, fixture("sample.txt"));
    const id = uploaded.body.files[0].id;

    const res = await request(app).post(`/api/files/${id}/understand`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("404s understanding an unknown file", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/files/00000000-0000-4000-8000-000000000000/understand")
      .set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });
});
