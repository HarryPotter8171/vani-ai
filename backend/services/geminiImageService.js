/**
 * Gemini native image paths — generation and editing are completely separate.
 *
 * IMAGE GENERATION (text-to-image):
 *   text → generateImage() → models.generateContent(IMAGE_MODEL)
 *   NEVER accepts source image bytes.
 *
 * IMAGE EDITING (source-preserving):
 *   uploaded image + instruction → editImage() → models.generateContent(IMAGE_MODEL)
 *   ALWAYS sends prepared source bytes as inlineData (official Gemini edit path).
 *   NEVER calls generateImage(). NEVER calls deprecated Imagen models.editImage.
 *
 * @see https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images
 */

import { Modality } from "@google/genai";
import { IMAGE_MODEL, getGeminiClient } from "./geminiClient.js";
import { prepareEditSourceImage } from "./image/prepareEditSource.js";

function extractGenerateContentImage(response, { failureNoun }) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  const textPart = parts.find(
    (p) => typeof p?.text === "string" && p.text.trim()
  );

  if (!imagePart?.inlineData?.data) {
    const blockReason =
      response?.promptFeedback?.blockReason ||
      response?.candidates?.[0]?.finishReason ||
      "";
    return {
      ok: false,
      error:
        (textPart?.text && String(textPart.text).slice(0, 280)) ||
        (blockReason
          ? `Image ${failureNoun} was blocked (${blockReason}).`
          : `Image ${failureNoun} returned no image.`),
      modelText: textPart?.text ? String(textPart.text).trim() : undefined,
    };
  }

  return {
    ok: true,
    mimeType: imagePart.inlineData.mimeType || "image/png",
    imageBase64: String(imagePart.inlineData.data),
    modelText: textPart?.text ? String(textPart.text).trim() : undefined,
  };
}

/**
 * Text-only image generation. Never accepts a source image.
 */
export async function generateImage({ prompt, aspectRatio } = {}) {
  const text = String(prompt || "").trim();
  if (!text) return { ok: false, error: "Prompt is required" };
  if (text.length > 2000) return { ok: false, error: "Prompt too long" };

  const aspectHint = aspectRatio
    ? ` Use a ${aspectRatio} aspect ratio composition.`
    : "";

  console.info(
    "[image_trace] mode=Generate fn=generateImage model=%s sourceBytes=0 inlineData=false",
    IMAGE_MODEL
  );

  const response = await getGeminiClient().models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Generate an image for this request.${aspectHint}\n\n${text}`,
          },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const extracted = extractGenerateContentImage(response, {
    failureNoun: "generation",
  });
  if (!extracted.ok) {
    return {
      ...extracted,
      error:
        extracted.error === "Image generation returned no image."
          ? "Image generation returned no image. The prompt may have been filtered, or the image model may not be available for this project."
          : extracted.error,
      prompt: text,
      mode: "Generate",
    };
  }

  return {
    ok: true,
    prompt: text,
    mimeType: extracted.mimeType,
    imageBase64: extracted.imageBase64,
    modelText: extracted.modelText,
    mode: "Generate",
    model: IMAGE_MODEL,
    note: "Image generated successfully. Briefly describe it for the user; do not reprint base64 — the client will render the image.",
  };
}

/**
 * Build the text part for an edit request.
 *
 * Matches Google's local-edit template (ai.google.dev image-generation):
 *   "Using the provided image, change only X. Keep everything else exactly
 *    the same, preserving the original style, lighting, and composition."
 *
 * A bare "Edit this image. {verb}" frame is too weak — gemini-*-flash-image
 * then drifts into text-to-image and redraws a new scene from the instruction.
 */
export function buildEditInstruction(instruction) {
  const change = String(instruction || "").trim();
  if (!change) return "";
  if (
    /using the provided image/i.test(change) &&
    /keep (everything|the rest)/i.test(change)
  ) {
    return change;
  }
  return (
    `Using the provided image, apply only this edit: ${change}. ` +
    `Keep everything else in the image exactly the same — preserve the original ` +
    `camera angle, subjects, objects, perspective, lighting, colors, textures, ` +
    `and composition except where this edit requires a change. ` +
    `Do not redraw, restyle, or regenerate the scene from scratch.`
  );
}

/**
 * Edit an uploaded source image via Gemini multimodal generateContent.
 *
 * Payload matches the official Vertex/Gemini edit example:
 *   parts: [ inlineData(source), text("Edit this image…") ]
 *   config.responseModalities: [TEXT, IMAGE]
 *
 * Never calls generateImage() / Imagen editImage.
 */
export async function editImage({ instruction, imageParts = [] } = {}) {
  const change = String(instruction || "").trim();
  if (!change) return { ok: false, error: "Instruction is required" };
  if (change.length > 2000) return { ok: false, error: "Instruction too long" };

  const sources = (Array.isArray(imageParts) ? imageParts : []).filter(
    (p) =>
      p?.inlineData?.data &&
      String(p.inlineData.mimeType || "").startsWith("image/")
  );

  if (!sources.length) {
    console.warn(
      "[image_trace] mode=Edit fn=editImage ABORT reason=no_source_bytes"
    );
    return {
      ok: false,
      error: "No images are available in the current conversation to edit.",
      mode: "Edit",
    };
  }

  const source = sources[sources.length - 1];
  let prepared;
  try {
    prepared = await prepareEditSourceImage(
      source.inlineData.data,
      source.inlineData.mimeType || "image/png"
    );
  } catch (err) {
    console.warn(
      "[image_trace] mode=Edit fn=editImage ABORT reason=prepare_failed err=%s",
      err?.message || err
    );
    return {
      ok: false,
      error: "Could not read the uploaded image for editing.",
      mode: "Edit",
    };
  }

  const editText = buildEditInstruction(change);

  // Exact Gemini request shape (base64 truncated in logs — full bytes are sent).
  const geminiPayload = {
    model: IMAGE_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: prepared.mimeType,
              data: prepared.dataBase64,
            },
          },
          {
            text: editText,
          },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  };

  console.info(
    "[image_trace] mode=Edit fn=editImage api=models.generateContent exact_payload=%s",
    JSON.stringify({
      model: geminiPayload.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: prepared.mimeType,
                data: `[base64 length=${prepared.dataBase64.length} decodedBytes=${prepared.bytes}]`,
                width: prepared.width,
                height: prepared.height,
              },
            },
            { text: editText },
          ],
        },
      ],
      config: geminiPayload.config,
    })
  );

  // Official Gemini edit pattern (Node sample): image inlineData first, then text.
  // NEVER call generateImage() here — that path is text-only and drops source bytes.
  const response = await getGeminiClient().models.generateContent(geminiPayload);

  const extracted = extractGenerateContentImage(response, {
    failureNoun: "edit",
  });
  if (!extracted.ok) {
    return {
      ...extracted,
      error:
        extracted.error === "Image edit returned no image."
          ? "Image edit returned no image."
          : extracted.error,
      instruction: change,
      mode: "Edit",
      model: IMAGE_MODEL,
    };
  }

  return {
    ok: true,
    instruction: change,
    mimeType: extracted.mimeType,
    imageBase64: extracted.imageBase64,
    mode: "Edit",
    model: IMAGE_MODEL,
    sourceBytes: prepared.bytes,
    sourceMime: prepared.mimeType,
    sourceWidth: prepared.width,
    sourceHeight: prepared.height,
    note: "Image edited successfully. Do not describe OCR, metadata, or base64.",
  };
}
