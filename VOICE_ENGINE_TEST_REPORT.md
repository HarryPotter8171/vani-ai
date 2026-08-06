# Voice Engine E2E Audit & Test Report

**Date:** 2026-08-05  
**Scope:** Frontend voice lifecycle only (no UI redesign, no backend API changes)

## Executive Summary

The voice engine was refactored around a **single state machine** (`VoiceEngine.ts`) that owns utterance commit gates, assistant speak gates, and return-to-listening scheduling. Duplicate submit paths, scattered `processingTurnRef` guards, and triple restart timers were removed.

**Result:** 18/18 unit tests passing. Root causes addressed architecturally rather than with additional patches.

---

## Lifecycle Under Test

```
idle → listening → thinking → speaking → listening (hands-free loop)
         ↑           ↑            ↑
       VAD+STT    sendMessage   TTS+playback
```

| Stage | Component | Single Owner |
|-------|-----------|--------------|
| Listening | `startListeningInternal` + `VoiceEngine.beginListenCycle()` | Engine state `listening` |
| Speech Recognition | `createSpeechRecognition` singleton | One process-wide instance |
| VAD | `VoiceActivityDetector` on shared mic stream | End-of-speech triggers finalize only |
| Transcript commit | `VoiceEngine.tryCommitUserUtterance` | One commit per listen cycle |
| Request | `sendCommittedUtterance` via ref (no stale closure) | One network send per commit |
| Streaming | Chat `messages` effect | Updates turns in place, no mid-stream TTS |
| TTS | `speakAssistantOnce` + `tryBeginAssistantSpeak` | One speak per assistant message id |
| Playback | `AudioPlaybackQueue` | PCM completion via single `onIdle` |
| Return to Listening | `scheduleReturnToListening` | One debounced scheduler (120ms) |

---

## Root Causes Found & Fixed

### 1. Dual STT submit paths (duplicate transcripts)

**Before:** Browser `onFinal` called `submitTranscript` AND VAD `onSpeechEnd` also called `submitTranscript` after `recognition.stop()`.

**Fix:**
- `onFinal` → `engine.onRecognitionFinal()` → `sendCommittedUtteranceRef`
- VAD → `engine.requestListenFinalize(cycleId, finalizeFn)` — serialized gate; ignored if recognition already committed
- Engine rejects second commit via `listenFinalCommitted` + `listenFinalizeInFlight`

### 2. Scattered busy-state guards (`processingTurnRef`)

**Before:** `processingTurnRef` duplicated engine concerns across 12 call sites.

**Fix:** Replaced with `VoiceEngine.isBusy()` and state transitions (`listening` / `thinking` / `speaking`).

### 3. Triple return-to-listening schedulers

**Before:**
- `playback.onIdle` manual `setTimeout`
- Browser TTS manual restart in `speakAssistantOnce`
- Failure path manual restart

**Fix:**
- Single `scheduleReturnToListening()` helper wired to engine timer
- PCM paths: **only** `playback.onIdle` when `engine.state === 'speaking'`
- Browser TTS: `finishSpeak(ok, true)` schedules restart
- No duplicate timers

### 4. Stale closures in STT callbacks

**Before:** `submitTranscript` captured in `useCallback([])` while recognition handlers closed over initial version.

**Fix:** `sendCommittedUtteranceRef.current` pattern — handlers always call latest send function.

### 5. Duplicate assistant TTS

**Before:** `spokenAssistantIdRef` + `processingTurnRef` + streaming sentence TTS could overlap.

**Fix:** `tryBeginAssistantSpeak(messageId)` atomically marks id and transitions to `speaking`. Effect skips if already spoken.

### 6. SpeechRecognition double-flush

**Before:** `stop()` flush + `onend` flush could emit same final twice.

**Fix:** `finalFlushedThisCycle` flag in `speechRecognition.ts` (retained from prior work).

### 7. speak generation races

**Before:** Local `speakGenerationRef` could drift from playback interrupt state.

**Fix:** `engine.getSpeakGeneration()` / `engine.invalidateSpeak()` on interrupt; generation checked before TTS completion callbacks.

---

## Architecture After Refactor

```
┌─────────────────────────────────────────────────────────┐
│                    VoiceEngine (singleton)               │
│  listenCycleId · listenFinalCommitted · spokenAssistantId │
│  speakGeneration · scheduleReturnToListening (single)      │
└───────────────┬─────────────────────────────────────────┘
                │ onStateChange → React phase
┌───────────────▼─────────────────────────────────────────┐
│                   useVoiceMode hook                      │
│  sendCommittedUtteranceRef · startListeningInternalRef   │
│  listenCycleIdRef · listenGenerationRef                  │
└─────────────────────────────────────────────────────────┘
```

**Not changed (by design):**
- UI components (`VoiceOverlay`, `FloatingVoiceOrb`, etc.)
- Backend voice APIs / WebSocket protocol
- Barge-in uses a separate VAD instance during speaking (higher threshold); interrupt clears engine speak generation

---

## Unit Test Results

```
Test Files  2 passed (2)
Tests       18 passed (18)
Duration    ~900ms
```

### VoiceEngine.test.ts (7 tests)

| Test | Verifies |
|------|----------|
| One commit per cycle | `tryCommitUserUtterance` rejects second call |
| Dedup window | Same text rejected across cycles within window |
| VAD vs recognition race | `listenFinalizeInFlight` blocks recognition final |
| Recognition final wins | Direct final commits when VAD not in flight |
| One speak per message id | `tryBeginAssistantSpeak` dedupes by id |
| Interrupt invalidates speak | Stale generation ignored on complete |
| resetSession clears gates | Clean idle after session reset |

### speechHelpers.test.ts (11 tests)

Transcript normalization, dedupe, markdown strip, sentence chunking — all passing.

---

## Manual E2E Checklist (browser required)

Run in Chrome with mic permission:

- [ ] **Open Live Mode** — phase: connecting → listening, waveform animates
- [ ] **Speak once** — exactly one user turn appended, no duplicate rows
- [ ] **Assistant reply** — one TTS playback after stream completes (not during)
- [ ] **Return to listening** — mic reopens automatically in hands-free (~120ms after TTS)
- [ ] **Interrupt (barge-in)** — TTS stops, listening resumes, interrupted reply not re-spoken
- [ ] **Mute / unmute** — mic stops on mute, restarts on unmute
- [ ] **Close Live Mode** — all tracks stopped, engine reset, no orphan listeners
- [ ] **Push-to-talk** — commit only on release, single turn

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/lib/voice/VoiceEngine.ts` | State machine — commit/speak/restart gates |
| `frontend/hooks/useVoiceMode.ts` | Wired to engine; removed duplicate paths |
| `frontend/lib/voice/speechRecognition.ts` | `finalFlushedThisCycle` anti-double-flush |
| `frontend/tests/unit/voice/VoiceEngine.test.ts` | New — 7 tests |

---

## Remaining Risks (low)

1. **Browser STT variance** — Safari/Firefox Web Speech API behavior differs; server STT fallback via `flushRecorderToStt` remains.
2. **Barge-in second VAD** — separate instance during speaking; could be merged into mode-switched single VAD in a future pass.
3. **Manual browser E2E** — unit tests cover state machine logic; full mic/TTS loop requires live browser verification.

---

## Verdict

The voice engine now follows a **ChatGPT Voice / Gemini Live-style loop**: listen → commit once → think → speak once → listen. State is centralized, race conditions are gated at the engine layer, and duplicate event paths are eliminated at the root.
