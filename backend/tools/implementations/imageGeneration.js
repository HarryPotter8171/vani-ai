import { IMAGE_MODEL, getGeminiClient } from "../../services/geminiClient.js";

export const imageGenerationTool = {
  id: "image_generation",
  name: "image_generation",
  displayName: "Image Generation",
  description:
    "Generate an image from a text prompt using Imagen. Use when the user asks to create, draw, design, or illustrate something visual.",
  schema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detailed description of the image to generate",
      },
      aspectRatio: {
        type: "string",
        description: "Optional aspect ratio",
        enum: ["1:1", "3:4", "4:3", "9:16", "16:9"],
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async execute(args = {}) {
    const prompt = String(args.prompt || "").trim();
    if (!prompt) return { ok: false, error: "Prompt is required" };
    if (prompt.length > 2000) return { ok: false, error: "Prompt too long" };

    // Allow ops to disable Imagen without removing the tool from the registry.
    if (process.env.VANI_DISABLE_IMAGE_GEN === "true") {
      return {
        ok: false,
        error: "Image generation is temporarily disabled.",
      };
    }

    try {
      const response = await getGeminiClient().models.generateImages({
        model: IMAGE_MODEL,
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: args.aspectRatio || "1:1",
          includeRaiReason: true,
        },
      });

      const generated = response?.generatedImages?.[0];
      const bytes = generated?.image?.imageBytes;
      const mimeType = generated?.image?.mimeType || "image/png";

      if (!bytes) {
        return {
          ok: false,
          error:
            generated?.raiFilteredReason ||
            "Image generation returned no image. The prompt may have been filtered, or Imagen may not be enabled for this project.",
          prompt,
        };
      }

      return {
        ok: true,
        prompt,
        mimeType,
        // Base64 payload for the model / optional markdown embedding
        imageBase64: bytes,
        note: "Image generated successfully. Describe it briefly for the user; the client may render the image from the tool payload.",
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || "Image generation failed",
        prompt,
      };
    }
  },
};
