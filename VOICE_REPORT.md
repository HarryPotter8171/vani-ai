# VANI AI Voice Module — Verification Report

**Date:** 2026-08-06  
**Scope:** Voice only (STT, TTS, Live Voice, permissions, interrupt, stop/resume, streaming, settings, providers, reconnect, errors, quality, latency, mobile)  
**Constraints:** No unrelated module changes · no UI redesign · preserve architecture · fix genuine bugs only

---

## Executive summary

The Voice module is **production-capable for the default legacy hands-free Live Mode** (browser STT + chat SSE + ElevenLabs chunked TTS, with Gemini PCM as fallback). Several stability bugs were fixed in this pass. Remaining gaps are mostly provider/engine completeness (Deepgram/Whisper stubs, Gemini Live `VOICE_ENGINE=live`, iOS Safari quirks) rather than broken core UX.

| Area | Status |
|------|--------|
| Speech-to-Text | Verified (browser Web Speech + HTTP/WS Gemini STT fallback) |
| Text-to-Speech | Verified (ElevenLabs primary Live path + Gemini PCM cascade) |
| Live Voice mode | Verified (hands-free loop via `LifecycleManager`) |
| Mic permissions | Verified (getUserMedia + `not-allowed` error path) |
| Interruption / barge-in | Verified (UI + VAD barge-in; HTTP↔WS interrupt linked) |
| Stop / Resume | Verified (interrupt hard-stop; mute/unmute; message TTS pause/resume) |
| Streaming | Verified (mic WS chunks + sentence-chunk ElevenLabs; idle race fixed) |
| Voice settings | Partial (API + state exist; overlay does not expose full controls) |
| Multi-provider | Partial (Gemini + ElevenLabs live; Deepgram/Whisper stubs) |
| Reconnect | Verified (backoff + exhaustion surfaced to UI) |
| Error handling | Verified (structured codes; TTS cascade; mic denial) |
| Audio quality / latency | Acceptable for launch; Gemini “stream” is post-synth slice |
| Mobile | Partial (safe-area + MSE fallbacks; iOS WebM/Speech gaps remain) |

**Verdict:** Ready for production on **legacy** engine with known limitations documented below. Gemini Live engine (`VOICE_ENGINE=live`) is Phase 1 infra — not the default client path.

---

## Architecture (preserved)

```
Browser Live Mode (default)
  mic → Web Speech STT (+ VAD finalize) → chat SSE
  assistant tokens → speakable chunks → POST /api/tts (ElevenLabs MP3)
  optional duplex WS /api/voice/ws → Gemini STT/TTS PCM fallback

Backend engines (VOICE_ENGINE)
  legacy (default): VoiceWebSocket + VoiceService (Gemini STT/TTS)
  live: LiveVoiceWebSocket + VoiceSessionManager + GeminiLiveSession
```

Single lifecycle authority: `LifecycleManager` (via `getVoiceRuntime()`).

---

## Verified functionality

### Speech-to-Text
- Browser Web Speech Recognition with partials + finals
- VAD end-of-speech finalize gated so recognition/VAD cannot double-commit
- HTTP `POST /api/voice/stt` (multipart + base64)
- WS `audio.start` → `audio.chunk` → `audio.end` → `transcript.final`
- Dedup window + LifecycleManager commit gates

### Text-to-Speech
- Live Mode mid-stream: ElevenLabs via `/api/tts` + `Mp3PlaybackQueue`
- Fallback cascade: WS PCM → HTTP SSE PCM → oneshot PCM → ElevenLabs
- Message “read aloud”: `useMessageTts` + MSE when supported
- Identity Guard + `sanitizeForSpeech` before Gemini synth
- Voice catalog via `GET /api/voice/voices`

### Live Voice mode
- Session create → optional WS → hands-free listen loop
- Minimize keeps session; close ends session + tears down mic/TTS/WS
- Waveform / phase / elapsed timer wired through `VoiceModeHost`

### Microphone permissions
- `getUserMedia(VOICE_AUDIO_CONSTRAINTS)` with AEC hints
- Permission denial → error phase + user-visible message
- SpeechRecognition `not-allowed` handled

