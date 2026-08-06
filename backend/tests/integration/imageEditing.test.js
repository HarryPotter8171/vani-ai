import path from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { createAuthedUser } from "../helpers/auth.js";
import { resolveUploadedFile } from "../../services/fileService.js";

process.env.VANI_E2E_MODE = process.env.VANI_E2E_MODE || "true";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "../fixtures");

const { getTestApp } = await import("../helpers/testApp.js");

let app;
beforeAll(() => {
  app = getTestApp();
});

function parseSSE(text) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)));
}

describe("Image editing: chat upload + edit + persistence", () => {
  it("edits an uploaded image in chat, persists the result, and serves download", async () => {
    const { authHeader } = await createAuthedUser();

    const uploaded = await request(app)
      .post("/api/files/upload")
      .set("Authorization", authHeader)
      .attach("files", path.join(FIXTURES, "sample.png"));
    expect(uploaded.status).toBe(201);
    const sourceId = uploaded.body.files[0].id;
    expect(sourceId).toBeTruthy();

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({
        message: "remove the background from this photo",
        fileIds: [sourceId],
      });

    expect(chat.status).toBe(200);
    expect(chat.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSSE(chat.text);
    const toolStart = events.find(
      (e) => e.tool?.status === "start" && e.tool?.name === "image_edit"
    );
    expect(toolStart).toBeTruthy();

    const imageEvt = events.find((e) => e.image?.fileId);
    expect(imageEvt).toBeTruthy();
    expect(imageEvt.image.fileId).toBeTruthy();
    expect(imageEvt.image.fileId).not.toBe(sourceId);
    expect(imageEvt.image.imageUrl).toMatch(/^\/api\/files\/.+\/content$/);
    expect(imageEvt.image.dataBase64).toBeUndefined();

    const saved = await resolveUploadedFile(imageEvt.image.fileId);
    expect(saved.kind).toBe("image");
    expect(saved.mimeType).toMatch(/^image\//);
    expect(saved.size).toBeGreaterThan(0);

    const downloaded = await request(app)
      .get(`/api/files/${imageEvt.image.fileId}/content`)
      .set("Authorization", authHeader);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toMatch(/^image\//);
  });

  it("fails gracefully when edit is forced without a source image", async () => {
    const { authHeader } = await createAuthedUser();

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({
        // Explicit edit phrasing forces image_edit even if upload detection
        // missed — the tool must surface a clear input error, not crash.
        message: "remove the background",
      });

    expect(chat.status).toBe(200);
    const events = parseSSE(chat.text);

    const toolStart = events.find(
      (e) => e.tool?.status === "start" && e.tool?.name === "image_edit"
    );
    expect(toolStart).toBeTruthy();

    const toolDone = events.find(
      (e) => e.tool?.status === "done" && e.tool?.name === "image_edit"
    );
    expect(toolDone?.tool?.ok).toBe(false);
    expect(String(toolDone?.tool?.error || "")).toMatch(/no images/i);

    expect(events.every((e) => !e.image?.fileId)).toBe(true);
  });
});
