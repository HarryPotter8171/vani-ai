# Image Editing Fix Report

## Trace (runtime proof)

User examples that produced a **new** image:

- `Is photo me snowfall kar do`
- `Sirf pool ka pani red kar do`

| Step | Function | Model | Uploaded bytes passed? | inlineData / refs | Mode |
|------|----------|-------|------------------------|-------------------|------|
| Upload | `buildMessageParts` / attachments | — | Yes (on disk + chat) | May be present in contents | — |
| Planner / intent | `detectImageToolIntent` | — | N/A | N/A | **null** for Hinglish |
| Tool router | `shouldForceImageEdit` → false | — | N/A | N/A | No force |
| LLM tool pick | often `image_generation` | chat model | **No** | none | Generate |
| Image tool | `imageGenerationTool.execute` → `generateImage()` | `gemini-2.5-flash-image` | **No** | text parts only | **Generate** |
| Gemini | `models.generateContent` | `gemini-2.5-flash-image` | **No** | no image parts | **Generate** |

### Exact discard line

`backend/services/geminiImageService.js` → `generateImage()` builds:

```js
parts: [{ text: `Generate an image for this request...` }]
```

Uploaded image bytes are never added. Once the router selects `image_generation`, the source image is gone.

Previously, even the “edit” path called `models.generateContent` on `gemini-2.5-flash-image` (text-to-image style), which can redraw a new scene. That is not the Vertex image **edit** API.

## Fix

1. **Router** — Hinglish (`kar do` / `bana do`) + English edit verbs with an uploaded image force `image_edit`. Latest-turn uploads force edit (never generation).
2. **Edit API** — `editImage()` calls `client.models.editImage` with:
   - model: `imagen-3.0-capability-001` (`VANI_IMAGE_EDIT_MODEL`)
   - `RawReferenceImage` carrying source `imageBytes`
   - `EditMode.EDIT_MODE_DEFAULT`
   - prompt = user instruction (no prompt engineering patch)
3. **Generate API** — `generateImage()` remains text-only `generateContent` on `gemini-2.5-flash-image`. Never used for edits.

## New flow

```
upload + “make pool water red” / “snowfall kar do” / “add a dog”
  → shouldForceImageEdit = true
  → runDirectImageEdit → image_edit tool
  → editImage()
  → models.editImage(imagen-3.0-capability-001, RawReferenceImage)
  → same photo, local change only
```

## Verification cases (routing + API contract)

| Case | Forced tool | API | Source bytes |
|------|-------------|-----|--------------|
| Upload + make pool water red | `image_edit` | `models.editImage` | yes |
| Upload + add snowfall | `image_edit` | `models.editImage` | yes |
| Upload + add a dog | `image_edit` | `models.editImage` | yes |
| Upload + Is photo me snowfall kar do | `image_edit` | `models.editImage` | yes |
| Upload + Sirf pool ka pani red kar do | `image_edit` | `models.editImage` | yes |
| No upload + generate an image of X | `image_generation` | `generateContent` | no |

## Files changed

| File | Change |
|------|--------|
| `backend/services/imageToolIntent.js` | Hinglish edit detection; `hasEditIntent` |
| `backend/services/imageEditPipeline.js` | Force edit on latest-turn upload |
| `backend/services/geminiImageService.js` | `editImage` → Imagen `models.editImage` only |
| `backend/services/geminiClient.js` | `IMAGE_EDIT_MODEL` |
| `backend/tools/implementations/imageEdit.js` | Uses edit API |
| `backend/services/testDoubles/mockGeminiClient.js` | Mock `editImage` |
| Tests | Intent, pipeline, edit service/tool |

## Commands

```bash
cd backend && npm run build && npm run lint && npm run test:unit
cd ../frontend && npm run lint && npm run build
```

## Verification run

| Check | Result |
|-------|--------|
| Hinglish intent → `image_edit` | ✅ |
| Three verification phrases → `image_edit` + force | ✅ |
| `editImage` calls `models.editImage` with source bytes | ✅ |
| `editImage` never calls `generateContent` | ✅ |
| Backend build / lint | ✅ 270 files |
| Unit tests | ✅ 284 |