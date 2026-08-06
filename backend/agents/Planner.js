/**
 * Planner — multi-step task decomposition with context-aware tool selection.
 */

import { CHAT_MODEL, getGeminiClient } from "../services/geminiClient.js";
import {
  detectImageToolIntent,
  hasEditIntent,
  isVisionOnlyQuestion,
} from "../services/imageToolIntent.js";
import { detectOcrToolIntent } from "../services/ocrToolIntent.js";
import { VANI_IDENTITY_LOCK } from "../services/identity.js";
import { AGENT_CONFIG, getAgentType } from "./config.js";
import { listAgentTools } from "./ToolRegistry.js";

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();

  // Prefer fenced JSON
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toolCatalog(allowedTools) {
  const tools = listAgentTools();
  return tools
    .filter((t) => !allowedTools || allowedTools.includes(t.name()))
    .map((t) => `- ${t.name()}: ${t.description()}`)
    .join("\n");
}

/**
 * Fallback heuristic plan when the model returns unusable JSON.
 * When an uploaded image + edit intent are present, ALWAYS plan image_edit
 * (never image_generation).
 */
export function buildFallbackPlan(userMessage, agentTypeId, { hasImages = false, allowedTools = null } = {}) {
  const agent = getAgentType(agentTypeId);
  const tools = Array.isArray(allowedTools) && allowedTools.length ? allowedTools : agent.tools;
  const msg = String(userMessage || "").toLowerCase();
  const steps = [];

  const wantsSearch =
    /\b(search|research|latest|news|who is|what is|find|look up|sources?)\b/.test(msg) ||
    agentTypeId === "research" ||
    agentTypeId === "web";
  const wantsWeather = /\b(weather|temperature|forecast|rain|humidity)\b/.test(msg);
  const wantsTime = /\b(time|timezone|date|today|now)\b/.test(msg);
  const wantsCalc = /\b(calculate|compute|math|%\+|equals|sum|average)\b/.test(msg) ||
    /[\d+\-*/^()]{3,}/.test(msg);

  const imageIntent = detectImageToolIntent(userMessage, { hasImages });
  const ocrIntent = detectOcrToolIntent(userMessage, {
    hasOcrable: hasImages,
  });
  // Without attachment context, keep a conservative edit heuristic so plain
  // "add/make" text tasks are not mis-routed to image_edit.
  const wantsImageEditFallback =
    /\b(edit|retouch|restyle|inpaint|outpaint|uncrop|recolor|crop)\b/.test(msg) ||
    /\bedit this\b/.test(msg) ||
    /\b(remove|erase|replace|change|add|put|insert|make|transform|modify)\b[\s\S]{0,48}\b(image|photo|picture|pic|background|sky|object|shirt|color|dog|cat|hat|watermark)\b/.test(
      msg
    ) ||
    /\b(remove|erase|replace) (the )?(background|sky|object)\b/.test(msg);

  const useOcr =
    tools.includes("ocr") &&
    (ocrIntent?.tool === "ocr" ||
      (hasImages &&
        /\b(read|ocr|transcribe|extract\s+text|what\s+is\s+written|summarize)\b/i.test(
          msg
        )));

  const useVision =
    !useOcr &&
    hasImages &&
    isVisionOnlyQuestion(userMessage) &&
    tools.includes("vision");

  const useImageEdit =
    !useOcr &&
    !useVision &&
    tools.includes("image_edit") &&
    (imageIntent?.tool === "image_edit" ||
      (hasImages && hasEditIntent(userMessage)) ||
      (!hasImages && wantsImageEditFallback));
  const useImageGen =
    !useImageEdit &&
    !useOcr &&
    !useVision &&
    !hasImages &&
    tools.includes("image_generation") &&
    imageIntent?.tool === "image_generation";

  if (useOcr) {
    steps.push({
      title: "Running OCR...",
      description: "Extract text from the attached image or PDF",
      tool: "ocr",
      args: { focus: userMessage.slice(0, 500) },
    });
  } else if (useVision) {
    steps.push({
      title: "Analyzing image...",
      description: "Understand the attached image with vision",
      tool: "vision",
      args: { question: userMessage.slice(0, 500) },
    });
  } else if (useImageEdit) {
    steps.push({
      title: "✏️ Editing image...",
      description: "Edit the attached source image per the user's request",
      tool: "image_edit",
      args: { instruction: userMessage.slice(0, 500) },
    });
  } else if (useImageGen) {
    steps.push({
      title: "Generating image...",
      description: "Generate an image from the user's request",
      tool: "image_generation",
      args: { prompt: userMessage.slice(0, 500) },
    });
  }

  if (wantsSearch && tools.includes("web_search")) {
    steps.push({
      title: "Searching...",
      description: `Search the web for: ${userMessage.slice(0, 160)}`,
      tool: "web_search",
      args: { query: userMessage.slice(0, 240) },
    });
    steps.push({
      title: "Reading sources...",
      description: "Extract key facts and sources from search results",
      tool: null,
      args: {},
    });
  }

  if (wantsWeather && tools.includes("weather")) {
    const placeMatch = msg.match(/weather(?:\s+in|\s+for|\s+at)?\s+([a-z\s,]+)/i);
    steps.push({
      title: "Checking weather...",
      description: "Fetch current weather conditions",
      tool: "weather",
      args: { location: (placeMatch?.[1] || "current location").trim() },
    });
  }

  if (wantsTime && tools.includes("current_time")) {
    steps.push({
      title: "Checking time...",
      description: "Get the current date and time",
      tool: "current_time",
      args: {},
    });
  }

  if (wantsCalc && tools.includes("calculator")) {
    steps.push({
      title: "Calculating...",
      description: "Evaluate the mathematical expression",
      tool: "calculator",
      args: { expression: userMessage },
    });
  }

  if (!steps.length) {
    steps.push({
      title: "Analyzing...",
      description: "Understand the request with conversation and memory context",
      tool: tools.includes("memory") ? "memory" : null,
      args: tools.includes("memory")
        ? { action: "recall", key: "relevant_context" }
        : {},
    });
  }

  steps.push({
    title: "Generating answer...",
    description: "Synthesize findings into a clear final response",
    tool: null,
    args: {},
  });

  return steps.slice(0, AGENT_CONFIG.maxPlanSteps);
}

