import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceService } from "../../../services/voice/VoiceService.js";
import {
  parseClientMessage,
  serverFrame,
  CLIENT_TYPES,
} from "../../../services/voice/protocol.js";

describe("voice protocol", () => {
  it("accepts known client message types", () => {
    for (const type of CLIENT_TYPES) {
      const result = parseClientMessage(JSON.stringify({ type }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.msg.type).toBe(type);
    }
  });

  it("rejects invalid JSON and unknown types", () => {
    expect(parseClientMessage("not-json").ok).toBe(false);
    expect(parseClientMessage(JSON.stringify({ type: "nope" })).ok).toBe(false);
    expect(parseClientMessage(null).ok).toBe(false);
  });

  it("builds server frames with type + ts", () => {
    const raw = serverFrame("pong", { ok: true });
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe("pong");
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.ts).toBe("number");
  });

  it("does not let payload.type overwrite the envelope type", () => {
    const parsed = JSON.parse(serverFrame("tts.meta", { type: "meta", sampleRate: 24000 }));
    expect(parsed.type).toBe("tts.meta");
    expect(parsed.sampleRate).toBe(24000);
  });
});

describe("VoiceService", () => {
  let service;
  let sessions;
  let transcribe;
  let synthesize;
  let synthesizeStream;

  beforeEach(() => {
    sessions = new Map();
    transcribe = vi.fn(async () => ({
      transcript: "hello world",
      language: "en",
      confidence: 0.9,
      model: "mock",
      bytes: 12,
      mimeType: "audio/webm",
    }));
    synthesize = vi.fn(async () => ({
      audioBase64: Buffer.from("pcm").toString("base64"),
      mimeType: "audio/L16;rate=24000",
      format: "pcm_s16le",
      sampleRate: 24000,
      channels: 1,
      sampleWidth: 2,
      voice: "Kore",
      speed: 1,
      model: "mock-tts",
      charCount: 5,
    }));
    synthesizeStream = vi.fn(async function* () {
      yield { type: "meta", sampleRate: 24000, channels: 1, sampleWidth: 2 };
      yield { type: "audio", data: "YQ==", offset: 0, byteLength: 1 };
      yield { type: "done", byteLength: 1 };
    });

    service = new VoiceService({
      transcribe,
      synthesize,
      synthesizeStream,
      createSession: (input) => {
        const session = {
          id: "sess-1",
          userId: String(input.userId || ""),
          userEmail: String(input.userEmail || ""),
          chatId: input.chatId || null,
          projectId: input.projectId || null,
          mode: input.mode || "hands-free",
          state: "idle",
          voice: input.voice || "Kore",
          speed: input.speed || 1,
          language: input.language || "auto",
          muted: false,
          turnCount: 0,
        };
        sessions.set(session.id, session);
        return { ...session };
      },
      getSession: (id) => (sessions.has(id) ? { ...sessions.get(id) } : null),
      updateSession: (id, patch) => {
        const s = sessions.get(id);
        if (!s) return null;
        Object.assign(s, patch);
        return { ...s };
      },
      recordTurn: (id, transcript) => {
        const s = sessions.get(id);
        if (!s) return null;
        s.turnCount += 1;
        s.lastTranscript = transcript;
        s.state = "processing";
        return { ...s };
      },
      endSession: (id) => {
        if (!sessions.has(id)) return null;
        sessions.delete(id);
        return { id, state: "ended", turnCount: 0, endedAt: Date.now() };
      },
      sessionCount: () => sessions.size,
    });
  });

  it("exposes capabilities including websocket + tools", () => {
    const caps = service.capabilities();
    expect(caps.ok).toBe(true);
    expect(caps.features.websocket).toBe(true);
    expect(caps.features.interrupt).toBe(true);
    expect(caps.features.tools).toBe(true);
    expect(caps.features.streamingStt).toBe(false);
    expect(caps.features.languages).toContain("hi");
  });

  it("HTTP interrupt invokes WS TTS abort hook", () => {
    const abortWsTts = vi.fn(() => true);
    service.setWsTtsAbortHook(abortWsTts);
    service.startSession({ userId: "u1", userEmail: "a@b.com" });
    const updated = service.interrupt("sess-1", { id: "u1", email: "a@b.com" });
    expect(updated.state).toBe("listening");
    expect(abortWsTts).toHaveBeenCalledWith("sess-1");
  });

  it("starts a session owned by the user", () => {
    const { session } = service.startSession({
      userId: "u1",
      userEmail: "a@b.com",
      language: "hi-en",
    });
    expect(session.id).toBe("sess-1");
    expect(service.assertOwner(session, { id: "u1", email: "a@b.com" })).toBe(true);
    expect(service.assertOwner(session, { id: "other", email: "x@y.com" })).toBe(false);
  });

  it("transcribes audio and records a turn", async () => {
    service.startSession({ userId: "u1", userEmail: "a@b.com" });
    const result = await service.speechToText({
      buffer: Buffer.from("audio"),
      mimeType: "audio/webm",
      sessionId: "sess-1",
      user: { id: "u1", email: "a@b.com" },
    });
    expect(result.transcript).toBe("hello world");
    expect(result.final).toBe(true);
    expect(transcribe).toHaveBeenCalledOnce();
    expect(sessions.get("sess-1").turnCount).toBe(1);
  });

  it("rejects STT for another user's session", async () => {
    service.startSession({ userId: "u1", userEmail: "a@b.com" });
    await expect(
      service.speechToText({
        buffer: Buffer.from("audio"),
        sessionId: "sess-1",
        user: { id: "attacker", email: "evil@x.com" },
      })
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });
  });

  it("synthesizes speech and restores idle state", async () => {
    service.startSession({ userId: "u1", userEmail: "a@b.com" });
    const result = await service.textToSpeech({
      text: "Namaste",
      sessionId: "sess-1",
      user: { id: "u1", email: "a@b.com" },
    });
    expect(result.voice).toBe("Kore");
    expect(sessions.get("sess-1").state).toBe("idle");
  });

  it("streams TTS events", async () => {
    service.startSession({ userId: "u1", userEmail: "a@b.com" });
    const events = [];
    for await (const ev of service.textToSpeechStream({
      text: "Hello there friend.",
      sessionId: "sess-1",
      user: { id: "u1", email: "a@b.com" },
    })) {
      events.push(ev.type);
    }
    expect(events).toEqual(["meta", "audio", "done"]);
  });

  it("interrupts a session back to listening", () => {
    service.startSession({ userId: "u1", userEmail: "a@b.com" });
    sessions.get("sess-1").state = "speaking";
    const updated = service.interrupt("sess-1", { id: "u1", email: "a@b.com" });
    expect(updated.state).toBe("listening");
  });

  it("lists male and female voices", () => {
    const { voices, defaultVoice } = service.listVoices();
    expect(defaultVoice).toBe("Kore");
    expect(voices.some((v) => v.gender === "male")).toBe(true);
    expect(voices.some((v) => v.gender === "female")).toBe(true);
  });
});
