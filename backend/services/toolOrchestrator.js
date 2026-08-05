import { FunctionCallingConfigMode } from "@google/genai";
import { CHAT_MODEL, getGeminiClient } from "./geminiClient.js";
import {
  executeTool,
  getFunctionDeclarations,
  getTool,
  initTools,
} from "../tools/index.js";
import { modelRouter } from "../router/index.ts";
import { runMultiProviderAgent } from "./multiProviderAgent.js";
import {
  detectImageToolIntent,
  normalizeImageToolFailure,
} from "./imageToolIntent.js";
import {
  hasEditableImages,
  runDirectImageEdit,
  shouldForceImageEdit,
} from "./imageEditPipeline.js";
import {
  hasOcrableInputs,
  runDirectOcr,
  shouldForceOcr,
} from "./ocrPipeline.js";
import { detectOcrToolIntent } from "./ocrToolIntent.js";
import { IMAGE_EDIT_SUCCESS_CAPTION } from "./image/index.js";

const MAX_TOOL_ROUNDS = 6;
const MAX_PARALLEL_TOOLS = 5;
const IMAGE_TOOLS = new Set(["image_generation", "image_edit"]);

/** True when the resolved route should use the legacy Gemini-native loop. */
function shouldUseNativeGemini(model, projectModel, chatModel, planId = null) {
  // Explicit non-gemini / auto → multi-provider path.
  const explicit = model || chatModel || projectModel;
  if (explicit === "auto") return false;
  if (explicit && explicit !== "gemini" && !String(explicit).startsWith("gemini/")) {
    return false;
  }
  if (process.env.VANI_AUTO_ROUTE === "true" && !model) return false;

  try {
    const decision = modelRouter.resolve({
      model: model || "gemini",
      projectModel,
      chatModel,
      planId,
    });
    return decision.model.provider === "gemini";
  } catch {
    return true; // safest: keep historical Gemini path
  }
}

function contentsHaveVision(contents) {
  return contents.some((c) =>
    (c.parts || []).some(
      (p) =>
        p?.inlineData?.mimeType?.startsWith("image/") ||
        p?.inlineData?.mimeType === "application/pdf"
    )
  );
}

function sanitizeToolResultForModel(name, result) {
  if (!result || typeof result !== "object") return { ok: true, data: result };

  if (IMAGE_TOOLS.has(name) && result.ok === false) {
    return normalizeImageToolFailure(result, name);
  }

  // Keep context lean — never echo giant base64 blobs back into the model.
  if (IMAGE_TOOLS.has(name) && (result.imageBase64 || result.fileId || result.imageUrl)) {
    const { imageBase64, ...rest } = result;
    return {
      ...rest,
      imageGenerated: true,
      ...(typeof imageBase64 === "string"
        ? { imageBytes: imageBase64.length }
        : result.size
          ? { imageBytes: result.size }
          : {}),
      note:
        rest.note ||
        "Image ready. Tell the user the image is ready; do not reprint base64.",
    };
  }

  const json = JSON.stringify(result);
  if (json.length > 80_000) {
    return {
      ok: result.ok !== false,
      truncated: true,
      preview: json.slice(0, 60_000),
      note: "Tool result truncated for context size.",
    };
  }
  return result;
}

function buildGeminiToolConfig(declarations, forceToolName, round) {
  if (!declarations.length) return undefined;
  if (forceToolName && round === 0) {
    return {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: [forceToolName],
      },
    };
  }
  return {
    functionCallingConfig: {
      mode: FunctionCallingConfigMode.AUTO,
    },
  };
}

function collectFunctionCallsFromChunk(chunk, bucket) {
  const calls = chunk.functionCalls;
  if (Array.isArray(calls) && calls.length) {
    for (const fc of calls) {
      if (!fc?.name) continue;
      const key = fc.id || `${fc.name}:${JSON.stringify(fc.args || {})}`;
      bucket.set(key, fc);
    }
  }

  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    const fc = part.functionCall;
    if (!fc?.name) continue;
    const key = fc.id || `${fc.name}:${JSON.stringify(fc.args || {})}`;
    bucket.set(key, fc);
  }
}

/**
 * Agent loop with streaming:
 * - streams assistant text before tool calls
 * - emits tool_start / tool_done during execution
 * - streams the merged final answer after tools return
 *
 * Default path (Gemini / legacy `model: "gemini"`) is byte-compatible with
 * the pre-orchestrator implementation. Non-Gemini selections and `auto`
 * route through `runMultiProviderAgent`.
 *
 * Yields:
 *   { type: 'delta', text }
 *   { type: 'tool_start', id, name, displayName }
 *   { type: 'tool_done', id, name, displayName, ok, error? }
 *   { type: 'image', mimeType, dataBase64, prompt? }
 *   { type: 'meta' | 'usage', ... }  (orchestrator; additive)
 */
