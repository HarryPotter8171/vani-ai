/**
 * Duplex Voice WebSocket integration tests.
 * Spins a real HTTP + WS server; Gemini is mocked via VoiceService seams
 * through the same geminiClient mock as HTTP voice tests.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "http";
import { WebSocket } from "ws";
import { createAuthedUser } from "../helpers/auth.js";

const generateContent = vi.fn();
vi.mock("../../services/geminiClient.js", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const { getTestApp } = await import("../helpers/testApp.js");
const { attachVoiceWebSocket } = await import("../../services/voice/index.js");

let server;
let port;
let voiceWs;

beforeAll(async () => {
  const app = getTestApp();
  server = http.createServer(app);
  voiceWs = attachVoiceWebSocket(server);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = server.address().port;
});

afterAll(async () => {
  await voiceWs?.close();
  await new Promise((resolve) => server.close(() => resolve()));
});

function connectVoiceWs(token, sessionId) {
  const qs = new URLSearchParams({ token });
  if (sessionId) qs.set("sessionId", sessionId);
  const url = `ws://127.0.0.1:${port}/api/voice/ws?${qs}`;
  return new WebSocket(url);
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WS message"));
    }, timeoutMs);
    const onMessage = (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
    };
    ws.on("message", onMessage);
  });
}

function openAndReady(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS open timeout")), 5000);
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("Voice WebSocket duplex", () => {
  it("rejects connections without a valid token", async () => {
    const ws = connectVoiceWs("invalid-token");
    const closed = new Promise((resolve) => {
      ws.once("close", (code) => resolve(code));
    });
    // May error before close depending on ws client.
    ws.on("error", () => undefined);
    const code = await closed;
    expect(code).toBe(4401);
  });

  it("sends ready after authenticated connect + session bind", async () => {
    const { token, authHeader } = await createAuthedUser();
    const app = getTestApp();
    const { default: request } = await import("supertest");
    const created = await request(app)
      .post("/api/voice/session")
      .set("Authorization", authHeader)
      .send({ language: "hi-en" });
    const sessionId = created.body.session.id;

    const ws = connectVoiceWs(token, sessionId);
    await openAndReady(ws);
    const ready = await waitForMessage(ws, (m) => m.type === "ready");
    expect(ready.session.id).toBe(sessionId);
    expect(ready.capabilities.websocket).toBe(true);
    ws.close();
  });

  it("transcribes streamed audio.end over the socket", async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        transcript: "namaste from websocket",
        language: "hi-en",
        confidence: 0.92,
      }),
    });

    const { token, authHeader } = await createAuthedUser();
    const { default: request } = await import("supertest");
    const app = getTestApp();
    const created = await request(app)
      .post("/api/voice/session")
      .set("Authorization", authHeader)
      .send({});
    const sessionId = created.body.session.id;

    const ws = connectVoiceWs(token, sessionId);
    await openAndReady(ws);
    await waitForMessage(ws, (m) => m.type === "ready");

    // Must be ≥400 bytes — server rejects short utterances.
    const audioB64 = Buffer.alloc(512, 7).toString("base64");
    const finalP = waitForMessage(ws, (m) => m.type === "transcript.final" || m.type === "error");
    ws.send(
      JSON.stringify({
        type: "audio.end",
        data: audioB64,
        mimeType: "audio/webm",
        language: "auto",
      })
    );

    const final = await finalP;
    expect(final.type).toBe("transcript.final");
    expect(final.transcript).toBe("namaste from websocket");
    expect(final.language).toBe("hi-en");
    ws.close();
  });

  it("streams TTS audio frames and supports interrupt", async () => {
    // Persist across TTS model fallbacks.
    generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/L16;rate=24000",
                  data: Buffer.alloc(8_000, 2).toString("base64"),
                },
              },
            ],
          },
        },
      ],
    });

    const { token, authHeader } = await createAuthedUser();
    const { default: request } = await import("supertest");
    const app = getTestApp();
    const created = await request(app)
      .post("/api/voice/session")
      .set("Authorization", authHeader)
      .send({});
    const sessionId = created.body.session.id;

    const ws = connectVoiceWs(token, sessionId);
    await openAndReady(ws);
    await waitForMessage(ws, (m) => m.type === "ready");

    const frames = [];
    const gotDone = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`TTS timeout; frames=${JSON.stringify(frames)}`)),
        10_000
      );
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        frames.push(msg.type);
        if (
          msg.type === "tts.done" ||
          msg.type === "error" ||
          msg.type === "interrupted"
        ) {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });

    ws.send(
      JSON.stringify({
        type: "tts",
        text: "Hello from the duplex voice channel.",
      })
    );

    const terminal = await gotDone;
    if (terminal.type === "error") {
      throw new Error(`TTS error: ${terminal.message} (${terminal.code})`);
    }
    expect(frames).toContain("tts.meta");
    expect(frames).toContain("tts.audio");

    const interruptedP = waitForMessage(ws, (m) => m.type === "interrupted");
    ws.send(JSON.stringify({ type: "interrupt" }));
    const interrupted = await interruptedP;
    expect(interrupted.session.state).toBe("listening");
    generateContent.mockReset();
    ws.close();
  });

  it("responds to ping with pong", async () => {
    const { token, authHeader } = await createAuthedUser();
    const { default: request } = await import("supertest");
    const app = getTestApp();
    const created = await request(app)
      .post("/api/voice/session")
      .set("Authorization", authHeader)
      .send({});

    const ws = connectVoiceWs(token, created.body.session.id);
    await openAndReady(ws);
    await waitForMessage(ws, (m) => m.type === "ready");
    const pongP = waitForMessage(ws, (m) => m.type === "pong");
    ws.send(JSON.stringify({ type: "ping" }));
    const pong = await pongP;
    expect(pong.type).toBe("pong");
    ws.close();
  });
});
