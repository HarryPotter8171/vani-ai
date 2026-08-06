/**
 * A deterministic, offline stand-in for the real Vertex/Gemini client.
 *
 * Only ever constructed when `VANI_E2E_MODE=true` (see geminiClient.js). It
 * exists so the Playwright end-to-end suite can drive the REAL frontend +
 * REAL backend + REAL database through a genuine user journey (login, chat,
 * memory, uploads, image generation, voice, deep research, MCP, browser
 * automation) without depending on live Google Cloud credentials or network
 * access. It intentionally mirrors the minimal response shapes each caller
 * reads (see services/geminiClient.js callers) — nothing more.
 */

// 1x1 transparent PNG — enough to satisfy the image-generation tool's
// `inlineData.data` contract and round-trip through the real attachment /
// file-storage pipeline.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// ~100ms of silence at 24kHz mono 16-bit PCM — satisfies the TTS pipeline's
// audio byte-length math without needing a real audio codec.
const SILENT_PCM_BASE64 = Buffer.alloc(4800).toString("base64");

function hasAudioInput(contents) {
  return (contents || []).some((c) =>
    (c.parts || []).some((p) => p?.inlineData?.mimeType?.startsWith("audio/"))
  );
}

// The Playwright E2E suite has no real model to decide when to call a tool,
// so it opts in explicitly with this marker in the chat message text. Kept
// out of any real conversation path — see e2e/tests/userJourney.spec.ts.
const IMAGE_TOOL_TRIGGER = "[[E2E_GENERATE_IMAGE]]";

function latestUserText(contents) {
  for (let i = (contents || []).length - 1; i >= 0; i -= 1) {
    const c = contents[i];
    if (c?.role !== "user") continue;
    const text = (c.parts || [])
      .map((p) => p?.text)
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  return "";
}

function textResponse(text) {
  return {
    text,
    candidates: [
      {
        content: { parts: [{ text }] },
        finishReason: "STOP",
      },
    ],
  };
}

function imageResponse() {
  const caption = "Here is the generated image.";
  return {
    text: caption,
    candidates: [
      {
        content: {
          parts: [
            { text: caption },
            { inlineData: { mimeType: "image/png", data: TINY_PNG_BASE64 } },
          ],
        },
      },
    ],
  };
}

function audioResponse() {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/L16;rate=24000",
                data: SILENT_PCM_BASE64,
              },
            },
          ],
        },
      },
    ],
  };
}

function transcriptResponse() {
  const payload = JSON.stringify({
    transcript: "Hello VANI, this is an end-to-end test.",
    language: "en",
    confidence: 0.95,
  });
  return textResponse(payload);
}

/** Same deterministic content-hash embedding used across the test suite. */
function fakeEmbedding(text) {
  const s = String(text || "");
  const hashes = [31, 37, 41, 43, 47, 53, 59, 61].map((seed) => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
      h = (h * seed + s.charCodeAt(i)) % 1_000_003;
    }
    return h / 1_000_003;
  });
  return hashes;
}

async function* singleChunk(chunk) {
  yield chunk;
}

async function* imageToolCallChunk() {
  yield {
    functionCalls: [
      {
        name: "image_generation",
        args: { prompt: "A simple test mountain landscape" },
      },
    ],
  };
}

export function buildMockGeminiClient() {
  return {
    models: {
      async generateContent(params = {}) {
        const modalities = params?.config?.responseModalities || [];
        if (modalities.includes("AUDIO")) return audioResponse();
        if (modalities.includes("IMAGE")) return imageResponse();
        if (hasAudioInput(params.contents)) return transcriptResponse();
        // Generic plain-text reply. Callers that need JSON (research planner,
        // contradiction detection) fail JSON.parse and use their existing
        // deterministic fallbacks — this is intentional, not a gap.
        return textResponse("Mock VANI response (E2E mode).");
      },
      async generateContentStream(params = {}) {
        if (latestUserText(params.contents).includes(IMAGE_TOOL_TRIGGER)) {
          return imageToolCallChunk();
        }
        return singleChunk(textResponse("Hello from mock VANI AI (E2E mode)."));
      },
      async embedContent({ contents } = {}) {
        return {
          embeddings: (contents || []).map((text) => ({ values: fakeEmbedding(text) })),
        };
      },
      async editImage(params = {}) {
        const refs = params.referenceImages || [];
        const hasRaw = refs.some(
          (r) =>
            r?.referenceImage?.imageBytes ||
            r?.toReferenceImageAPI?.()?.referenceImage?.imageBytes
        );
        if (!hasRaw && !refs.length) {
          return { generatedImages: [] };
        }
        return {
          generatedImages: [
            {
              image: {
                imageBytes: TINY_PNG_BASE64,
                mimeType: "image/png",
              },
            },
          ],
        };
      },
    },
    /**
     * Gemini Live Native Audio stub for VOICE_ENGINE=live + VANI_E2E_MODE.
     * Mirrors `ai.live.connect()` enough for session open/audio/close.
     */
    live: {
      async connect({ callbacks } = {}) {
        let closed = false;
        const session = {
          sendRealtimeInput(_params) {
            if (closed) return;
            // Echo a tiny silent PCM turn so bridges exercise playback path.
            queueMicrotask(() => {
              if (closed) return;
              callbacks?.onmessage?.({
                serverContent: {
                  inputTranscription: { text: "Hello VANI, this is an end-to-end test." },
                },
              });
              callbacks?.onmessage?.({
                serverContent: {
                  modelTurn: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: "audio/pcm;rate=24000",
                          data: SILENT_PCM_BASE64,
                        },
                      },
                    ],
                  },
                },
                get data() {
                  return SILENT_PCM_BASE64;
                },
                get text() {
                  return undefined;
                },
              });
              callbacks?.onmessage?.({
                serverContent: {
                  outputTranscription: { text: "Hello from mock VANI AI (E2E mode)." },
                  turnComplete: true,
                  generationComplete: true,
                },
                get data() {
                  return undefined;
                },
                get text() {
                  return undefined;
                },
              });
            });
          },
          sendClientContent(_params) {
            if (closed) return;
            queueMicrotask(() => {
              if (closed) return;
              callbacks?.onmessage?.({
                serverContent: {
                  outputTranscription: { text: "Hello from mock VANI AI (E2E mode)." },
                  modelTurn: {
                    parts: [
                      {
                        inlineData: {
                          mimeType: "audio/pcm;rate=24000",
                          data: SILENT_PCM_BASE64,
                        },
                      },
                    ],
                  },
                  turnComplete: true,
                },
                get data() {
                  return SILENT_PCM_BASE64;
                },
                get text() {
                  return undefined;
                },
              });
            });
          },
          sendToolResponse() {},
          close() {
            if (closed) return;
            closed = true;
            callbacks?.onclose?.({ reason: "mock close" });
          },
        };
        callbacks?.onopen?.();
        callbacks?.onmessage?.({
          setupComplete: { sessionId: "mock-live-session" },
        });
        return session;
      },
    },
  };
}