export async function* runToolAgent({
  contents,
  systemInstruction,
  toolContext = {},
  signal,
  model,
  projectModel,
  chatModel,
  userMessage = "",
  temperature,
  planId = null,
}) {
  if (!shouldUseNativeGemini(model, projectModel, chatModel, planId)) {
    yield* runMultiProviderAgent({
      contents,
      systemInstruction,
      toolContext,
      signal,
      model,
      projectModel,
      chatModel,
      userMessage,
      temperature,
      planId,
    });
    return;
  }

  initTools();
  const declarations = getFunctionDeclarations();
  const workingContents = [...contents];
  const hasVision = contentsHaveVision(workingContents);
  const hasImages = hasEditableImages(workingContents, toolContext);
  const hasOcrable = hasOcrableInputs(workingContents, toolContext);
  const imageIntent = detectImageToolIntent(userMessage, { hasImages });
  const ocrIntent = detectOcrToolIntent(userMessage, { hasOcrable });
  const forceDirectOcr = shouldForceOcr(
    userMessage,
    workingContents,
    toolContext
  );
  const forceDirectEdit =
    !forceDirectOcr &&
    shouldForceImageEdit(userMessage, workingContents, toolContext);

  let forceImageTool = null;
  if (!forceDirectEdit && !forceDirectOcr) {
    if (
      ocrIntent?.mode === "force" &&
      declarations.some((d) => d.name === "ocr")
    ) {
      forceImageTool = "ocr";
    } else if (
      imageIntent?.mode === "force" &&
      declarations.some((d) => d.name === imageIntent.tool)
    ) {
      forceImageTool = imageIntent.tool;
    }
  }

  // Additive meta for the default Gemini path (UI can show provider badge).
  const decision = modelRouter.resolve({
    model: model || "gemini",
    projectModel,
    chatModel,
    planId,
  });
  const resolved = decision.model;
  const geminiModelId = resolved.id || CHAT_MODEL;
  yield {
    type: "meta",
    model: resolved.id,
    provider: "gemini",
    modelKey: resolved.key,
    reason: decision.reason || "default_gemini",
    displayName: resolved.displayName,
  };

  const started = performance.now();

  // OCR: run first, inject results, then continue so the LLM can summarize/answer.
  if (forceDirectOcr) {
    const ocrRunner = runDirectOcr({
      userMessage,
      contents: workingContents,
      toolContext,
      signal,
    });
    let ocrOutcome = null;
    while (true) {
      const next = await ocrRunner.next();
      if (next.done) {
        ocrOutcome = next.value;
        break;
      }
      yield next.value;
    }

    if (ocrOutcome?.modelParts?.length && ocrOutcome?.responseParts?.length) {
      workingContents.push({ role: "model", parts: ocrOutcome.modelParts });
      workingContents.push({ role: "user", parts: ocrOutcome.responseParts });
    }

    if (!ocrOutcome?.ok) {
      yield {
        type: "delta",
        text: `\n\n${ocrOutcome?.result?.error || "The OCR service is temporarily unavailable."}`,
        replace: true,
      };
      yield {
        type: "usage",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          latencyMs: Math.round(performance.now() - started),
          provider: "gemini",
          model: resolved.id,
          modelKey: resolved.key,
        },
      };
      return;
    }
    // Fall through to the LLM loop with OCR context injected.
  }

  // Image edit: invoke the tool immediately — never let the LLM refuse in text.
  if (forceDirectEdit) {
    const editRunner = runDirectImageEdit({
      userMessage,
      contents: workingContents,
      toolContext,
      signal,
    });
    let editOutcome = null;
    while (true) {
      const next = await editRunner.next();
      if (next.done) {
        editOutcome = next.value;
        break;
      }
      yield next.value;
    }

    // Caption (success or failure) is already yielded by runDirectImageEdit.
    // Never ask the LLM to describe the edit — it echoes OCR / metadata.
    yield {
      type: "usage",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        latencyMs: Math.round(performance.now() - started),
        provider: "gemini",
        model: resolved.id,
        modelKey: resolved.key,
      },
    };
    return;
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) return;

    const functionCalls = new Map();
    let streamedText = "";

    const stream = await getGeminiClient().models.generateContentStream({
      model: geminiModelId,
      contents: workingContents,
      config: {
        systemInstruction,
        tools: declarations.length
          ? [{ functionDeclarations: declarations }]
          : undefined,
        toolConfig: buildGeminiToolConfig(declarations, forceImageTool, round),
      },
    });

    for await (const chunk of stream) {
      if (signal?.aborted) return;

      const text = chunk.text;
      if (text) {
        streamedText += text;
        yield { type: "delta", text };
      }

      collectFunctionCallsFromChunk(chunk, functionCalls);
    }

    const calls = [...functionCalls.values()].slice(0, MAX_PARALLEL_TOOLS);

    // No tool calls → this turn is the final natural-language answer.
    if (!calls.length) {
      yield {
        type: "usage",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          latencyMs: Math.round(performance.now() - started),
          provider: "gemini",
          model: resolved.id,
          modelKey: resolved.key,
        },
      };
      return;
    }

    // Rebuild a complete model turn from streamed text + collected calls.
    // Streaming chunks can fragment parts, so we don't trust the last snapshot alone.
    const modelParts = [
      ...(streamedText ? [{ text: streamedText }] : []),
      ...calls.map((fc) => ({
        functionCall: {
          name: fc.name,
          args: fc.args || {},
          ...(fc.id ? { id: fc.id } : {}),
        },
      })),
    ];

    workingContents.push({
      role: "model",
      parts: modelParts,
    });

    const responseParts = [];
    const ctx = {
      ...toolContext,
      contents: workingContents,
      signal,
      hasVision,
    };

    // Execute tools sequentially for predictable streaming events; still
    // supports multiple tools per model turn.
    for (const fc of calls) {
      if (signal?.aborted) return;

      // Last-resort guard: if the LLM still picks image_generation while a
      // source image is present, rewrite to image_edit so bytes are not dropped.
      let toolName = fc.name;
      let toolArgs = fc.args || {};
      if (
        toolName === "image_generation" &&
        hasEditableImages(workingContents, toolContext)
      ) {
        console.warn(
          "[image_trace] orchestrator rewrite image_generation→image_edit reason=source_present"
        );
        toolName = "image_edit";
        toolArgs = {
          instruction:
            (typeof toolArgs.prompt === "string" && toolArgs.prompt.trim()) ||
            (typeof toolArgs.instruction === "string" &&
              toolArgs.instruction.trim()) ||
            String(userMessage || "").trim() ||
            "Edit this image as requested.",
          ...(typeof toolArgs.imageFileId === "string"
            ? { imageFileId: toolArgs.imageFileId }
            : {}),
        };
      }

      const tool = getTool(toolName);
      const displayName = tool?.displayName || toolName;
      const callId = fc.id || toolName;

      yield {
        type: "tool_start",
        id: callId,
        name: toolName,
        displayName,
      };

      let rawResult = await executeTool(toolName, toolArgs, ctx);
      if (IMAGE_TOOLS.has(toolName) && rawResult?.ok === false) {
        rawResult = normalizeImageToolFailure(rawResult, toolName);
      }
      const ok = rawResult?.ok !== false;

      if (
        IMAGE_TOOLS.has(toolName) &&
        rawResult?.ok &&
        (rawResult.imageBase64 || rawResult.fileId || rawResult.imageUrl)
      ) {
        yield {
          type: "image",
          mimeType: rawResult.mimeType || "image/png",
          ...(rawResult.fileId ? { fileId: rawResult.fileId } : {}),
          ...(rawResult.imageUrl ? { imageUrl: rawResult.imageUrl } : {}),
          ...(rawResult.size ? { size: rawResult.size } : {}),
          ...(!rawResult.fileId && rawResult.imageBase64
            ? { dataBase64: rawResult.imageBase64 }
            : {}),
          prompt: rawResult.prompt || rawResult.instruction,
        };
      }

      yield {
        type: "tool_done",
        id: callId,
        name: toolName,
        displayName,
        ok,
        error: ok ? undefined : rawResult?.error,
      };

      // Successful image_edit: fixed caption only — do not let the model
      // continue and dump OCR / metadata into the assistant reply.
      if (
        toolName === "image_edit" &&
        ok &&
        (rawResult?.imageBase64 || rawResult?.fileId || rawResult?.imageUrl)
      ) {
        yield {
          type: "delta",
          text: IMAGE_EDIT_SUCCESS_CAPTION,
          replace: true,
        };
        yield {
          type: "usage",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            latencyMs: Math.round(performance.now() - started),
            provider: "gemini",
            model: resolved.id,
            modelKey: resolved.key,
          },
        };
        return;
      }

      const responsePayload = {
        name: toolName,
        response: sanitizeToolResultForModel(toolName, rawResult),
      };
      if (fc.id) responsePayload.id = fc.id;

      responseParts.push({ functionResponse: responsePayload });
    }

    workingContents.push({
      role: "user",
      parts: responseParts,
    });

    // Continue loop — model will stream the merged answer (or call more tools).
  }

  // Safety: if the model keeps requesting tools, ask it to conclude.
  workingContents.push({
    role: "user",
    parts: [
      {
        text: "Tool-call limit reached. Provide the best final answer you can with the information already gathered. Do not call more tools.",
      },
    ],
  });

  const finalStream = await getGeminiClient().models.generateContentStream({
    model: geminiModelId,
    contents: workingContents,
    config: {
      systemInstruction,
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
      },
    },
  });

  for await (const chunk of finalStream) {
    if (signal?.aborted) return;
    const text = chunk.text;
    if (text) yield { type: "delta", text };
  }

  yield {
    type: "usage",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs: Math.round(performance.now() - started),
      provider: "gemini",
      model: resolved.id,
      modelKey: resolved.key,
    },
  };
}
