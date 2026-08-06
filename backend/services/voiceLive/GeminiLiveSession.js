/**
 * Thin wrapper around `ai.live.connect()` for one Native Audio session.
 *
 * Owns the Gemini Live WebSocket; emits normalized events for the bridge.
 * Does not talk to the browser — VoiceSessionManager / LiveVoiceWebSocket do.
 */

import { Modality } from "@google/genai";
import { getGeminiLiveClient } from "../geminiLiveClient.js";
import { sanitizeIdentityResponse } from "../identity/IdentityGuard.js";
import { logger } from "../../utils/logger.js";
import {
  LIVE_MODEL,
  LIVE_INPUT_MIME,
  LIVE_OUTPUT_MIME,
  LIVE_OUTPUT_SAMPLE_RATE,
  LIVE_OUTPUT_FORMAT,
} from "./config.js";
import { buildLiveSystemInstruction } from "./systemPrompt.js";

/**
 * @typedef {{
 *   type: "setup" | "audio" | "transcript.input" | "transcript.output" |
 *         "interrupted" | "turnComplete" | "error" | "closed",
 *   [key: string]: unknown,
 * }} LiveSessionEvent
 */

/**
 * @typedef {(event: LiveSessionEvent) => void} LiveSessionListener
 */

export class GeminiLiveSession {
  /**
   * @param {{
   *   model?: string,
   *   voice?: string,
   *   userName?: string,
   *   onEvent?: LiveSessionListener,
   *   getClient?: () => { live: { connect: Function } },
   * }} [opts]
   */
  constructor(opts = {}) {
    this.model = opts.model || LIVE_MODEL;
    this.voice = opts.voice || null;
    this.userName = opts.userName || "";
    this._onEvent = opts.onEvent || (() => {});
    this._getClient = opts.getClient || getGeminiLiveClient;
    /** @type {import("@google/genai").Session | null} */
    this._session = null;
    this._closed = false;
    this._audioByteOffset = 0;
    /** Last user transcript text (for Identity Guard context). */
    this._lastUserText = "";
  }

  get connected() {
    return !!this._session && !this._closed;
  }

  /**
   * Open the Live Native Audio connection.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this._session) return;

    const ai = this._getClient();
    if (!ai?.live?.connect) {
      const err = new Error("Gemini Live client does not expose live.connect().");
      err.code = "LIVE_CLIENT_UNAVAILABLE";
      throw err;
    }

    const systemInstruction = buildLiveSystemInstruction({
      userName: this.userName,
    });

    /** @type {import("@google/genai").LiveConnectConfig} */
    const config = {
      responseModalities: [Modality.AUDIO],
      systemInstruction,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };

