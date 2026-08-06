# Production OCR Tool — Implementation Report

Adds a production-grade `ocr` tool to VANI AI for extracting text from images and PDFs, integrated into the agent pipeline the same way as `image_edit`.

## Status

| Area | Status |
|------|--------|
| `ocr` tool (JPG/JPEG/PNG/WEBP/PDF) | Done |
| Plain text + tables + handwriting (best effort) | Done |
| Mixed Hindi + English (`eng+hin`) | Done |
| API response `{ success, text, pages, language, metadata }` | Done |
| Agent pipeline (registry, adapters, planner, force-route) | Done |
| Chat intents (read / summarize PDF / bill) | Done |
| Error handling | Done |
| Unit tests | Done |
| File documentation | Done |

---

## Chat behavior

| User | Pipeline |
|------|----------|
| "Read this image" | `ocr` runs automatically → LLM presents text |
| "Summarize this PDF" | `ocr` extracts first → LLM summarizes |
| "What is written in this bill?" | `ocr` extracts → assistant answers |

OCR intents take priority over the image-edit auto-router so "Read this image" never becomes an edit.

---

## New files

### Core OCR module — `backend/services/ocr/`

| File | Purpose |
|------|---------|
| `config.js` | Supported formats, language default (`eng+hin`), PDF page/scale caps |
| `tables.js` | Reconstruct tables from Tesseract word bounding boxes → markdown |
| `runOcr.js` | Production runner for image + PDF buffers; always returns the API shape |
| `index.js` | Public exports |

### Tool + intent + pipeline

| File | Purpose |
|------|---------|
| `backend/tools/implementations/ocr.js` | Model-callable `ocr` tool (resolves attachments like `image_edit`) |
| `backend/services/ocrToolIntent.js` | Intent detection + failure normalization |
| `backend/services/ocrPipeline.js` | `shouldForceOcr` / `runDirectOcr` — mirrors `imageEditPipeline` |

### Tests

| File | Purpose |
|------|---------|
| `backend/tests/unit/tools/ocr.test.js` | Tool contract + API shape + errors |
| `backend/tests/unit/services/ocrToolIntent.test.js` | Intent / force routing |
| `backend/tests/unit/services/ocrPipeline.test.js` | Direct OCR pipeline events |
| `backend/tests/unit/services/ocr/tables.test.js` | Table clustering |
| `backend/tests/unit/services/ocr/runOcr.test.js` | Runner API shape + format allowlist |

### Docs

| File | Purpose |
|------|---------|
| `OCR_REPORT.md` | This report |

---

## Modified files (integration only)

| File | Change |
|------|--------|
| `backend/services/image/ocr.js` | Multi-lang worker (`eng+hin`), optional blocks output, local tessdata cache |
| `backend/services/image/shared.js` | Default `OCR_LANG=eng+hin` |
| `backend/tools/index.js` | Register `ocrTool` |
| `backend/agents/tools/adapters.js` | `ocrAgentTool` + `LEGACY_TOOL_MAP` |
| `backend/agents/tools/index.js` | Register agent OCR tool |
| `backend/agents/config.js` | Add `ocr` to agent tool allow-lists |
| `backend/agents/Planner.js` | Prefer OCR steps for read/summarize intents |
| `backend/services/toolOrchestrator.js` | Force direct OCR, inject result, continue LLM |
| `backend/services/multiProviderAgent.js` | Same OCR force path for non-Gemini |
| `backend/services/imageEditPipeline.js` | Skip edit forcing when OCR intent detected |
| `backend/services/geminiService.js` | Prompt awareness for `ocr` |
| `backend/scripts/verifyAgents.js` | Require `ocr` in registry |
| `frontend/lib/agents/ToolRegistry.ts` | UI metadata for `ocr` |
| `backend/.env.example` | OCR language / PDF knobs |
| `backend/package.json` | Dependency `@tesseract.js-data/hin` |

---

## API response

```json
{
  "success": true,
  "text": "...",
  "pages": [
    {
      "page": 1,
      "text": "...",
      "confidence": 88.5,
      "tables": [],
      "method": "ocr"
    }
  ],
  "language": "eng+hin",
  "metadata": {
    "source": "image",
    "pageCount": 1,
    "confidence": 88.5,
    "tableCount": 0,
    "handwriting": "best-effort",
    "scripts": ["latin", "devanagari"]
  }
}
```

On failure, the same keys are returned with `success: false` and an `error` string.

---

## Architecture notes

1. Reuses the existing Tesseract + Sharp pipeline (`services/image/ocr.js`).
2. Vendored language packs: `@tesseract.js-data/eng` + `@tesseract.js-data/hin` (no runtime download in production when packs resolve).
3. PDF pages are rendered via `pdf-parse` screenshots (same approach as document understanding), then OCR’d.
4. Tables are best-effort from word geometry; markdown is appended under `## Detected tables` when a grid is detected.
5. Handwriting uses the same LSTM model — best effort, no separate handwriting model.

---

## Env knobs

```bash
VANI_OCR_LANG=eng+hin          # default
VANI_OCR_MAX_CHARS=20000
VANI_OCR_MAX_EDGE=2000
VANI_OCR_PDF_MAX_PAGES=15
VANI_OCR_PDF_SCALE=1.5
```

---

## Verify

```bash
cd backend
npm run test:unit -- tests/unit/tools/ocr.test.js tests/unit/services/ocrToolIntent.test.js tests/unit/services/ocrPipeline.test.js tests/unit/services/ocr
npm run verify:agents
```
