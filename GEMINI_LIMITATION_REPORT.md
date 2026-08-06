# Gemini Image Editing Limitation Report

**Date:** 2026-08-04  
**Verdict:** The public Gemini image-editing API (`gemini-2.5-flash-image` via `models.generateContent`) **regenerates** a new image conditioned on the source. It does **not** perform pixel-preserving local edits. This is an API/model limitation, not a VANI application bug.

**Action taken:** STOP. VANI codebase was **not** modified.

---

## 1. Experiment setup (independent of VANI)

| Item | Value |
|------|-------|
| Test folder | `backend/tests/gemini-image-edit-official/` |
| Runner | `run.js` — imports **only** `@google/genai`, `fs`, `path`, `crypto` |
| VANI imports | **None** (no toolOrchestrator, imageEditPipeline, geminiImageService, Sharp, OCR, routers) |
| SDK | `@google/genai@2.15.0` |
| Model | `gemini-2.5-flash-image` |
| Auth | Vertex AI from `backend/.env` (`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, service account) |
| Endpoint | `models.generateContent` (Vertex, `apiVersion: v1`) |
| Source | `outputs/original.jpg` (user pool photo, 2048×1152 JPEG, 502 336 bytes, SHA-256 `8a4877fe592017fcd0526aedcd8b39a44b6af100be682bc7f34cd588cf97c86a`) |

### Payload structure (exact)

```js
{
  model: "gemini-2.5-flash-image",
  contents: [{
    role: "user",
    parts: [
      { inlineData: { mimeType: "image/jpeg", data: "<raw base64 as uploaded>" } },
      { text: "<exact test instruction>" }
    ]
  }],
  config: {
    responseModalities: [Modality.TEXT, Modality.IMAGE]
  }
}
```

- No prompt engineering beyond the three user instructions  
- No preprocessing, resize, Sharp, OCR, or wrappers  
- Source bytes sent exactly as on disk  

This matches the official Google Gen AI SDK / Vertex multimodal image pattern documented for Gemini native image models.

---

## 2. Tests and outputs

| Test | Instruction | Output | Latency | Result size |
|------|-------------|--------|---------|-------------|
| 1 | Remove the white car while keeping everything else identical. | `outputs/result_1.png` | ~9.9 s | 1344×768 PNG, 1 681 850 B |
| 2 | Replace only the swimming pool water with snow. | `outputs/result_2.png` | ~8.9 s | 1344×768 PNG, 1 569 013 B |
| 3 | Change only the shirt color to black. | `outputs/result_3.png` | ~10.5 s | 1344×768 PNG, 1 688 417 B |

Artifacts:

- `outputs/original.jpg`
- `outputs/result_1.png` / `result_2.png` / `result_3.png`
- `outputs/run_report.json`
- `outputs/region_rmse.json`
- Region crops under `outputs/crop_*`

---

## 3. Evidence the model regenerates (not local-edits)

### 3.1 Fixed generative canvas size

| Image | Resolution |
|-------|------------|
| Original upload | **2048 × 1152** |
| Every Gemini output | **1344 × 768** |

Candidate IMAGE token count was **1290** on every successful run — the model’s standard image output budget, not a copy of the input pixels.

A true local editor would preserve (or closely preserve) input dimensions and leave untouched pixels identical after alignment.

### 3.2 Region RMSE after aligning original → 1344×768

| Region (should be…) | result_1 (remove car) | result_2 (pool→snow) | result_3 (shirt→black) |
|---------------------|------------------------|----------------------|-------------------------|
| mountains (unchanged) | **19.26** | **20.07** | **22.22** |
| building (mostly unchanged) | **21.40** | **75.87** | **22.23** |
| people (mostly unchanged for 1 & 3) | **20.20** | **122.19** | **19.47** |
| pool_center | 8.78 | **137.95** | 9.14 |
| car_zone | 29.91 | 24.82 | 34.46 |

Even regions that must not change (mountains, people on “remove car”) show large pixel distance. That is full-frame resynthesis with approximate scene matching — not masked inpainting.

### 3.3 Visual / semantic comparison

**Original:** Four specific men in blue pool water; white vehicle behind fence left of red brick building; volleyball in air; shirtless subjects; specific pink wing mural / “FEAR ZONE” signage.

**result_1 (remove car):** Overall layout similar, but:

- Output is a new 1344×768 render  
- Car zone / building details drift (signage, mural geometry, riverbed appearance)  
- Faces and poses are approximate lookalikes, not pixel-identical identities  

**result_2 (pool → snow):** Requested water change occurs (white foam/snow-like fill), but:

- People region RMSE **122** — faces, poses, accessories regenerated (e.g. glasses style / body positions drift)  
- Buildings heavily altered (RMSE **75**)  
- Composition is “same idea,” not the same photograph  

**result_3 (shirt → black):** Subjects are **shirtless**. Model did **not** perform a clothing recolor. It reinterpreted the request and turned the volleyball into a **solid black ball** — classic generative behavior, not surgical edit.

### 3.4 What “success-looking” outputs actually mean

Gemini can keep **semantic** structure (pool + four people + mountains) while still **redrawing** the entire frame. That looks like an edit in a casual glance and fails identity / pixel fidelity under inspection — exactly the user-reported VANI symptom.

---

## 4. Proof VANI already uses the official implementation

VANI’s live edit path (`backend/services/geminiImageService.js` → `editImage`):

```text
getGeminiClient().models.generateContent({
  model: IMAGE_MODEL,                    // gemini-2.5-flash-image
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType, data } },  // source image first
    { text: editText },
  ]}],
  config: { responseModalities: [TEXT, IMAGE] },
})
```

| Aspect | Standalone official test | VANI `editImage()` |
|--------|--------------------------|--------------------|
| SDK | `@google/genai@2.15.0` | same package |
| Client | `GoogleGenAI({ vertexai: true, project, location })` | same (`geminiClient.js`) |
| Model | `gemini-2.5-flash-image` | `IMAGE_MODEL` default same |
| API | `models.generateContent` | `models.generateContent` |
| Parts | `inlineData` then `text` | `inlineData` then `text` |
| Modalities | `TEXT`, `IMAGE` | `TEXT`, `IMAGE` |

VANI also has optional `prepareEditSourceImage` and `buildEditInstruction`. Those are **irrelevant to this verdict**: the standalone run used **raw bytes** and **bare instructions** and still regenerated. Wrappers cannot fix a generative full-frame redraw at the API layer.

---

## 5. Root cause statement

**The limitation is inside the public Gemini / Vertex image model API path used for “editing” (`gemini-2.5-flash-image` + multimodal `generateContent`).**

It is an **image-conditioned generation** API, not a Photoshop-style local edit API. Calling it “edit” in product docs describes intent; the runtime behavior is regeneration at a fixed output resolution with approximate subject consistency.

Therefore:

- Further VANI prompt / preprocessor / Sharp / routing tweaks **cannot** produce true pixel-preserving local edits on this API.  
- Product expectations must either accept generative “edit-like” redraws, or integrate a different capability (e.g. mask-based Imagen editing / dedicated inpainting product) if true local edits are required.

---

## 6. Production readiness

| Question | Answer |
|----------|--------|
| Is VANI’s wire format wrong? | **No** — matches official SDK/Vertex pattern |
| Does standalone official sample preserve identity/pixels? | **No** |
| Is Gemini API at fault for “new photo” behavior? | **Yes** (model regenerates) |
| Is VANI at fault for regeneration itself? | **No** (for this API contract) |
| Is photographic local image editing production-ready? | **No** — not with `gemini-2.5-flash-image` generateContent editing |

---

## 7. How to reproduce

```bash
cd backend
node tests/gemini-image-edit-official/run.js
# outputs written to tests/gemini-image-edit-official/outputs/
```