### Voice interruption
- Explicit interrupt: stop playback, abort TTS, WS/HTTP interrupt, restart listen
- Hands-free barge-in VAD while speaking/processing
- PCM fade on interrupt (`AudioPlaybackQueue`)
- **Fixed:** HTTP `POST /voice/interrupt` now aborts in-flight WS TTS via hook

### Stop / Resume
- Live interrupt = hard stop (no resume of same utterance) — correct for voice calls
- Mute stops mic + speaking; unmute restarts hands-free listen
- Message TTS: pause / resume / stop on `HTMLAudioElement`

### Streaming voice
- MediaRecorder timeslice → WS base64 chunks
- Sentence/clause chunking for early first audio
- Keepalive ping on WS (20s client / 25s server)

### Voice settings
- `VoiceSettings` (voice, speed, volume, language, mode, speakerOn)
- Persisted default voice in `localStorage`
- Volume applied to PCM **and** MP3 queues (fixed this pass)
- Full settings/PTT UI exists in `VoiceControls.tsx` but is not mounted (by design of current overlay — not changed)

### Providers
| Provider | Role | Status |
|----------|------|--------|
| Gemini multimodal | STT | Working (legacy) |
| Gemini TTS | PCM voice speak | Working (legacy) |
| ElevenLabs Flash | Live + Listen MP3 | Working |
| Gemini Live Native Audio | `VOICE_ENGINE=live` | Backend Phase 1; client still uses legacy orchestration |
| Deepgram / Whisper | STT provider stubs | `supported: false` |

### Reconnection
- Exponential backoff (400ms → 10s, max 8 attempts)
- **Fixed:** exhaustion emits `reconnect_exhausted` / `WS_RECONNECT_EXHAUSTED` and surfaces error in Live Mode
- HTTP STT/TTS remain available when WS is down

### Error handling
- Structured `{ error, code }` HTTP and WS frames
- TTS cascade on provider failure
- STT short-audio / ownership / session-not-found covered by tests

### Audio quality & latency
- ElevenLabs: true upstream stream (`optimize_streaming_latency=4`), Live path waits for full chunk blob before play (tradeoff for simplicity)
- Gemini TTS “stream”: full synth then ~50–100ms PCM slices (TTFB = full synth time)
- VAD silence ~700ms + ~320ms finalize delay before commit
- First-audio chunking tuned (`minChars` 6–8)

### Mobile compatibility
- Safe-area insets on overlay/FAB
- MSE gated; Safari falls back to full blob for message TTS
- Risks remain: weak/absent Web Speech on Firefox/some Safari; WebM on iOS; multiple `AudioContext`s

---

## Bugs fixed (this pass)

1. **Premature ElevenLabs idle / mic restart between streamed chunks**  
   `Mp3PlaybackQueue` fired `onIdle` when the queue emptied while the next sentence chunk was still fetching. Added `expectMore` / `releaseExpect` producer holds + `tryFinishElevenLabsSpeak` that waits for stream end, speak buffer, and in-flight fetches.

2. **Live Gemini `closed` / `goAway` leaked managed sessions**  
   `LiveVoiceWebSocket` nulled `managedId` without `voiceSessionManager.stop`, exhausting `LIVE_MAX_SESSIONS_PER_USER`. Now stops the managed session on both events.

3. **Volume settings ignored mid-session on MP3 path**  
   `updateSettings` only updated PCM `AudioPlaybackQueue`. Now also calls `mp3QueueRef.setVolume`.

4. **Silent WS reconnect exhaustion**  
   After 8 attempts, client went quiet with `socketConnected: false`. Now emits error events and Live Mode sets a user-visible error.

5. **HTTP interrupt did not cancel in-flight WS TTS**  
   Wired `voiceService.setWsTtsAbortHook(abortVoiceTtsForSession)` so `POST /api/voice/interrupt` aborts the matching duplex TTS `AbortController`.

6. **Overstated `streamingStt` capability on legacy engine**  
   Legacy server STT is utterance-final; flag is now `true` only when `VOICE_ENGINE=live`.

7. **Gemini Live UI interrupt was emit-only**  
   Best-effort `activityStart`/`activityEnd` signals added; local `interrupted` still emitted so clients flush playback immediately. (True server cancel still depends on VAD/mic audio per Gemini Live API.)

---

## Tests run

