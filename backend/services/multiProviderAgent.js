import {
  executeTool,
  getFunctionDeclarations,
  getTool,
  initTools,
} from "../tools/index.js";
import { modelRouter } from "../router/index.ts";
import { contentsHaveVision } from "../providers/shared/content.ts";
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

function sanitizeToolResultForModel(name, result) {
  if (!result || typeof result !== "object") return { ok: true, data: result };

  if (IMAGE_TOOLS.has(name) && result.ok === false) {
    return normalizeImageToolFailure(result, name);
  }

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

/**
 * Provider-agnostic tool loop. Emits the same event types as runToolAgent
 * plus route / usage metadata for the orchestrator UI.
 *
 * Yields:
 *   { type: 'meta', model, provider, modelKey, reason }
 *   { type: 'delta', text }
 *   { type: 'tool_start' | 'tool_done', ... }
 *   { type: 'image', ... }
 *   { type: 'usage', usage }
 */
export async function* runMultiProviderAgent({
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
  initTools();
  const declarations = getFunctionDeclarations();
  // Shallow-copy messages only — avoid deep-cloning base64 / binary parts (BE-M13).
  const workingContents = (contents || []).map((msg) =>
    msg && typeof msg === "object" ? { ...msg } : msg
  );
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

  const decision = modelRouter.resolve({
    model,
    projectModel,
    chatModel,
    userMessage,
    contents: workingContents,
    requireVision: hasVision,
    requireTools: declarations.length > 0,
    planId,
  });

  yield {
    type: "meta",
    model: decision.model.id,
    provider: decision.model.provider,
    modelKey: decision.model.key,
    reason: decision.reason,
    displayName: decision.model.displayName,
  };

  let lastUsage = null;

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
      if (lastUsage) yield { type: "usage", usage: lastUsage };
      return;
    }
    // Continue into the LLM loop with OCR context.
  }

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

    // Caption already yielded by runDirectImageEdit — never LLM-describe.
    if (lastUsage) yield { type: "usage", usage: lastUsage };
    return;
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) return;

    const toolCalls = [];
    let streamedText = "";
    const toolChoice =
      forceImageTool && round === 0
        ? { type: "required", name: forceImageTool }
        : "auto";

    for await (const event of modelRouter.streamWithFallback({
      decision,
      contents: workingContents,
      systemInstruction,
      tools: declarations,
      toolChoice,
      temperature,
      signal,
    })) {
      if (signal?.aborted) return;

      if (event.type === "route" && round === 0) {
        // Surface failover switches after the first attempt.
        if (event.attempt > 0) {
          yield {
            type: "meta",
            model: event.decision.model.id,
            provider: event.decision.model.provider,
            modelKey: event.decision.model.key,
            reason: event.decision.reason,
            displayName: event.decision.model.displayName,
            fallback: true,
          };
        }
        continue;
      }

      if (event.type === "delta" && event.text) {
        streamedText += event.text;
        yield { type: "delta", text: event.text };
        continue;
      }

      if (event.type === "tool_call") {
        toolCalls.push(event);
        continue;
      }

      if (event.type === "usage_final") {
        lastUsage = event.usage;
        continue;
      }

      if (event.type === "error") {
        console.error("[multiProviderAgent] upstream error:", event.error);
        yield {
          type: "delta",
          text: "\n\n_We couldn't generate a response. Please try again._",
        };
        if (lastUsage) yield { type: "usage", usage: lastUsage };
        return;
      }
    }

    const calls = toolCalls.slice(0, MAX_PARALLEL_TOOLS);
    if (!calls.length) {
      if (lastUsage) yield { type: "usage", usage: lastUsage };
      return;
    }

    workingContents.push({
      role: "model",
      parts: [
        ...(streamedText ? [{ text: streamedText }] : []),
        ...calls.map((fc) => ({
          functionCall: {
            name: fc.name,
            args: fc.args || {},
            ...(fc.id ? { id: fc.id } : {}),
          },
        })),
      ],
    });

    const responseParts = [];
    const ctx = {
      ...toolContext,
      userMessage,
      contents: workingContents,
      signal,
      hasVision,
    };

    for (const fc of calls) {
      if (signal?.aborted) return;

      // Never let image_generation discard an uploaded source image.
      let toolName = fc.name;
      let toolArgs = fc.args || {};
      if (
        toolName === "image_generation" &&
        hasEditableImages(workingContents, toolContext)
      ) {
        console.warn(
          "[image_trace] multiProvider rewrite image_generation→image_edit reason=source_present"
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
        if (lastUsage) yield { type: "usage", usage: lastUsage };
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
  }

  // Force a final answer without tools.
  workingContents.push({
    role: "user",
    parts: [
      {
        text: "Tool-call limit reached. Provide the best final answer you can with the information already gathered. Do not call more tools.",
      },
    ],
  });

  for await (const event of modelRouter.streamWithFallback({
    decision,
    contents: workingContents,
    systemInstruction,
    tools: declarations,
    toolChoice: "none",
    temperature,
    signal,
  })) {
    if (signal?.aborted) return;
    if (event.type === "delta" && event.text) {
      yield { type: "delta", text: event.text };
    } else if (event.type === "usage_final") {
      lastUsage = event.usage;
    }
  }

  if (lastUsage) yield { type: "usage", usage: lastUsage };
}
