import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";

// Voice STT/TTS both bottom out in Gemini via `getGeminiClient()`. Mock that
// single seam so no network calls are made and responses are deterministic.
const generateContent = vi.fn();
vi.mock("../../services/geminiClient.js", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

function pcmAudioResponse(base64 = Buffer.from("fake-pcm-audio").toString("base64")) {
  return {
    candidates: [
      {
        content: {
          parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: base64 } }],
        },
      },
    ],
  };
}

function transcriptResponse(transcript = "hello there", language = "en") {
  return { text: JSON.stringify({ transcript, language, confidence: 0.95 }) };
}

describe("Voice: health + voices", () => {
  it("exposes the health probe without auth", async () => {
    const res = await request(app).get("/api/voice/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.features.websocket).toBe(true);
    expect(res.body.features.interrupt).toBe(true);
    expect(res.body.features.languages).toContain("hi-en");
  });

  it("requires auth for /voices", async () => {
    const res = await request(app).get("/api/voice/voices");
    expect(res.status).toBe(401);
  });

  it("lists available TTS voices", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/voice/voices").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.voices.length).toBeGreaterThan(0);
    expect(res.body.defaultVoice).toBe("Kore");
  });
});

describe("Voice sessions", () => {
  it("creates, reads, patches, and ends a session", async () => {
    const { authHeader } = await createAuthedUser();

    const created = await request(app)
      .post("/api/voice/session")
      .set("Authorization", authHeader)
      .send({ mode: "push-to-talk", voice: "Puck", language: "en" });
    expect(created.status).toBe(201);
    const { id } = created.body.session;
    expect(created.body.session.mode).toBe("push-to-talk");

    const fetched = await request(app).get(`/api/voice/session/${id}`).set("Authorization", authHeader);
    expect(fetched.status).toBe(200);
    expect(fetched.body.session.id).toBe(id);

    const patched = await request(app)
      .patch(`/api/voice/session/${id}`)
      .set("Authorization", authHeader)
      .send({ state: "listening", muted: true });
    expect(patched.status).toBe(200);
    expect(patched.body.session.state).toBe("listening");
    expect(patched.body.session.muted).toBe(true);

    const ended = await request(app).delete(`/api/voice/session/${id}`).set("Authorization", authHeader);
    expect(ended.status).toBe(200);
    expect(ended.body.state).toBe("ended");

    const afterEnd = await request(app).get(`/api/voice/session/${id}`).set("Authorization", authHeader);
    expect(afterEnd.status).toBe(404);
  });

  it("prevents one user from reading another user's voice session (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();

    const created = await request(app)
      .post("/api/voice/session")
      .set("Authorization", owner.authHeader)
      .send({});
    const { id } = created.body.session;

    const res = await request(app).get(`/api/voice/session/${id}`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown session id", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/voice/session/does-not-exist").set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });
});

