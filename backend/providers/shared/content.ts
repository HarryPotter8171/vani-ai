import type { ContentMessage, ContentPart, ToolDeclaration } from "../types.ts";

/** Convert Gemini-style contents → OpenAI chat messages. */
export function contentsToOpenAIMessages(
  contents: ContentMessage[],
  systemInstruction?: string
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  if (systemInstruction?.trim()) {
    messages.push({ role: "system", content: systemInstruction.trim() });
  }

  for (const msg of contents) {
    if (msg.role === "system") {
      const text = partsToText(msg.parts);
      if (text) messages.push({ role: "system", content: text });
      continue;
    }

    const role = msg.role === "model" ? "assistant" : "user";
    const toolCalls = msg.parts.filter((p) => p.functionCall);
    const toolResponses = msg.parts.filter((p) => p.functionResponse);
    const mediaParts = msg.parts.filter((p) => p.inlineData || p.text);

    if (toolResponses.length) {
      for (const part of toolResponses) {
        const fr = part.functionResponse!;
        messages.push({
          role: "tool",
          tool_call_id: fr.id || fr.name,
          content: safeJson(fr.response),
        });
      }
      continue;
    }

    if (toolCalls.length && role === "assistant") {
      const text = partsToText(msg.parts.filter((p) => p.text));
      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.map((p, i) => ({
          id: p.functionCall!.id || `call_${p.functionCall!.name}_${i}`,
          type: "function",
          function: {
            name: p.functionCall!.name,
            arguments: JSON.stringify(p.functionCall!.args || {}),
          },
        })),
      });
      continue;
    }

    const content = mediaPartsToOpenAIContent(mediaParts);
    if (content === "" || (Array.isArray(content) && !content.length)) continue;
    messages.push({ role, content });
  }

  return messages;
}

/** Convert Gemini-style contents → Anthropic messages (+ system string). */
export function contentsToAnthropic(
  contents: ContentMessage[],
  systemInstruction?: string
): { system?: string; messages: Array<Record<string, unknown>> } {
  const system = systemInstruction?.trim() || undefined;
  const messages: Array<Record<string, unknown>> = [];

  for (const msg of contents) {
    if (msg.role === "system") continue;
    const role = msg.role === "model" ? "assistant" : "user";

    const toolUses = msg.parts.filter((p) => p.functionCall);
    const toolResults = msg.parts.filter((p) => p.functionResponse);

    if (toolResults.length) {
      messages.push({
        role: "user",
        content: toolResults.map((p) => ({
          type: "tool_result",
          tool_use_id: p.functionResponse!.id || p.functionResponse!.name,
          content: safeJson(p.functionResponse!.response),
        })),
      });
      continue;
    }

    if (toolUses.length && role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      const text = partsToText(msg.parts.filter((p) => p.text));
      if (text) blocks.push({ type: "text", text });
      for (const p of toolUses) {
        blocks.push({
          type: "tool_use",
          id: p.functionCall!.id || `toolu_${p.functionCall!.name}`,
          name: p.functionCall!.name,
          input: p.functionCall!.args || {},
        });
      }
      messages.push({ role: "assistant", content: blocks });
      continue;
    }

    const content = mediaPartsToAnthropicContent(msg.parts);
    if (!content || (Array.isArray(content) && !content.length)) continue;
    messages.push({ role, content });
  }

  return { system, messages };
}

export function toolsToOpenAI(tools: ToolDeclaration[] = []) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parametersJsonSchema || { type: "object", properties: {} },
    },
  }));
}

export function toolsToAnthropic(tools: ToolDeclaration[] = []) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parametersJsonSchema || { type: "object", properties: {} },
  }));
}

export function partsToText(parts: ContentPart[] = []): string {
  return parts
    .map((p) => p.text || "")
    .filter(Boolean)
    .join("\n");
}

function mediaPartsToOpenAIContent(parts: ContentPart[]) {
  const hasMedia = parts.some((p) => p.inlineData);
  if (!hasMedia) return partsToText(parts);

  const blocks: Array<Record<string, unknown>> = [];
  for (const p of parts) {
    if (p.text) blocks.push({ type: "text", text: p.text });
    if (p.inlineData?.mimeType?.startsWith("image/") && p.inlineData.data) {
      blocks.push({
        type: "image_url",
        image_url: {
          url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
        },
      });
    } else if (p.inlineData?.data) {
      // Non-image binaries: inject a text note (most OpenAI-compatible APIs
      // don't accept arbitrary inline PDFs the way Gemini does).
      blocks.push({
        type: "text",
        text: `[Attached file: ${p.inlineData.mimeType}]`,
      });
    }
  }
  return blocks;
}

function mediaPartsToAnthropicContent(parts: ContentPart[]) {
  const hasMedia = parts.some((p) => p.inlineData);
  if (!hasMedia) {
    const text = partsToText(parts);
    return text || undefined;
  }
  const blocks: Array<Record<string, unknown>> = [];
  for (const p of parts) {
    if (p.text) blocks.push({ type: "text", text: p.text });
    if (p.inlineData?.mimeType?.startsWith("image/") && p.inlineData.data) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: p.inlineData.mimeType,
          data: p.inlineData.data,
        },
      });
    } else if (p.inlineData?.data) {
      blocks.push({
        type: "text",
        text: `[Attached file: ${p.inlineData.mimeType}]`,
      });
    }
  }
  return blocks;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{"ok":false,"error":"unserializable"}';
  }
}

export function contentsHaveVision(contents: ContentMessage[]): boolean {
  return contents.some((c) =>
    (c.parts || []).some(
      (p) =>
        p?.inlineData?.mimeType?.startsWith("image/") ||
        p?.inlineData?.mimeType === "application/pdf"
    )
  );
}
