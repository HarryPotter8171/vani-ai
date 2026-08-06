# Image Edit Runtime Trace — DIFF Report

**Scope:** One edit request (`"remove the car"`). No product code was modified.  
**Method:** Live call through `image_edit` → `geminiImageService.editImage` → `@google/genai` `models.generateContent`, with a request/response interceptor (base64 truncated).  
**Official baseline:** Google Cloud Node.js sample — [Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images) (Node.js tab).  
**Date of run:** 2026-08-04T08:19:10Z (`response.createTime`).

This report records what was observed. It does **not** claim visual correctness or product success.

---

## 1. Runtime answers (observed)

| # | Question | Observed |
|---|----------|----------|
| 1 | Which tool is executed? | `image_edit` (`imageEditTool.id` / `.name`). Router: `detectImageToolIntent("remove the car", { hasImages: true })` → `{ tool: "image_edit", mode: "force" }`; `shouldForceImageEdit` → `true` (`reason=intent`). |
| 2 | Which model is called? | `gemini-2.5-flash-image` (`IMAGE_MODEL` default; `VANI_IMAGE_MODEL` unset). Response `modelVersion`: `gemini-2.5-flash-image`. |
| 3 | Exact request payload shape (no full base64) | See §1.1 |
| 4 | Is `inlineData` present? | **Yes** — first part of `contents[0].parts`. |
| 5 | Response headers / metadata | See §1.2 |
| 6 | Exact Gemini SDK method | `client.models.generateContent(...)` (`@google/genai` / `GoogleGenAI`) |
| 7 | Edit vs text-to-image signal? | **Neither SDK nor API labels the call as image-edit.** Same method as generation: `models.generateContent`. App path was `editImage()` (not `generateImage()`, not Imagen `editImage`). Indication of “edit” is only multimodal input (source `inlineData` + text). Prompt usage included `IMAGE` tokens (1806). |

### 1.1 Request payload shape (runtime)

```json
{
  "model": "gemini-2.5-flash-image",
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "[base64 length=2572 decodedBytes=1927]",
            "width": 640,
            "height": 400
          }
        },
        {
          "text": "Using the provided image, apply only this edit: remove the car. Keep everything else in the image exactly the same — preserve the original camera angle, subjects, objects, perspective, lighting, colors, textures, and composition except where this edit requires a change. Do not redraw, restyle, or regenerate the scene from scratch."
        }
      ]
    }
  ],
  "config": {
    "responseModalities": ["TEXT", "IMAGE"]
  }
}
```

**Part order:** `["inlineData", "text"]`  
**Pre-send processing:** Source PNG (6612 bytes raw / base64 len 8816) was run through `prepareEditSourceImage` → re-encoded PNG 1927 bytes @ 640×400 before the API call.

**Client construction (from `geminiClient.js`, not in payload):**

```js
new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT, // vani-ai-504209
  location: process.env.GOOGLE_CLOUD_LOCATION, // global
  apiVersion: "v1",
})
```

### 1.2 Response headers / metadata (runtime)

**HTTP headers** (`response.sdkHttpResponse.headers`):

| Header | Value |
|--------|-------|
| `alt-svc` | `h3=":443"; ma=2592000,h3-29=":443"; ma=2592000` |
| `content-encoding` | `gzip` |
| `content-length` | `640924` |
| `content-type` | `application/json; charset=UTF-8` |
| `date` | `Tue, 04 Aug 2026 08:19:18 GMT` |
| `server` | `scaffolding on HTTPServer2` |
| `vary` | `Origin, X-Origin, Referer` |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `SAMEORIGIN` |
| `x-xss-protection` | `0` |

**Response object keys:** `sdkHttpResponse`, `candidates`, `createTime`, `modelVersion`, `responseId`, `usageMetadata`

**Metadata:**

| Field | Value |
|-------|-------|
| `responseId` | `fqBxasySM9ak7PkPlo6bkQI` |
| `createTime` | `2026-08-04T08:19:10.837964Z` |
| `modelVersion` | `gemini-2.5-flash-image` |
| `candidates[0].finishReason` | `STOP` |
| `promptFeedback` | `null` |
| `safetyRatings` | `null` |
| `usageMetadata.promptTokenCount` | `1872` |
| `usageMetadata.candidatesTokenCount` | `1290` |
| `usageMetadata.totalTokenCount` | `3162` |
| `usageMetadata.trafficType` | `ON_DEMAND` |
| prompt modalities | TEXT=66, IMAGE=1806 |
| candidate modalities | IMAGE=1290 |
| response parts | one `inlineData` (`image/png`, base64 length `850176`); **no text part** |

App-level return (for trace completeness only — not a quality judgment): `ok: true`, `mode: "Edit"`, `mimeType: "image/png"`, `sourceMime: "image/png"`, `sourceWidth/Height: 640×400`.

---

## 2. Official Google Node.js edit example (baseline)

From Cloud docs Node.js sample (`generateImage` function name in docs; body is an edit):

