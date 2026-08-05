import { CHAT_MODEL, getGeminiClient } from "../../services/geminiClient.js";
import { VANI_IDENTITY_PREFIX } from "../../services/identity.js";
import { collectImageParts } from "./imageParts.js";

export const visionTool = {
  id: "vision",
  name: "vision_analyze",
  displayName: "Vision",
  description:
    "Deeply analyze one or more images already attached in the conversation (charts, screenshots, handwriting, receipts, UI, math, photos). Use when a focused visual analysis is needed beyond the default glance.",
  schema: {
    type: "object",
    properties: {
      focus: {
        type: "string",
        description:
          "What to focus on, e.g. 'extract table values', 'transcribe handwriting', 'explain the chart trend'",
      },
      imageIndex: {
        type: "number",
        description: "Optional 1-based image index when multiple images are attached",
      },
    },
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    const imageParts = collectImageParts(ctx.contents, ctx.attachments);
    if (!imageParts.length) {
      return {
        ok: false,
        error: "No images are available in the current conversation to analyze.",
      };
    }

    let selected = imageParts;
    const index = Number(args.imageIndex);
    if (Number.isFinite(index) && index >= 1) {
      const hit = imageParts[index - 1];
      if (!hit) {
        return {
          ok: false,
          error: `Image ${index} not found. ${imageParts.length} image(s) available.`,
        };
      }
      selected = [hit];
    }

    const focus =
      String(args.focus || "").trim() ||
      "Provide a precise, high-signal analysis of the image(s).";

    try {
      const response = await getGeminiClient().models.generateContent({
        model: CHAT_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${VANI_IDENTITY_PREFIX}\nYou are VANI AI Vision. Analyze the attached image(s) with extreme care.\nFocus: ${focus}\nGround every claim in what is visible. If something is unreadable, say so.`,
              },
              ...selected,
            ],
          },
        ],
      });

      return {
        ok: true,
        focus,
        imageCount: selected.length,
        analysis: response.text || "",
      };
    } catch (err) {
      return { ok: false, error: err.message || "Vision analysis failed" };
    }
  },
};
