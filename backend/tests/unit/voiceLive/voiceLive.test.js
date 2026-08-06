/**
 * Unit tests — Gemini Live Native Audio Phase 1 backend infra.
 * Does not require live Vertex credentials; uses injected doubles.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

describe("voiceLive/config", () => {
  const prev = process.env.VOICE_ENGINE;

  afterEach(() => {
    if (prev === undefined) delete process.env.VOICE_ENGINE;
    else process.env.VOICE_ENGINE = prev;
  });

  it("defaults to legacy", async () => {
    delete process.env.VOICE_ENGINE;
    const { getVoiceEngine, isLiveVoiceEngine } = await import(
      "../../../services/voiceLive/config.js"
    );
    expect(getVoiceEngine()).toBe("legacy");
    expect(isLiveVoiceEngine()).toBe(false);
  });

  it("recognizes VOICE_ENGINE=live", async () => {
    process.env.VOICE_ENGINE = "live";
    const { getVoiceEngine, isLiveVoiceEngine } = await import(
      "../../../services/voiceLive/config.js"
    );
    expect(getVoiceEngine()).toBe("live");
    expect(isLiveVoiceEngine()).toBe(true);
  });

  it("treats unknown values as legacy", async () => {
    process.env.VOICE_ENGINE = "experimental";
    const { getVoiceEngine } = await import(
      "../../../services/voiceLive/config.js"
    );
    expect(getVoiceEngine()).toBe("legacy");
  });
});

describe("geminiLiveClient", () => {
  it("exports LIVE_API_VERSION v1beta1", async () => {
    const { LIVE_API_VERSION } = await import(
      "../../../services/geminiLiveClient.js"
    );
    expect(LIVE_API_VERSION).toBe("v1beta1");
  });

  it("does not share the chat client module singleton", async () => {
    const live = await import("../../../services/geminiLiveClient.js");
    const chat = await import("../../../services/geminiClient.js");
    expect(live.getGeminiLiveClient).not.toBe(chat.getGeminiClient);
  });
});

describe("buildLiveSystemInstruction", () => {
  it("includes VANI identity lock", async () => {
    const { buildLiveSystemInstruction } = await import(
      "../../../services/voiceLive/systemPrompt.js"
    );
    const prompt = buildLiveSystemInstruction({ userName: "Test" });
    expect(prompt).toContain("VANI AI");
    expect(prompt).toContain("Himanshu Gupta");
    expect(prompt).toContain("Never claim to be Gemini");
    expect(prompt).toContain("Test");
  });
});

describe("GeminiLiveSession", () => {
  it("connects via ai.live.connect and streams PCM + guarded transcripts", async () => {
    const events = [];
    const sendRealtimeInput = vi.fn();
    const close = vi.fn();

    const fakeSession = {
      sendRealtimeInput,
      sendClientContent: vi.fn(),
      close,
    };

    let onmessage;
    const connect = vi.fn(async ({ callbacks }) => {
      onmessage = callbacks.onmessage;
      callbacks.onopen?.();
      return fakeSession;
    });

    const { GeminiLiveSession } = await import(
      "../../../services/voiceLive/GeminiLiveSession.js"
    );

    const session = new GeminiLiveSession({
      userName: "Ada",
      voice: "Kore",
      getClient: () => ({ live: { connect } }),
      onEvent: (e) => events.push(e),
    });

    await session.connect();
    expect(connect).toHaveBeenCalledOnce();
    const call = connect.mock.calls[0][0];
    expect(call.config.responseModalities).toBeTruthy();
    expect(String(call.config.systemInstruction)).toContain("VANI AI");
    expect(call.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      "Kore"
    );

    session.sendAudio(Buffer.from("abcd"));
    expect(sendRealtimeInput).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          mimeType: expect.stringContaining("audio/pcm"),
        }),
      })
    );

    onmessage({
      serverContent: {
        outputTranscription: { text: "I am Gemini, Google's AI." },
        modelTurn: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/pcm;rate=24000",
                data: Buffer.from("pcm-bytes").toString("base64"),
              },
            },
          ],
        },
        turnComplete: true,
      },
    });

    const audio = events.find((e) => e.type === "audio");
    expect(audio?.data).toBeTruthy();
    const outTx = events.find((e) => e.type === "transcript.output");
    expect(outTx?.text).toBeTruthy();
    expect(outTx.text.toLowerCase()).not.toMatch(/\bi am gemini\b/);
    expect(events.some((e) => e.type === "turnComplete")).toBe(true);

    session.close();
    expect(close).toHaveBeenCalled();
  });
});

describe("VoiceSessionManager", () => {
  afterEach(() => {
    delete process.env.VOICE_ENGINE;
  });

  it("starts a managed Live session and forwards audio", async () => {
    process.env.VOICE_ENGINE = "live";

    const sendAudio = vi.fn();
    const close = vi.fn();

    const { VoiceSessionManager } = await import(
      "../../../services/voiceLive/VoiceSessionManager.js"
    );

    const voiceSessions = new Map();
    const manager = new VoiceSessionManager({
      createSession: (input) => {
        const s = {
          id: "vs_test_1",
          userId: input.userId,
          userEmail: input.userEmail,
          voice: input.voice || "Kore",
          state: "idle",
        };
        voiceSessions.set(s.id, s);
        return s;
      },
      getSession: (id) => voiceSessions.get(id) || null,
      updateSession: (id, patch) => {
        const s = voiceSessions.get(id);
        if (!s) return null;
        Object.assign(s, patch);
        return s;
      },
      endSession: (id) => {
        const s = voiceSessions.get(id);
        voiceSessions.delete(id);
        return s || null;
      },
      createLiveSession: (opts) => ({
        connect: vi.fn(async () => {
          opts.onEvent?.({ type: "setup", ok: true, model: "test-model" });
        }),
        sendAudio,
        sendAudioStreamEnd: vi.fn(),
        sendText: vi.fn(),
        interrupt: vi.fn(),
        close,
      }),
    });

    const started = await manager.start({
      userId: "u1",
      userEmail: "u1@example.com",
      userName: "Ada",
    });

    expect(started.id).toBe("live_vs_test_1");
    expect(started.engine).toBe("live");
    expect(manager.sessionCount()).toBe(1);

    expect(manager.sendAudio(started.id, Buffer.from("hi"))).toBe(true);
    expect(sendAudio).toHaveBeenCalledWith(Buffer.from("hi"), undefined);

    await manager.stop(started.id);
    expect(manager.sessionCount()).toBe(0);
    expect(close).toHaveBeenCalled();
  });
});

describe("Live protocol", () => {
  it("parses live client frames and rejects unknown types", async () => {
    const { parseLiveClientMessage } = await import(
      "../../../services/voiceLive/protocol.js"
    );
    expect(parseLiveClientMessage('{"type":"live.start"}').ok).toBe(true);
    expect(parseLiveClientMessage('{"type":"audio.chunk","data":"YQ=="}').ok).toBe(
      true
    );
    // Legacy-only TTS frames are not part of the Live client protocol.
    expect(parseLiveClientMessage('{"type":"tts"}').ok).toBe(false);
  });
});

describe("legacy VoiceService capabilities still work", () => {
  afterEach(() => {
    delete process.env.VOICE_ENGINE;
  });

  it("reports legacy engine by default", async () => {
    delete process.env.VOICE_ENGINE;
    const { VoiceService } = await import(
      "../../../services/voice/VoiceService.js"
    );
    const caps = new VoiceService().capabilities();
    expect(caps.engine).toBe("legacy");
    expect(caps.features.stt).toBe(true);
    expect(caps.features.tts).toBe(true);
    expect(caps.features.streamingStt).toBe(false);
    expect(caps.features.liveNativeAudio).toBe(false);
  });
});
