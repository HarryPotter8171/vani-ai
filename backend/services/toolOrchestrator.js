import { FunctionCallingConfigMode } from "@google/genai";
import { CHAT_MODEL, getGeminiClient } from "./geminiClient.js";
import {
  executeTool,
  getFunctionDeclarations,
  getTool,
  initTools,
} from "../tools/index.js";

const MAX_TOOL_ROUNDS = 6;
const MAX_PARALLEL_TOOLS = 5;

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

  // Keep context lean — never echo giant base64 blobs back into the model.
  if (name === "image_generation" && result.imageBase64) {
    const { imageBase64, ...rest } = result;
    return {
      ...rest,
      imageGenerated: true,
      imageBytes: imageBase64.length,
      note:
        rest.note ||
        "Image generated successfully. Tell the user the image is ready; do not reprint base64.",
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
 * Yields:
 *   { type: 'delta', text }
 *   { type: 'tool_start', id, name, displayName }
 *   { type: 'tool_done', id, name, displayName, ok, error? }
 *   { type: 'image', mimeType, dataBase64, prompt? }
 */
export async function* runToolAgent({
  contents,
  systemInstruction,
  toolContext = {},
  signal,
}) {
  initTools();
  const declarations = getFunctionDeclarations();
  const workingContents = [...contents];
  const hasVision = contentsHaveVision(workingContents);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (signal?.aborted) return;

    const functionCalls = new Map();
    let streamedText = "";

    const stream = await getGeminiClient().models.generateContentStream({
      model: CHAT_MODEL,
      contents: workingContents,
      config: {
        systemInstruction,
        tools: declarations.length
          ? [{ functionDeclarations: declarations }]
          : undefined,
        toolConfig: declarations.length
          ? {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            }
          : undefined,
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

      const tool = getTool(fc.name);
      const displayName = tool?.displayName || fc.name;
      const callId = fc.id || fc.name;

      yield {
        type: "tool_start",
        id: callId,
        name: fc.name,
        displayName,
      };

      const rawResult = await executeTool(fc.name, fc.args || {}, ctx);
      const ok = rawResult?.ok !== false;

      if (fc.name === "image_generation" && rawResult?.ok && rawResult.imageBase64) {
        yield {
          type: "image",
          mimeType: rawResult.mimeType || "image/png",
          dataBase64: rawResult.imageBase64,
          prompt: rawResult.prompt,
        };
      }

      yield {
        type: "tool_done",
        id: callId,
        name: fc.name,
        displayName,
        ok,
        error: ok ? undefined : rawResult?.error,
      };

      const responsePayload = {
        name: fc.name,
        response: sanitizeToolResultForModel(fc.name, rawResult),
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
    model: CHAT_MODEL,
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
}
