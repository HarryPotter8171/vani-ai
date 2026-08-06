# VANI AI — Model Orchestrator Report

**Date:** 2026-08-04  
**Scope:** Provider-agnostic model routing (Gemini, OpenAI, Anthropic, OpenRouter, Groq, Ollama)  
**Constraint:** Existing Gemini chat path remains the default; no API breaking changes  

---

## Summary

VANI AI now routes chat completions through a production-grade **Model Orchestrator**. Gemini remains the default for existing chats (`Chat.model = "gemini"`, `Project.settings.model = "gemini"`). Selecting another provider, or `auto`, uses the new multi-provider tool loop with failover, cost/token/latency tracking, and UI surfacing.

Image generation, title generation, research, agents, STT/TTS, and embeddings continue to use their existing Gemini-specific services — only the main chat completion path is orchestrated.

---

## Architecture

```
backend/providers/
  gemini/          Vertex / @google/genai adapter
  openai/          OpenAI SDK
  anthropic/       Anthropic Messages API (fetch)
  openrouter/      OpenAI-compatible
  groq/            OpenAI-compatible
  ollama/          OpenAI-compatible (local)
  shared/          content + openaiCompatible helpers
  types.ts         shared contracts

backend/router/
  ModelRouter.ts         resolve / auto-route / fallback stream
  ProviderRegistry.ts    catalog + key resolution
  CostEstimator.ts       USD estimates
  CapabilityMatrix.ts    intent → capability scoring
  metricsStore.ts        in-process aggregates
```

### Request path

1. `POST /api/chat` accepts optional `model` (`auto` | `gemini` | `provider/model`).
2. Resolution order: **request → chat.model → project.settings.model → Gemini default**.
3. If the resolved provider is **Gemini** (legacy default): the original `runToolAgent` Gemini-native loop runs unchanged.
4. Otherwise: `runMultiProviderAgent` → `ModelRouter.streamWithFallback` with tool rounds.
5. SSE adds additive events: `{ meta }`, `{ usage }` (existing `delta` / `tool` / `image` / `done` unchanged).

---

## Routing examples

| Intent signal | Preferred provider |
|---------------|--------------------|
| Coding / debug / TypeScript | Anthropic Claude |
| Long reasoning / analyze | Gemini |
| Creative writing / story | OpenAI GPT |
| Fast / quick / tl;dr | Groq |
| Offline / local / ollama | Ollama |

Auto-routing only considers **configured** providers (API key / base URL present). Fallbacks try the next healthy configured provider on retryable failures.

Enable global auto-route when no model is selected:

```bash
VANI_AUTO_ROUTE=true
```

---

## Environment variables

| Variable | Provider |
|----------|----------|
| `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` | Gemini (required in prod, unchanged) |
| `VANI_CHAT_MODEL` | Default Gemini model id |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENROUTER_API_KEY` | OpenRouter |
| `GROQ_API_KEY` | Groq |
| `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434/v1`) | Ollama |
| `VANI_AUTO_ROUTE` | Intent routing when model unset/`auto` |

Documented in `backend/.env.example`.

---

## API surfaces (additive)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/models` | yes | Catalog for selector (`?all=1` includes unconfigured) |
| `GET /api/models/health` | yes | Provider health probes |
| `GET /api/models/metrics` | yes | Token / cost / latency aggregates |
| `POST /api/models/route` | yes | Preview auto-route without calling a model |

### SSE additions (backward compatible)

```json
{ "meta": { "model", "provider", "modelKey", "reason", "displayName", "fallback?" } }
{ "usage": { "inputTokens", "outputTokens", "totalTokens", "costUsd", "latencyMs", "provider", "model", "modelKey" } }
```

---

## UI

- **Model selector** beside Agents in the composer (`ModelSelector`)
- **Provider badge** + token / cost / latency footer under assistant messages (`UsageFooter`)
- Project default model (`Project.settings.model`) syncs the selector on project switch
- Chat sticky model persisted on `Chat.model` after a non-auto selection

---

## Compatibility guarantees

- Existing chats with `model: "gemini"` keep the native Gemini tool loop.
- Clients that ignore `meta` / `usage` continue to work.
- Message schema adds optional `meta` — older messages without it still load.
- No change to auth, CORS, rate limits, or streaming framing (`data: …\n\n`).

---

## Tests & verification

- Unit: `ModelRouter`, `CostEstimator`, provider registry
- Backend `npm run lint` / `npm run build` (syntax check)
- Backend unit suite
- Frontend production build

---

## Follow-ups (optional)

1. Persist project default model from a settings panel (field already exists).
2. Install `@sentry/nextjs` and wire frontend `lib/monitoring.ts`.
3. Export Prometheus metrics from `metricsStore` via an authenticated scrape endpoint.
4. Migrate title / research / agent planners onto the same router when desired.
5. Richer token accounting on the native Gemini path (usage metadata is currently best-effort / zero-filled when Vertex omits it mid-stream).
