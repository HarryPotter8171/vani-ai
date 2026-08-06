import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { createAuthedUser } from "../helpers/auth.js";
import { deleteUploadedFile, resolveUploadedFile } from "../../services/fileService.js";
import { MAX_FILE_SIZE_BYTES, MAX_FILES } from "../../config/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(__dirname, "../fixtures", name);

process.env.VANI_E2E_MODE = process.env.VANI_E2E_MODE || "true";

const { getTestApp } = await import("../helpers/testApp.js");

let app;
const uploadedIds = [];

beforeAll(() => {
  app = getTestApp();
});

afterAll(async () => {
  await Promise.all(uploadedIds.map((id) => deleteUploadedFile(id)));
});

function track(res) {
  for (const f of res.body?.files || []) {
    if (f?.id) uploadedIds.push(f.id);
  }
  return res;
}

/** Minimal empty ZIP (EOCD only) — valid PK signature. */
function emptyZipBuffer() {
  return Buffer.from([
    0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
}

/** Minimal ISO-BMFF with ftyp at offset 4 (HEIC signature check). */
function minimalHeicBuffer() {
  const buf = Buffer.alloc(24, 0);
  buf.writeUInt32BE(24, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write("heic", 8, "ascii");
  return buf;
}

describe("File upload pipeline", () => {
  it("uploads supported document + image types", async () => {
    const { authHeader } = await createAuthedUser();
    const files = [
      "sample.txt",
      "sample.csv",
      "sample.md",
      "sample.pdf",
      "sample.docx",
      "sample.xlsx",
      "sample.png",
    ];

    const req = request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader);
    for (const name of files) req.attach("files", fixture(name));
    const res = track(await req);

    expect(res.status).toBe(201);
    expect(res.body.files).toHaveLength(files.length);
    for (const file of res.body.files) {
      expect(file.id).toBeTruthy();
      expect(file.path).toBeUndefined();
      expect(file.mimeType).toBeTruthy();
      expect(file.kind).toBeTruthy();
    }
  });

  it("accepts duplicate filenames as distinct owned uploads", async () => {
    const { authHeader } = await createAuthedUser();
    const res = track(
      await request(app)
        .post("/api/files/upload")
        .set("Authorization", authHeader)
        .attach("files", fixture("sample.txt"))
        .attach("files", fixture("sample.txt"))
    );

    expect(res.status).toBe(201);
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files[0].id).not.toBe(res.body.files[1].id);
    expect(res.body.files[0].filename).toBe("sample.txt");
    expect(res.body.files[1].filename).toBe("sample.txt");
  });

  it("uploads ZIP archives (signature-validated)", async () => {
    const { authHeader } = await createAuthedUser();
    const res = track(
      await request(app)
        .post("/api/files/upload")
        .set("Authorization", authHeader)
        .attach("files", emptyZipBuffer(), {
          filename: "bundle.zip",
          contentType: "application/zip",
        })
    );

    expect(res.status).toBe(201);
    expect(res.body.files[0]).toMatchObject({
      filename: "bundle.zip",
      mimeType: "application/zip",
      kind: "zip",
    });
  });

  it("accepts HEIC signature at upload (normalize best-effort)", async () => {
    const { authHeader } = await createAuthedUser();
    const res = track(
      await request(app)
        .post("/api/files/upload")
        .set("Authorization", authHeader)
        .attach("files", minimalHeicBuffer(), {
          filename: "photo.heic",
          contentType: "image/heic",
        })
    );

    expect(res.status).toBe(201);
    expect(res.body.files[0].filename).toBe("photo.heic");
    expect(res.body.files[0].kind).toBe("image");
  });

  it("rejects oversize files and too many files", async () => {
    const { authHeader } = await createAuthedUser();

    const huge = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024, 0x61);
    const oversize = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", huge, { filename: "too-big.txt", contentType: "text/plain" });
    expect(oversize.status).toBe(400);
    expect(String(oversize.body.error || "")).toMatch(/MB or smaller/i);

    const tooMany = request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader);
    for (let i = 0; i < MAX_FILES + 1; i += 1) {
      tooMany.attach("files", Buffer.from(`row-${i}`), {
        filename: `f${i}.txt`,
        contentType: "text/plain",
      });
    }
    const manyRes = await tooMany;
    expect(manyRes.status).toBe(400);
    expect(String(manyRes.body.error || "")).toMatch(/up to/i);
  });

  it("rejects MIME/extension spoofing via signature checks", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", Buffer.from("%PDF-1.4 fake"), {
        filename: "not-really.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error || "")).toMatch(/validation|PNG|valid/i);
  });

  it("supports parallel uploads from the same user", async () => {
    const { authHeader } = await createAuthedUser();
    const results = await Promise.all(
      ["sample.txt", "sample.csv", "sample.png"].map((name) =>
        request(app)
          .post("/api/files/upload")
          .set("Authorization", authHeader)
          .attach("files", fixture(name))
      )
    );

    for (const res of results) {
      track(res);
      expect(res.status).toBe(201);
      expect(res.body.files).toHaveLength(1);
    }
    const ids = results.map((r) => r.body.files[0].id);
    expect(new Set(ids).size).toBe(3);
  });

  it("deletes owned uploads and blocks cross-user delete (cleanup)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();

    const uploaded = track(
      await request(app)
        .post("/api/files/upload")
        .set("Authorization", owner.authHeader)
        .attach("files", fixture("sample.txt"))
    );
    const id = uploaded.body.files[0].id;

    const forbidden = await request(app)
      .delete(`/api/files/${id}`)
      .set("Authorization", attacker.authHeader);
    expect(forbidden.status).toBe(404);

    // Still present for owner.
    await expect(resolveUploadedFile(id)).resolves.toMatchObject({ id });

    const deleted = await request(app)
      .delete(`/api/files/${id}`)
      .set("Authorization", owner.authHeader);
    expect(deleted.status).toBe(204);

    const gone = await request(app)
      .get(`/api/files/${id}`)
      .set("Authorization", owner.authHeader);
    expect(gone.status).toBe(404);
  });

  it("hydrates uploaded fileIds into chat without exposing filesystem paths", async () => {
    const { authHeader } = await createAuthedUser();
    const uploaded = track(
      await request(app)
        .post("/api/files/upload")
        .set("Authorization", authHeader)
        .attach("files", fixture("sample.txt"))
    );
    const fileId = uploaded.body.files[0].id;

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({
        message: "Summarize the attached file briefly.",
        fileIds: [fileId],
      });

    expect(chat.status).toBe(200);
    expect(chat.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(chat.text).not.toMatch(/backend\/uploads|absolutePath/i);
  });
});