/**
 * Create a structured multi-step plan for the agent.
 */
export async function createPlan({
  agentTypeId,
  userMessage,
  contextText = "",
  signal,
  hasImages = false,
  allowedTools = null,
} = {}) {
  const agent = getAgentType(agentTypeId);
  const toolAllowList =
    Array.isArray(allowedTools) && allowedTools.length
      ? allowedTools
      : agent.tools;
  const catalog = toolCatalog(toolAllowList);
  const imageIntent = detectImageToolIntent(userMessage, { hasImages });
  const ocrIntent = detectOcrToolIntent(userMessage, {
    hasOcrable: hasImages,
  });
  const visionOnly = hasImages && isVisionOnlyQuestion(userMessage);
  const imageRoutingRule =
    hasImages && ocrIntent?.tool === "ocr"
      ? `- CRITICAL: The user wants text extracted from an attached image/PDF. You MUST select tool "ocr" first. Then summarize or answer using the OCR text. Do NOT select image_generation or image_edit.`
      : visionOnly
      ? `- CRITICAL: The user uploaded an image and is asking a vision question (explain / describe / what is this). Use tool "vision" (or answer from the attached image). Do NOT select image_generation or image_edit.`
      : hasImages && imageIntent?.tool === "image_edit"
      ? `- CRITICAL: The latest user message includes an uploaded image AND an edit intent. You MUST select tool "image_edit" (title: "✏️ Editing image..."). Do NOT select image_generation. The uploaded image is the primary source.`
      : imageIntent?.tool === "image_generation"
        ? `- The user wants a new image from text — select tool "image_generation".`
        : `- Priority with an upload: vision → image_edit → never image_generation. Without an upload, use image_generation only for create/draw/generate requests. Use ocr for read/transcribe.`;

  const prompt = `You are the planning module for VANI AI's ${agent.name}.
${VANI_IDENTITY_LOCK}
${agent.systemFocus}

Available tools (use only these names, or null if no tool is needed):
${catalog}

Conversation / memory context:
${contextText || "(none)"}

Uploaded image present on this turn: ${hasImages ? "YES" : "NO"}

User request:
${userMessage}

Return ONLY valid JSON with this shape:
{
  "goal": "one sentence goal",
  "steps": [
    {
      "title": "short UI label like Searching... or Analyzing...",
      "description": "what this step does",
      "tool": "tool_name_or_null",
      "args": {},
      "parallelGroup": null
    }
  ]
}

Rules:
- 2 to ${AGENT_CONFIG.maxPlanSteps} steps
- Prefer tools for live facts, math, weather, time, files, vision, ocr, image_generation, image_edit, memory, canvas
- For image create/edit requests, include an image_generation or image_edit step immediately — never plan to say images are unsupported
- For read/OCR/transcribe/summarize-scanned-PDF requests, include an ocr step first
${imageRoutingRule}
- image_edit edits the uploaded source image in place; image_generation creates a brand-new image from text only; ocr extracts text from images/PDFs — never mix them
- Steps with the same parallelGroup number may run in parallel
- Last step should synthesize the final answer (tool null)
- Titles should be concise progress labels (Searching..., Reading sources..., Analyzing..., Running OCR..., ✏️ Editing image..., Generating image..., Generating answer...)
- Do not invent tools not listed above`;

  const timeoutMs = AGENT_CONFIG.planTimeoutMs;

  try {
    const response = await Promise.race([
      getGeminiClient().models.generateContent({
        model: CHAT_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.2,
        },
      }),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Planning timed out")),
          timeoutMs
        );
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);

    if (signal?.aborted) {
      return { ok: false, error: "Aborted", steps: [] };
    }

    const parsed = extractJson(response?.text || "");
    const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : [];

    if (!rawSteps.length) {
      return {
        ok: true,
        goal: parsed?.goal || userMessage,
        steps: buildFallbackPlan(userMessage, agentTypeId, {
          hasImages,
          allowedTools: toolAllowList,
        }),
        fallback: true,
      };
    }

    const allowed = new Set(toolAllowList);
    // Priority: OCR → Vision → Edit. Never plan text-to-image while an upload is present.
    const forceOcr =
      hasImages &&
      allowed.has("ocr") &&
      (ocrIntent?.tool === "ocr" ||
        /\b(read|ocr|transcribe|extract\s+text|what\s+is\s+written|summarize)\b/i.test(
          String(userMessage || "")
        ));
    const forceVision =
      !forceOcr &&
      hasImages &&
      isVisionOnlyQuestion(userMessage) &&
      allowed.has("vision");
    const forceEdit =
      !forceOcr &&
      !forceVision &&
      hasImages &&
      allowed.has("image_edit") &&
      (imageIntent?.tool === "image_edit" || hasEditIntent(userMessage));

    const steps = rawSteps.slice(0, AGENT_CONFIG.maxPlanSteps).map((step, i) => {
      let tool =
        step?.tool && allowed.has(String(step.tool)) ? String(step.tool) : null;
      let title = String(step?.title || `Step ${i + 1}`).slice(0, 80);
      let args = step?.args && typeof step.args === "object" ? step.args : {};
      let description = String(step?.description || "").slice(0, 400);

      if (forceOcr && (tool === "ocr" || tool === "vision" || tool === "file_upload")) {
        tool = "ocr";
        title = "Running OCR...";
        description = "Extract text from the attached image or PDF";
        args = {
          focus:
            (typeof args.focus === "string" && args.focus.trim()) ||
            String(userMessage || "").slice(0, 500),
          ...(typeof args.fileId === "string" ? { fileId: args.fileId } : {}),
        };
      }

      // Vision Q&A: never allow image_generation / image_edit.
      if (
        forceVision &&
        (tool === "image_generation" || tool === "image_edit" || tool === "vision")
      ) {
        tool = "vision";
        title = "Analyzing image...";
        description = "Understand the attached image with vision";
        args = {
          question:
            (typeof args.question === "string" && args.question.trim()) ||
            String(userMessage || "").slice(0, 500),
        };
      }

      // Hard override: edit intent + upload → image_edit, never image_generation.
      if (forceEdit && (tool === "image_generation" || tool === "image_edit")) {
        tool = "image_edit";
        title = "✏️ Editing image...";
        description = "Edit the attached source image per the user's request";
        const fromGen =
          typeof args.prompt === "string" && args.prompt.trim()
            ? args.prompt.trim()
            : null;
        args = {
          instruction:
            (typeof args.instruction === "string" && args.instruction.trim()) ||
            fromGen ||
            String(userMessage || "").slice(0, 500),
        };
      }

      // Uploaded image must never plan text-to-image generation.
      if (hasImages && tool === "image_generation") {
        if (forceEdit) {
          tool = "image_edit";
          title = "✏️ Editing image...";
          description = "Edit the attached source image per the user's request";
          args = { instruction: String(userMessage || "").slice(0, 500) };
        } else if (allowed.has("vision")) {
          tool = "vision";
          title = "Analyzing image...";
          description = "Understand the attached image with vision";
          args = { question: String(userMessage || "").slice(0, 500) };
        } else {
          tool = null;
        }
      }

      return {
        id: `step-${i + 1}`,
        title,
        description,
        tool,
        args,
        parallelGroup:
          typeof step?.parallelGroup === "number" ? step.parallelGroup : null,
      };
    });

    if (
      forceOcr &&
      !steps.some((s) => s.tool === "ocr") &&
      allowed.has("ocr")
    ) {
      steps.unshift({
        id: "step-ocr",
        title: "Running OCR...",
        description: "Extract text from the attached image or PDF",
        tool: "ocr",
        args: { focus: String(userMessage || "").slice(0, 500) },
        parallelGroup: null,
      });
      steps.forEach((s, i) => {
        s.id = `step-${i + 1}`;
      });
    }

    if (
      forceVision &&
      !steps.some((s) => s.tool === "vision" || s.tool === "ocr") &&
      allowed.has("vision")
    ) {
      steps.unshift({
        id: "step-vision",
        title: "Analyzing image...",
        description: "Understand the attached image with vision",
        tool: "vision",
        args: { question: String(userMessage || "").slice(0, 500) },
        parallelGroup: null,
      });
      steps.forEach((s, i) => {
        s.id = `step-${i + 1}`;
      });
    }

    if (
      forceEdit &&
      !steps.some((s) => s.tool === "image_edit") &&
      allowed.has("image_edit")
    ) {
      steps.unshift({
        id: "step-edit",
        title: "✏️ Editing image...",
        description: "Edit the attached source image per the user's request",
        tool: "image_edit",
        args: { instruction: String(userMessage || "").slice(0, 500) },
        parallelGroup: null,
      });
      // Re-id after insert.
      steps.forEach((s, i) => {
        s.id = `step-${i + 1}`;
      });
    }

    // Ensure a synthesis step exists.
    const last = steps[steps.length - 1];
    if (last?.tool) {
      steps.push({
        id: `step-${steps.length + 1}`,
        title: "Generating answer...",
        description: "Synthesize findings into a clear final response",
        tool: null,
        args: {},
        parallelGroup: null,
      });
    }

    return {
      ok: true,
      goal: String(parsed?.goal || userMessage).slice(0, 300),
      steps,
      fallback: false,
    };
  } catch (err) {
    console.warn("[Planner] falling back:", err?.message);
    return {
      ok: true,
      goal: userMessage,
      steps: buildFallbackPlan(userMessage, agentTypeId, {
        hasImages,
        allowedTools: toolAllowList,
      }),
      fallback: true,
      warning: err?.message,
    };
  }
}
