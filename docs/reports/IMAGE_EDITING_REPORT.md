# VANI AI — Image Editing Verification Report

**Date:** 2026-08-06  
**Sprint item:** C1-9 — Image Editing Verification  
**Status:** Verification complete — awaiting Review

## Verified functionality

### Providers
- **Gemini image editing:** verified via `image_edit` → `geminiImageService.editImage()` → `models.generateContent` with source `inlineData` + preserve-composition edit instruction (`TEXT+IMAGE` modalities). Never uses Imagen `editImage` / text-only `generateImage`.
- **OpenAI image editing:** verified via `IMAGE_PROVIDER=openai` → `openaiImageService.editImage()` → `images.edit` (`gpt-image-1`) with Buffer-safe decode, size picking, and resolution match-back.
- **Provider selection:** `IMAGE_PROVIDER` env (`gemini` default, `openai` when set); validated at boot when OpenAI is selected (`OPENAI_API_KEY` required).
- **Fallback behavior:** no automatic cross-provider fallback. Failures return structured `ok:false` with normalized user-safe messages (`normalizeImageToolFailure`). Kill-switch `VANI_DISABLE_IMAGE_GEN=true` disables edit with the edit-specific unavailable message.

### Editing behavior
- **Edit prompt handling:** instruction required, max 2000 chars; Gemini/OpenAI wrap user text in preserve-composition local-edit frames.
- **Input image validation:** source required; `prepareEditSourceImage` rejects empty/invalid bytes and images without dimensions; photographic JPEG/HEIC passthrough; non-photo formats resize/re-encode for model safety.
- **Multiple edit requests:** conversation image attachments (current + prior turns) are available to the edit tool; latest upload preferred via `pickLatestImageFileId` / attachment pools.
- **Mask/region support:** **not implemented** as an explicit mask API. Region control is prompt-only (“edit only the requested pixels/region”).
- **Output quality pipeline:** OpenAI path uses `quality: high`, `input_fidelity: high`, and optional resolution match-back; Gemini uses prepared source bytes + composition-preserving prompt.
- **Error recovery:** missing source, prepare failures, and upstream provider failures surface as structured errors without crashing chat; force-edit without an upload returns a clear “no images” input error.

### Integration
- **Chat:** forced `runDirectImageEdit` path when edit intent + image present; SSE `tool_start` / `image` / `tool_done` / fixed success caption.
- **File uploads:** source resolved from `fileIds` → hydrated attachments → conversation chips → contents inlineData.
- **Download / storage:** edited image persisted via `storeGeneratedImage`; downloadable at `/api/files/:id/content`.
- **Conversation history:** generated edit results attach as owned image metadata (no base64 in persisted messages / SSE when persist succeeds).
- **Generation→edit redirect:** if the model still calls `image_generation` while a source image is present, orchestrator rewrites to `image_edit`.

### Performance / reliability
- No provider-native progress stream; chat surfaces final image once produced.
- Provider failures are sanitized (OpenAI) / normalized (tool layer); no bespoke retry loop inside edit services.
- After successful persist, tool results omit `imageBase64` for **both** Gemini and OpenAI (avoids large payloads in tool/SSE paths).

## Bugs fixed

1. **Gemini edit kept base64 after successful persist**
   - **Issue:** OpenAI edit path stripped `imageBase64` after `storeGeneratedImage`, but Gemini kept returning base64 alongside `fileId`/`imageUrl`, risking large payloads in tool results.
   - **Fix:** Unified post-persist return in `imageEdit.js` to omit `imageBase64` whenever a durable `fileId` is available, for all providers.
   - **Impact:** Consistent chat/SSE contract and lower memory pressure on successful edits.

2. **Missing chat upload→edit→download integration coverage**
   - **Issue:** Unit tests covered providers/pipeline, but chat upload + forced edit + persist/download was not covered end-to-end.
   - **Fix:** Added `backend/tests/integration/imageEditing.test.js` (happy path + no-source graceful failure) and `prepareEditSource` unit coverage.
   - **Impact:** Guards the production consumer edit path against regressions.

## Tests executed

```bash
cd backend && VANI_E2E_MODE=true npm test -- \
  tests/integration/imageEditing.test.js \
  tests/unit/tools/imageEdit.test.js \
  tests/unit/services/imageEditPipeline.test.js \
  tests/unit/services/geminiImageService.test.js \
  tests/unit/services/openaiImageService.test.js \
  tests/unit/services/imageToolIntent.test.js \
  tests/unit/services/prepareEditSource.test.js
```

Result:
- **7 test files passed**
- **48 tests passed**

## Remaining issues

| Area | Notes |
|------|------|
| Explicit mask / inpaint region API | Not implemented; prompt-only region guidance. |
| Cross-provider edit fallback | No Gemini↔OpenAI automatic failover on provider failure. |
| `aspectRatio` on `image_edit` schema | Declared but not passed through to provider edit calls (best-effort / unused). |
| Force-edit without upload | Certain phrases (e.g. “remove the background”) force `image_edit` even if upload detection missed; tool then returns a clear no-source error (by design). |
| Usage metering warning in tests | Non-blocking `periodEnd` update conflict warnings observed during integration runs. |

## Production Readiness Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Functionality | 8/10 | Gemini + OpenAI edit paths, prompt/source validation, chat force-edit verified. |
| Reliability | 8/10 | Failure normalization, kill-switch, persist-without-base64 consistency fixed. |
| Integration | 8/10 | Upload → chat edit → persist → download covered by new integration tests. |
| Provider resilience | 6/10 | Manual provider selection only; no automatic cross-provider fallback. |
| **Overall** | **7.5/10** | Ready for current dual-provider image editing scope (prompt-based edits). |

## Recommendation

Move C1-9 to Review and promote C1-10 (File Upload Pipeline Verification) to Current Task.  
Ship the existing Gemini/OpenAI edit pipeline for v1; treat mask APIs and cross-provider failover as follow-ups, not blockers for this verification slice.