    if (this.voice) {
      config.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: this.voice },
        },
      };
    }

    this._session = await ai.live.connect({
      model: this.model,
      config,
      callbacks: {
        onopen: () => {
          this._emit({ type: "setup", ok: true, model: this.model });
        },
        onmessage: (message) => this._handleServerMessage(message),
        onerror: (e) => {
          const message = e?.message || "Gemini Live socket error.";
          logger.warn({ err: message }, "[voice-live] gemini session error");
          this._emit({ type: "error", message, code: "LIVE_SOCKET_ERROR" });
        },
        onclose: (e) => {
          this._closed = true;
          this._session = null;
          this._emit({
            type: "closed",
            reason: e?.reason || "closed",
          });
        },
      },
    });
  }

  /**
   * Stream a PCM chunk to Gemini Live.
   * @param {Buffer | string} pcm — Buffer or base64 string
   * @param {{ mimeType?: string }} [opts]
   */
  sendAudio(pcm, opts = {}) {
    if (!this._session || this._closed) return;
    const data =
      typeof pcm === "string"
        ? pcm
        : Buffer.isBuffer(pcm)
          ? pcm.toString("base64")
          : Buffer.from(pcm).toString("base64");
    if (!data) return;

    this._session.sendRealtimeInput({
      audio: {
        data,
        mimeType: opts.mimeType || LIVE_INPUT_MIME,
      },
    });
  }

  /**
   * Signal end of mic stream (VAD auto-activity path).
   */
  sendAudioStreamEnd() {
    if (!this._session || this._closed) return;
    try {
      this._session.sendRealtimeInput({ audioStreamEnd: true });
    } catch (err) {
      logger.warn({ err: err.message }, "[voice-live] audioStreamEnd failed");
    }
  }

  /**
   * Send a text turn (debug / typed fallback).
   * @param {string} text
   */
  sendText(text) {
    if (!this._session || this._closed) return;
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    this._lastUserText = trimmed;
    this._session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: trimmed }] }],
      turnComplete: true,
    });
  }

  /**
   * Interrupt model generation.
   * With automatic VAD, Gemini Live interrupts on new user audio — there is no
   * separate cancel RPC. For UI barge-in we signal activity boundaries when the
   * SDK accepts them, and always emit a local interrupted event so the browser
   * flushes playback immediately.
   */
  interrupt() {
    this._audioByteOffset = 0;
    if (this._session && !this._closed) {
      try {
        // Best-effort: some SDK builds accept activity signals even with auto VAD.
        this._session.sendRealtimeInput({ activityStart: {} });
        this._session.sendRealtimeInput({ activityEnd: {} });
      } catch {
        /* auto-VAD path — interruption relies on continued mic audio */
      }
    }
    this._emit({ type: "interrupted" });
  }

  close() {
    if (this._closed && !this._session) return;
    this._closed = true;
    try {
      this._session?.close();
    } catch {
      /* noop */
    }
    this._session = null;
  }

  /**
   * @param {import("@google/genai").LiveServerMessage} message
   */
  _handleServerMessage(message) {
    if (!message) return;

    if (message.setupComplete) {
      this._emit({
        type: "setup",
        ok: true,
        sessionId: message.setupComplete.sessionId || null,
      });
      return;
    }

    const content = message.serverContent;
    if (!content) {
      if (message.goAway) {
        this._emit({
          type: "error",
          message: "Gemini Live server goAway — reconnect required.",
          code: "LIVE_GO_AWAY",
          timeLeft: message.goAway.timeLeft,
        });
      }
      return;
    }

    if (content.interrupted) {
      this._audioByteOffset = 0;
      this._emit({ type: "interrupted" });
    }

    // Input transcription (user speech).
    if (content.interimInputTranscription?.text) {
      const text = String(content.interimInputTranscription.text).trim();
      if (text) {
        this._lastUserText = text;
        this._emit({
          type: "transcript.input",
          text,
          interim: true,
          final: false,
        });
      }
    } else if (content.inputTranscription?.text) {
      const text = String(content.inputTranscription.text).trim();
      if (text) {
        this._lastUserText = text;
        this._emit({
          type: "transcript.input",
          text,
          interim: false,
          final: true,
        });
      }
    }

    // Output transcription — Identity Guard before browser.
    if (content.outputTranscription?.text) {
      const cleaned = sanitizeIdentityResponse(
        content.outputTranscription.text,
        this._lastUserText
      );
      this._emit({
        type: "transcript.output",
        text: cleaned,
      });
    }

    // Model audio parts (also available via message.data helper).
    const parts = content.modelTurn?.parts || [];
    for (const part of parts) {
      const inline = part?.inlineData;
      if (inline?.data) {
        const byteLength = Buffer.from(inline.data, "base64").length;
        this._emit({
          type: "audio",
          data: inline.data,
          mimeType: inline.mimeType || LIVE_OUTPUT_MIME,
          format: LIVE_OUTPUT_FORMAT,
          sampleRate: LIVE_OUTPUT_SAMPLE_RATE,
          offset: this._audioByteOffset,
          byteLength,
        });
        this._audioByteOffset += byteLength;
      }
      if (typeof part?.text === "string" && part.text.trim()) {
        const cleaned = sanitizeIdentityResponse(part.text, this._lastUserText);
        this._emit({ type: "transcript.output", text: cleaned });
      }
    }

    // SDK convenience getter — some SDK versions only populate `data`.
    if ((!parts.length || !parts.some((p) => p?.inlineData?.data)) && message.data) {
      const byteLength = Buffer.from(message.data, "base64").length;
      this._emit({
        type: "audio",
        data: message.data,
        mimeType: LIVE_OUTPUT_MIME,
        format: LIVE_OUTPUT_FORMAT,
        sampleRate: LIVE_OUTPUT_SAMPLE_RATE,
        offset: this._audioByteOffset,
        byteLength,
      });
      this._audioByteOffset += byteLength;
    }

    if (typeof message.text === "string" && message.text.trim()) {
      const cleaned = sanitizeIdentityResponse(message.text, this._lastUserText);
      this._emit({ type: "transcript.output", text: cleaned });
    }

    if (content.turnComplete || content.generationComplete) {
      const total = this._audioByteOffset;
      this._audioByteOffset = 0;
      this._emit({
        type: "turnComplete",
        generationComplete: !!content.generationComplete,
        turnComplete: !!content.turnComplete,
        byteLength: total,
      });
    }
  }

  /** @param {LiveSessionEvent} event */
  _emit(event) {
    try {
      this._onEvent(event);
    } catch (err) {
      logger.warn({ err: err.message }, "[voice-live] listener error");
    }
  }
}
