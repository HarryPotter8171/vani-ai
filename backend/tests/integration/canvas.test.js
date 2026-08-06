import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";
import { createAuthedUser } from "../helpers/auth.js";

let app;

beforeAll(() => {
  app = getTestApp();
});

async function createCanvas(authHeader, body = {}) {
  return request(app)
    .post("/api/canvas")
    .set("Authorization", authHeader)
    .send({ type: "markdown", title: "My Canvas", content: "# Hello", ...body });
}

describe("Canvas CRUD", () => {
  it("requires auth on every route", async () => {
    const res = await request(app).get("/api/canvas");
    expect(res.status).toBe(401);
  });

  it("creates a canvas owned by the caller", async () => {
    const { authHeader, user } = await createAuthedUser();
    const res = await createCanvas(authHeader);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: String(user._id),
      title: "My Canvas",
      type: "markdown",
      content: "# Hello",
      revision: 1,
    });
  });

  it("rejects an invalid canvas type", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await createCanvas(authHeader, { type: "not-a-real-type" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("lists only the caller's own canvases", async () => {
    const alice = await createAuthedUser();
    const bob = await createAuthedUser();
    await createCanvas(alice.authHeader, { title: "Alice A" });
    await createCanvas(alice.authHeader, { title: "Alice B" });
    await createCanvas(bob.authHeader, { title: "Bob A" });

    const res = await request(app).get("/api/canvas").set("Authorization", alice.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((c) => c.userId === String(alice.user._id))).toBe(true);
  });

  it("gets a single owned canvas by id", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;
    const res = await request(app).get(`/api/canvas/${created.id}`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it("updates content and bumps the revision", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;

    const res = await request(app)
      .patch(`/api/canvas/${created.id}`)
      .set("Authorization", authHeader)
      .send({ content: "# Updated" });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe("# Updated");
    expect(res.body.revision).toBe(2);
  });

  it("detects a write conflict via expectedRevision mismatch", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;

    // Someone else already bumped the revision to 2.
    await request(app)
      .patch(`/api/canvas/${created.id}`)
      .set("Authorization", authHeader)
      .send({ content: "concurrent edit" });

    const res = await request(app)
      .patch(`/api/canvas/${created.id}`)
      .set("Authorization", authHeader)
      .send({ content: "stale edit", expectedRevision: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("autosave reports a conflict without throwing", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;
    await request(app)
      .patch(`/api/canvas/${created.id}`)
      .set("Authorization", authHeader)
      .send({ content: "bump revision" });

    const res = await request(app)
      .put(`/api/canvas/${created.id}/autosave`)
      .set("Authorization", authHeader)
      .send({ content: "stale autosave", expectedRevision: 1 });

    expect(res.status).toBe(409);
    expect(res.body.saved).toBe(false);
  });

  it("pin / unpin toggles the pinned flag", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;

    const pinned = await request(app).post(`/api/canvas/${created.id}/pin`).set("Authorization", authHeader);
    expect(pinned.body.pinned).toBe(true);

    const unpinned = await request(app).post(`/api/canvas/${created.id}/unpin`).set("Authorization", authHeader);
    expect(unpinned.body.pinned).toBe(false);
  });

  it("close / reopen toggles closedAt and list visibility", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;

    await request(app).post(`/api/canvas/${created.id}/close`).set("Authorization", authHeader);
    const listAfterClose = await request(app).get("/api/canvas").set("Authorization", authHeader);
    expect(listAfterClose.body.items).toHaveLength(0);

    const listIncludingClosed = await request(app)
      .get("/api/canvas?includeClosed=true")
      .set("Authorization", authHeader);
    expect(listIncludingClosed.body.items).toHaveLength(1);

    await request(app).post(`/api/canvas/${created.id}/reopen`).set("Authorization", authHeader);
    const listAfterReopen = await request(app).get("/api/canvas").set("Authorization", authHeader);
    expect(listAfterReopen.body.items).toHaveLength(1);
  });

  it("duplicate creates a new independent copy", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader, { content: "original" })).body;
    const res = await request(app).post(`/api/canvas/${created.id}/duplicate`).set("Authorization", authHeader);
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(created.id);
    expect(res.body.title).toContain("(Copy)");
    expect(res.body.content).toBe("original");
  });

  it("deletes an owned canvas", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader)).body;
    const res = await request(app).delete(`/api/canvas/${created.id}`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, id: created.id });

    const getRes = await request(app).get(`/api/canvas/${created.id}`).set("Authorization", authHeader);
    expect(getRes.status).toBe(404);
  });

  it("lists version history and can restore a prior version", async () => {
    const { authHeader } = await createAuthedUser();
    const created = (await createCanvas(authHeader, { content: "v1" })).body;
    await request(app).patch(`/api/canvas/${created.id}`).set("Authorization", authHeader).send({ content: "v2" });

    const versions = await request(app).get(`/api/canvas/${created.id}/versions`).set("Authorization", authHeader);
    expect(versions.status).toBe(200);
    expect(versions.body.items.length).toBeGreaterThanOrEqual(2);

    const firstVersion = versions.body.items[versions.body.items.length - 1];
    const restore = await request(app)
      .post(`/api/canvas/${created.id}/versions/${firstVersion.id}/restore`)
      .set("Authorization", authHeader);
    expect(restore.status).toBe(200);
    expect(restore.body.content).toBe("v1");
  });
});

describe("Canvas ownership / IDOR protection", () => {
  it("returns 404 (not 403) when reading another user's canvas", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const created = (await createCanvas(owner.authHeader)).body;

    const res = await request(app).get(`/api/canvas/${created.id}`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("prevents another user from updating a foreign canvas", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const created = (await createCanvas(owner.authHeader)).body;

    const res = await request(app)
      .patch(`/api/canvas/${created.id}`)
      .set("Authorization", attacker.authHeader)
      .send({ content: "hacked" });
    expect(res.status).toBe(404);

    // Original content is untouched.
    const check = await request(app).get(`/api/canvas/${created.id}`).set("Authorization", owner.authHeader);
    expect(check.body.content).toBe("# Hello");
  });

  it("prevents another user from deleting a foreign canvas", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const created = (await createCanvas(owner.authHeader)).body;

    const res = await request(app).delete(`/api/canvas/${created.id}`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);

    const check = await request(app).get(`/api/canvas/${created.id}`).set("Authorization", owner.authHeader);
    expect(check.status).toBe(200);
  });

  it("returns 400 for a malformed canvas id rather than leaking a 500", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/canvas/not-a-valid-id").set("Authorization", authHeader);
    expect(res.status).toBe(400);
  });
});