| Suite | Result |
|-------|--------|
| `backend` unit `tests/unit/voice` + `tests/unit/voiceLive` | Pass |
| `backend` integration `voice.test.js` + `voiceWs.test.js` | Pass |
| `frontend` `tests/unit/voice` (incl. new `mp3Queue.test.ts`) | **27/27 pass** |
| Backend voice smoke (capabilities, protocol, interrupt hook, Live interrupt emit) | OK |

**Combined:** 47 backend + 27 frontend voice-related tests passing.

### New / updated tests
- `frontend/tests/unit/voice/mp3Queue.test.ts` — producer hold / idle semantics
- `backend/tests/unit/voice/VoiceService.test.js` — WS abort hook on HTTP interrupt; `streamingStt: false` legacy
- `backend/tests/unit/voiceLive/voiceLive.test.js` — legacy `streamingStt` assertion

---

## End-to-end voice flow (verified by code + tests)

```
openVoiceMode
  → POST /voice/session
  → VoiceSocket connect (optional; HTTP fallback)
  → startListening (getUserMedia + Web Speech + VAD + MediaRecorder)
  → utterance commit (LifecycleManager) → sendMessage(voiceMode)
  → assistant stream → extractSpeakableChunks → ElevenLabs enqueue
  → playback complete (held until stream+fetches done) → return to listening
  → interrupt / mute / close teardown paths
```

Automated coverage exercises HTTP STT/TTS/session/IDOR, WS auth/bind/transcript/TTS/interrupt, and frontend lifecycle gates. Full browser mic E2E still requires a manual device check (permissions + real audio).

---

## Remaining issues (not fixed — by design or out of scope)

| Issue | Severity | Notes |
|-------|----------|-------|
| `VoiceControls` / PTT UI not mounted | Low | Overlay is ChatGPT-style; wiring would be UI work |
| Deepgram / Whisper STT stubs | Low | Explicit future providers |
| Gemini TTS fake streaming (full synth then slice) | Medium | Latency; needs provider streaming API if available |
| Gemini Live not default client path | Medium | `VOICE_ENGINE=live` backend ready; frontend still legacy-orchestrated |
| Live programmatic interrupt limited by Gemini API | Medium | No cancel RPC with auto VAD; barge-in via mic audio |
| In-memory voice sessions only | Medium | Multi-instance / restart loses sessions |
| Auth token in WS query string | Low | Prefer `Sec-WebSocket-Protocol` / cookie in a later hardening pass |
| iOS WebM / Web Speech gaps | Medium | May need `audio/mp4` recorder + cloud STT-first on iOS |
| Dual TTS voice selection | Low | Mid-stream ElevenLabs ignores Gemini voice picker |
| Concurrent async WS message handlers | Low | Rare race under parallel frames |
| Message TTS `paragraphIndex` unfinished | Low | Highlighting stub |

---

## Production readiness

**Legacy Live Mode (default): Yes, with monitoring.**

Ship checklist:
- [x] Session CRUD + ownership
- [x] STT HTTP + WS
- [x] TTS cascade + ElevenLabs Listen
- [x] Interrupt (WS + HTTP linked)
- [x] Reconnect with user feedback
- [x] Lifecycle single-commit / single-speak
- [x] Unit + integration tests green
- [ ] Manual device QA (Chrome desktop + Safari iOS) before wide rollout
- [ ] Confirm `ELEVENLABS_API_KEY` + Vertex credentials in prod
- [ ] Keep `VOICE_ENGINE=legacy` until Live client bridge is complete

**Gemini Live engine:** Backend Phase 1 only — do not flip `VOICE_ENGINE=live` in production until the frontend speaks the Live protocol end-to-end and session resume after `goAway` is productized.

---

## Files touched

**Frontend**
- `frontend/lib/tts/mp3Queue.ts`
- `frontend/hooks/useVoiceMode.ts`
- `frontend/lib/voice/VoiceSocket.ts`
- `frontend/tests/unit/voice/mp3Queue.test.ts` (new)

**Backend**
- `backend/services/voice/VoiceService.js`
- `backend/services/voice/VoiceWebSocket.js`
- `backend/services/voiceLive/LiveVoiceWebSocket.js`
- `backend/services/voiceLive/GeminiLiveSession.js`
- `backend/services/voiceLive/VoiceSessionManager.js`
- `backend/tests/unit/voice/VoiceService.test.js`
- `backend/tests/unit/voiceLive/voiceLive.test.js`
