import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { createAuthedUser } from "../helpers/auth.js";
import { resolveUploadedFile } from "../../services/fileService.js";

process.env.VANI_E2E_MODE = process.env.VANI_E2E_MODE || "true";

const IMAGE_TRIGGER = "[[E2E_GENERATE_IMAGE]]";

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

describe("Image generation: chat integration + persistence", () => {
  it("generates an image in chat, persists it, and serves downloadable content", async () => {
    const { authHeader } = await createAuthedUser();

    const chat = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({
        message: `Please create an image of a mountain landscape. ${IMAGE_TRIGGER}`,
      });

    expect(chat.status).toBe(200);
    expect(chat.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSSE(chat.text);
    const imageEvt = events.find((e) => e.image?.fileId);
    expect(imageEvt).toBeTruthy();
    expect(imageEvt.image.fileId).toBeTruthy();
    expect(imageEvt.image.imageUrl).toMatch(/^\/api\/files\/.+\/content$/);

    // Ensure the generated image is a real owned upload.
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

});

