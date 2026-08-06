# VANI AI — File Upload Pipeline Verification Report

**Date:** 2026-08-06  
**Sprint item:** C1-10 — File Upload Pipeline Verification  
**Status:** Verification complete — awaiting Review  
**Sprint C1:** COMPLETE (all consumer verification items C1-1…C1-10 in Review)

## Verified functionality

### Upload (frontend composer)
- **Drag & drop / file picker / paste / camera:** wired through `ChatInput` + `useFileUpload.ingestFiles`.
- **Multiple files:** validated client-side (`MAX_FILES=10`, `MAX_TOTAL_SIZE_BYTES=50MB`) and uploaded; backend accepts multi-attach under field `files`.
- **Large files:** per-file cap 25MB enforced on FE + Multer `LIMIT_FILE_SIZE`.
- **Duplicate files:** same filename allowed; each upload gets a distinct UUID.
- **Progress:** image optimize 0–50%, network 50–85%, understand 85–100%; XHR `onProgress` via `apiUploadXHR`.
- **Cancellation:** AbortController cancels optimize/upload/understand; chip removed.
- **Retry:** `retryAttachment` re-runs upload for `error` status when original `File` is still in `fileMapRef`.

### Supported types
| Type | Upload | Signature | Understand / parse |
|------|--------|-----------|--------------------|
| PDF / DOCX / XLSX / TXT / MD / CSV | yes | yes | yes |
| Images (PNG/JPEG/WEBP/GIF/BMP) | yes | yes | yes (vision) |
| HEIC/HEIF | yes | ftyp check | normalize best-effort → vision |
| ZIP | yes | PK check | skipped by document understanding; chat `fileParseService` can extract |
| Legacy `.doc` / executables | rejected | — | — |

### Backend
- **Validation:** extension allowlist + MIME agreement + magic-byte signatures.
- **Storage:** disk under `backend/uploads/` with `{uuid}{ext}` + JSON sidecar metadata (`ownerId`).
- **Ownership:** all `:id` routes use `resolveOwnedUploadedFile` (IDOR → 404).
- **Security:** path sanitization, rate limit, usage guard, no filesystem paths in public metadata; signed content URLs for `<img>`.
- **Limits:** 25MB/file, 10 files, 50MB total/request, upload rate limit.
- **Cleanup:** fail-path unlinks; **owned DELETE `/api/files/:id`** now available for cancel/remove.

### Integration
- **Chat:** `fileIds` → `hydrateChatMessages` → parse/vision contents (verified SSE path).
- **Projects/RAG:** separate base64 KB upload path (verified in C1-6).
- **OCR / PDF intel / image edit:** consume owned `/api/files` ids (verified in prior C1 slices).
- **Memory:** no direct upload API; chat memory runs after hydrate.
- **Deep Research:** no dedicated upload endpoint; understand may mark research capability when text exists.
- **Image generation:** stores new owned uploads via `storeGeneratedImage`.

### Performance
- Parallel same-user uploads verified.
- Large PDF upload/parse/understand covered by existing performance suite.
- Error recovery: structured 400s for limits/spoofing; abort + delete for cancel after persist.

## Bugs fixed

1. **Cancel/remove left orphan uploads**
   - **Issue:** Composer cancel/remove aborted the client request but did not delete already-persisted files; there was no public DELETE for chat uploads.
   - **Fix:** Added owner-scoped `DELETE /api/files/:id`; frontend best-effort deletes on cancel/remove/clear and on AbortError after a successful upload id is known.
   - **Impact:** Fewer orphaned files under `backend/uploads/` when users cancel or discard attachments.

## Tests executed

```bash
cd backend && VANI_E2E_MODE=true npm test -- \
  tests/integration/fileUpload.test.js \
  tests/unit/middleware/upload.test.js \
  tests/unit/utils/fileSignatures.test.js \
  tests/integration/documentUnderstanding.test.js
```

Result:
- **4 test files passed**
- **51 tests passed**

Coverage highlights in new `fileUpload.test.js`: multi-type batch, duplicates, ZIP, HEIC signature, size/count limits, MIME spoof rejection, parallel uploads, owned delete + IDOR, chat `fileIds` hydration.

## Remaining issues

| Area | Notes |
|------|------|
| Mid-request abort before response | If the client aborts before the upload handler returns an id, the server may still finish writing; no client-driven delete in that race (TTL job not present). |
| Project KB vs chat uploads | Two systems (disk UUID vs project base64); no shared IDs/signature stack on KB path. |
| ZIP understand | ZIP uploads succeed but skip document-understanding; extraction is chat-parse only. |
| Frontend unit tests | `useFileUpload` / `validateIncomingFiles` not covered by FE unit tests (behavior covered via integration + e2e journey). |
| Retry after remount | Retry needs the original `File` in memory; lost after send/`takeReadyAttachments` or remount. |
| Batch atomic rejection | One bad signature in a multi-file request rejects and cleans the whole batch (strict by design). |

## Production Readiness Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Functionality | 8/10 | Composer + `/api/files` cover core types, multi-file, progress, cancel, retry. |
| Reliability | 8/10 | Limits, signatures, ownership solid; cancel cleanup fixed. |
| Security | 8/10 | Auth, IDOR-safe ownership, signature anti-spoof, sanitized names. |
| Integration | 8/10 | Chat/OCR/RAG/image paths consume uploads; dual KB path remains. |
| **Overall** | **8/10** | Ready for v1 consumer upload scope. |

## Recommendation

Move C1-10 to Review and **mark Sprint C1 complete**.  
Ship the current chat upload pipeline with DELETE cleanup; treat upload TTL orphans, unified project/chat storage, and ZIP understand as follow-ups outside this verification sprint.
