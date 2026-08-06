# Image Tool Awareness — Implementation Report

Fixes VANI AI incorrectly claiming it cannot generate/display images or that it is text-only, despite shipping image generation, editing, vision, uploads, and inline chat rendering.

## Status

| Area | Status |
|------|--------|
| System prompt image capabilities | Done |
| Forced `image_generation` on generate intents | Done |
| Forced `image_edit` on edit-with-upload intents | Done |
| `image_edit` tool | Done |
| Failure copy (no “unsupported” claims) | Done |
| Prompt template audit | Done |
| Agents + planner awareness | Done |
| Unit tests | Done |
| Backend `npm run build` / `lint` / unit tests | Passed |
| Frontend `npm run build` | Passed |
| Frontend `npm run lint` | Pre-existing errors in unrelated files (AuthGate, VirtualizedMessageList, McpSettings, useVoiceMode) — not introduced by this change |

---

## Root cause

1. The chat system prompt mentioned `image_generation` only briefly inside a generic tool list and never asserted that VANI is multimodal.
2. Tool calling used `AUTO` only, so the model could refuse image requests and invent “text-only” limitations.
3. There was no dedicated **image edit** tool for “Edit this” + upload flows.
4. Agent configs omitted image tools from several agent types.
5. Tool failures returned raw upstream errors, which the model sometimes paraphrased as “I cannot generate images.”

---

## Changes

### 1. System prompt (`backend/services/geminiService.js`)

Always injects an **IMAGE CAPABILITIES** block stating VANI can:

- generate images (`image_generation`)
- edit uploaded images (`image_edit`)
- analyze images (`vision_analyze` + native vision)
- render images inline in chat

Hard rules:

- Never say “I cannot generate/display images” or “I am text-only” unless an image tool just failed.
- On image tool failure, say exactly: **The image generation service is temporarily unavailable.**
- On generate/edit requests: call the tool immediately — do not explain capabilities.

### 2. Intent forcing (`backend/services/imageToolIntent.js`)

Detects generate vs edit intents. On the first tool round:

- Gemini native path: `FunctionCallingConfigMode.ANY` + `allowedFunctionNames`
- Multi-provider path: `toolChoice: { type: "required", name }`

Wired in:

- `backend/services/toolOrchestrator.js`
- `backend/services/multiProviderAgent.js`
- `backend/providers/gemini/index.ts`
- `backend/providers/shared/openaiCompatible.ts`
- `backend/providers/anthropic/index.ts`
- `backend/providers/types.ts` / `ModelRouter.ts`

### 3. Image edit tool (`backend/tools/implementations/imageEdit.js`)

New model-callable tool `image_edit`:

- Uses conversation/attachment image parts
- Calls the same Gemini native image model as generation
- Emits chat `image` events like `image_generation`
- Feature/quota gated as `image_generation`

Shared collector: `backend/tools/implementations/imageParts.js` (also used by vision).

### 4. Failure normalization

`normalizeImageToolFailure()`:

- Service/API failures → user-facing **The image generation service is temporarily unavailable.**
- Model note forbids claiming missing image capabilities
- Input validation errors keep a clear input message but still forbid “text-only” claims

Kill switch `VANI_DISABLE_IMAGE_GEN=true` now returns the unavailable message (not “disabled”).

### 5. Agents

- Agent types include `image_generation` / `image_edit` where relevant
- Agent adapters + registry register both tools
- Planner fallback + planning prompt prefer image tools for visual requests
- Executor system instruction includes image capability rules and emits `image` events

### 6. Prompt template audit

| Template | Action |
|----------|--------|
| `geminiService` system instruction | Updated — primary fix |
| Agent `systemFocus` / Executor / Planner | Updated |
| Deep Research planner/report | No outdated image claims (domain-specific) |
| Canvas AI editor | Document editing only — left unchanged |
| STT / Vision focus prompts | Unrelated — left unchanged |
| Tool descriptions (`image_generation`, `image_edit`, `vision_analyze`) | Updated for immediate invocation |

---

## Behavior matrix

| User action | Expected behavior |
|-------------|-------------------|
| “Generate an image …” | Force `image_generation` immediately |
| Upload + “Edit this” | Force `image_edit` immediately |
| Image tool API failure | “The image generation service is temporarily unavailable.” |
| Unrelated chat | No forced image tool |

---

## Tests added/updated

- `backend/tests/unit/services/imageToolIntent.test.js`
- `backend/tests/unit/services/geminiService.prompt.test.js`
- `backend/tests/unit/tools/imageEdit.test.js`
- `backend/tests/unit/tools/imageGeneration.test.js` (kill-switch copy)
- `backend/tests/unit/agents/Planner.test.js` (image plan steps)

---

## Verification

| Command | Result |
|---------|--------|
| `backend`: `npm run build` | ✅ 268 files syntax-ok |
| `backend`: `npm run lint` | ✅ same check |
| `backend`: `npm run test:unit` | ✅ 265 tests passed |
| `frontend`: `npm run build` | ✅ Next.js production build |
| `frontend`: `npm run lint` | ⚠️ 10 pre-existing errors in unrelated UI files (no image-tool diffs) |

```bash
cd backend && npm run build && npm run lint && npm run test:unit
cd ../frontend && npm run build
```
