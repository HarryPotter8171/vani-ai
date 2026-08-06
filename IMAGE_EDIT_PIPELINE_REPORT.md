# Image Edit Pipeline — Implementation Report

## Root cause

When a user uploaded an image and asked for edits like “add a dog” or “remove the background”, VANI answered in text (“I cannot edit…”, “I can generate a new image instead”) instead of calling `image_edit`.

Why the tool was not called:

1. **Edit-intent detection was too narrow** — phrases such as `add a dog`, `replace the sky`, and `change shirt color` did not match the previous regex, so no force path ran.
2. **LLM was still in the loop** — even with `FunctionCallingConfigMode.ANY`, the model could stream a capability refusal before/instead of a reliable tool call.
3. **Attachment context was incomplete** — `toolContext` only passed the latest message’s attachments; earlier-turn uploads and `fileId`-only chips were easy to miss.
4. **Failure copy was generation-oriented** — edit failures reused generation wording, which the model paraphrased as “I cannot edit images.”

## Fix

Deterministic **direct image-edit pipeline**:

1. Detect edit intent + editable image (inline bytes, hydrated attachments, or image `fileId`s).
2. **Do not ask the LLM first.**
3. Invoke `image_edit` with `{ instruction, imageFileId }`.
4. Stream `Editing image...` + tool events + edited image.
5. On failure, return exactly: **The image editing service is temporarily unavailable.**
6. On success, allow a short caption turn with tools disabled.

## Files changed

| File | Change |
|------|--------|
| `backend/services/imageToolIntent.js` | Broad edit verbs; separate edit/gen unavailable messages; `pickLatestImageFileId` |
| `backend/services/imageEditPipeline.js` | **New** direct edit runner (`runDirectImageEdit`) |
| `backend/services/toolOrchestrator.js` | Bypass LLM for forced edits |
| `backend/services/multiProviderAgent.js` | Same direct-edit path |
| `backend/tools/implementations/imageEdit.js` | `imageFileId` hydrate; default latest image; edit unavailable copy |
| `backend/tools/implementations/imageParts.js` | Treat fileId-only image chips as present |
| `backend/controllers/chatController.js` | Pass `conversationAttachments` into tool context |
| `backend/controllers/agentController.js` | Same for agents |
| `backend/services/geminiService.js` | Stronger edit rules in system prompt |
| `backend/agents/Planner.js` / `Executor.js` / `tools/adapters.js` | Edit awareness + `imageFileId` |
| `frontend/hooks/useChat.ts` | Show tool start label when content empty |
| `frontend/lib/agents/ToolRegistry.ts` | Register image tools in UI metadata |
| Tests | Intent, pipeline, edit tool, prompt |

## Behavior matrix

| User (with uploaded image) | Result |
|----------------------------|--------|
| add a dog | Direct `image_edit` |
| remove the background | Direct `image_edit` |
| replace the sky | Direct `image_edit` |
| change shirt color | Direct `image_edit` |
| remove this object | Direct `image_edit` |
| edit this image | Direct `image_edit` |
| Edit tool API failure | “The image editing service is temporarily unavailable.” |
| Unrelated text, no image | No forced edit |

## Test cases

- `imageToolIntent.test.js` — all listed edit phrases force `image_edit` when `hasImages`
- `imageEditPipeline.test.js` — streams “Editing image…”, passes `imageFileId`, failure copy
- `imageEdit.test.js` — kill-switch uses edit unavailable message
- `geminiService.prompt.test.js` — prompt forbids edit refusals / “generate instead”
- `Planner.test.js` — image edit/generation plan steps

## Verification

| Command | Result |
|---------|--------|
| `backend`: `npm run build` | ✅ 269 files |
| `backend`: `npm run lint` | ✅ |
| `backend`: `npm run test:unit` | ✅ 273 tests |
| `frontend`: `npm run lint` | ✅ |
| `frontend`: `npm run build` | ✅ |

```bash
cd backend && npm run build && npm run lint && npm run test:unit
cd ../frontend && npm run lint && npm run build
```