describe("Voice: speech-to-text", () => {
  it("transcribes base64 audio via mocked Gemini", async () => {
    generateContent.mockResolvedValueOnce(transcriptResponse("namaste, kaise ho", "hi-en"));
    const { authHeader } = await createAuthedUser();

    const audioBase64 = Buffer.from("fake-webm-audio-bytes").toString("base64");
    const res = await request(app)
      .post("/api/voice/stt")
      .set("Authorization", authHeader)
      .send({ audioBase64, mimeType: "audio/webm" });

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("namaste, kaise ho");
    expect(res.body.language).toBe("hi-en");
  });

  it("transcribes a multipart audio upload", async () => {
    generateContent.mockResolvedValueOnce(transcriptResponse("hello from multipart"));
    const { authHeader } = await createAuthedUser();

    const res = await request(app)
      .post("/api/voice/stt")
      .set("Authorization", authHeader)
      .attach("audio", Buffer.from("raw-audio-bytes"), { filename: "clip.webm", contentType: "audio/webm" });

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("hello from multipart");
  });

  it("associates a transcript with an existing session and bumps turnCount", async () => {
    generateContent.mockResolvedValueOnce(transcriptResponse("session-linked transcript"));
    const { authHeader } = await createAuthedUser();
    const created = await request(app).post("/api/voice/session").set("Authorization", authHeader).send({});
    const sessionId = created.body.session.id;

    const res = await request(app)
      .post("/api/voice/stt")
      .set("Authorization", authHeader)
      .send({ sessionId, audioBase64: Buffer.from("x").toString("base64") });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(sessionId);

    const session = await request(app).get(`/api/voice/session/${sessionId}`).set("Authorization", authHeader);
    expect(session.body.session.turnCount).toBe(1);
    expect(session.body.session.lastTranscript).toBe("session-linked transcript");
  });

  it("rejects a request with no audio payload", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).post("/api/voice/stt").set("Authorization", authHeader).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_AUDIO");
  });

  it("rejects invalid base64 audio", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/voice/stt")
      .set("Authorization", authHeader)
      .send({ audioBase64: "" });
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    const res = await request(app).post("/api/voice/stt").send({ audioBase64: "abc" });
    expect(res.status).toBe(401);
  });
});

describe("Voice: text-to-speech", () => {
  it("synthesizes speech via mocked Gemini", async () => {
    generateContent.mockResolvedValueOnce(pcmAudioResponse());
    const { authHeader } = await createAuthedUser();

    const res = await request(app)
      .post("/api/voice/tts")
      .set("Authorization", authHeader)
      .send({ text: "Hello there!", voice: "Kore" });

    expect(res.status).toBe(200);
    expect(res.body.audioBase64).toBeTruthy();
    expect(res.body.format).toBe("pcm_s16le");
    expect(res.body.voice).toBe("Kore");
  });

  it("streams speech as SSE chunks when stream=true", async () => {
    generateContent.mockResolvedValueOnce(pcmAudioResponse(Buffer.alloc(30_000, 1).toString("base64")));
    const { authHeader } = await createAuthedUser();

    const res = await request(app)
      .post("/api/voice/tts")
      .set("Authorization", authHeader)
      .send({ text: "Stream this please.", stream: true });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    const events = res.text
      .split("\n\n")
      .filter(Boolean)
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));

    expect(events[0].type).toBe("meta");
    expect(events.some((e) => e.type === "audio")).toBe(true);
    expect(events.at(-1).type).toBe("done");
  });

  it("rejects empty text", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).post("/api/voice/tts").set("Authorization", authHeader).send({ text: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_TEXT");
  });

  it("rejects text that sanitizes to nothing speakable", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/voice/tts")
      .set("Authorization", authHeader)
      .send({ text: "```\ncode only\n```" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMPTY_TEXT");
  });

  it("returns 502 when Gemini keeps failing across all model fallbacks", async () => {
    generateContent.mockRejectedValue(new Error("upstream unavailable"));
    const { authHeader } = await createAuthedUser();

    const res = await request(app)
      .post("/api/voice/tts")
      .set("Authorization", authHeader)
      .send({ text: "This will fail." });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("TTS_FAILED");
    generateContent.mockReset();
  });
});

describe("Voice: interrupt", () => {
  it("marks an active session back to listening", async () => {
    const { authHeader } = await createAuthedUser();
    const created = await request(app).post("/api/voice/session").set("Authorization", authHeader).send({});
    const sessionId = created.body.session.id;

    const res = await request(app)
      .post("/api/voice/interrupt")
      .set("Authorization", authHeader)
      .send({ sessionId });

    expect(res.status).toBe(200);
    expect(res.body.interrupted).toBe(true);
    expect(res.body.session.state).toBe("listening");
  });

  it("requires sessionId", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).post("/api/voice/interrupt").set("Authorization", authHeader).send({});
    expect(res.status).toBe(400);
  });
});