```js
const client = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location, // sample default us-central1 if env unset
});

const imageBytes = fs.readFileSync(FILE_NAME);

const response = await client.models.generateContent({
  model: 'gemini-2.5-flash-image',
  contents: [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBytes.toString('base64'),
          },
        },
        {
          text: 'Edit this image to make it look like a cartoon',
        },
      ],
    },
  ],
  config: {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
  },
});
```

---

## 3. Every difference (VANI runtime vs official Node sample)

| # | Area | Official Node sample | VANI runtime (`"remove the car"`) | Diff? |
|---|------|----------------------|-----------------------------------|-------|
| D1 | SDK method | `client.models.generateContent` | `client.models.generateContent` | **Same** |
| D2 | Model id | `gemini-2.5-flash-image` | `gemini-2.5-flash-image` | **Same** |
| D3 | `contents[].role` | `"user"` | `"user"` | **Same** |
| D4 | Part order | `inlineData` then `text` | `inlineData` then `text` | **Same** |
| D5 | `inlineData` present | Yes | Yes | **Same** |
| D6 | `inlineData.mimeType` | `image/png` (file as-read) | `image/png` (after prepare) | **Same in this run** |
| D7 | `config.responseModalities` | `[Modality.TEXT, Modality.IMAGE]` → `["TEXT","IMAGE"]` | `["TEXT","IMAGE"]` | **Same** |
| D8 | Dedicated edit API / `models.editImage` | Not used | Not used | **Same** (no API-level edit flag) |
| D9 | Text prompt wording | Short: `"Edit this image to make it look like a cartoon"` | Wrapped via `buildEditInstruction`: long “Using the provided image, apply only this edit: remove the car. Keep everything else…” (332 chars) | **Different** |
| D10 | Source bytes | Raw `fs.readFileSync` → base64, no resize/re-encode | `prepareEditSourceImage` (sharp rotate/RGB, max edge 1568, re-encode PNG/JPEG) before send | **Different** |
| D11 | Client `apiVersion` | Not set in sample | `"v1"` | **Different** |
| D12 | Client `location` | Sample default `us-central1` when env unset | Runtime env `global` | **Different** |
| D13 | Client `project` | Sample placeholder / env | `vani-ai-504209` | Env-specific (expected) |
| D14 | `config.imageConfig` / aspectRatio / imageSize | Absent in Node sample | Absent | **Same** (both omit; REST sample elsewhere *does* include `imageConfig`) |
| D15 | `fileData` / GCS URI | Not in Node sample (REST sample uses `fileData`) | Not used; only `inlineData` | **Same vs Node**; differs from REST tab |
| D16 | App entrypoint | Standalone script | Tool `image_edit` → service `editImage` | **Different** (app layer only; wire format still generateContent) |
| D17 | Instruction source | Hardcoded cartoon edit string | User string `"remove the car"` then rewritten by `buildEditInstruction` | **Different** |
| D18 | Multi-turn / chat session | Single-shot `generateContent` | Single-shot `generateContent` (not `ai.chats.create`) | **Same** vs this Node sample |
| D19 | Safety settings in request | Not in Node sample | Not in request | **Same** |
| D20 | Response text part | Sample commentary expects text + image | This run: **image part only** (no text) | **Outcome difference** (not a request-shape difference) |

### Cross-doc notes (not Node baseline, but relevant)

These are **not** counted against the Node sample above, but they appear in other official Google examples:

| Source | Difference from VANI / Node Cloud sample |
|--------|------------------------------------------|
| Cloud docs **Python** tab (same page) | Model shown as `gemini-3.1-flash-image`; contents as `[image, text]` without explicit `role`/`parts` wrapper |
| Cloud docs **Go** tab | Part order is **text then image** (opposite of Node) |
| Cloud docs **REST** tab | Uses `fileData.fileUri`, nested `generationConfig.imageConfig` (`aspectRatio`, `imageSize`, `imageOutputOptions`, `personGeneration`), plus `safetySettings` |
| AI Studio / nano-banana JS kit | Often `apiKey` (not Vertex), model `gemini-2.5-flash-image-preview`, parts as flat array **text then inlineData**, often **no** `responseModalities` |

---

## 4. Edit vs generation (runtime evidence)

| Signal | Observed |
|--------|----------|
| App function | `editImage` (via tool `image_edit`) |
| Alternate app path used? | No — `generateImage` not called |
| Imagen `models.editImage` | Not called |
| SDK method name | `generateContent` (shared with text-to-image) |
| API/SDK enum or flag `"edit"` | **None** |
| What distinguishes edit on the wire | Presence of source `inlineData` + edit text; prompt token details include IMAGE modality |

---

## 5. Trace caveats

1. Probe invoked `image_edit.execute` with an in-memory attachment (synthetic PNG with a red “car” rectangle). Full HTTP chat upload → `runDirectImageEdit` was not separately exercised; router intent for the same phrase was verified independently.
2. Source was preprocessed; byte sizes on the wire are post-`prepareEditSourceImage`, not the original upload bytes.
3. Response returned an image blob; this report does **not** assert that the car was removed or that the composition was preserved.
4. No product source files were changed for this investigation.
