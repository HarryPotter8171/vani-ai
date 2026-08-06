/**
 * Collect image inlineData parts from conversation contents / attachments.
 * Shared by vision_analyze and image_edit.
 */

import { normalizeImageMime } from "../../services/image/shared.js";

export function collectImageParts(contents = [], attachments = []) {
  const parts = [];

  for (const content of contents) {
    for (const part of content.parts || []) {
      const mime = normalizeImageMime(part?.inlineData?.mimeType || "");
      if (mime.startsWith("image/") && part.inlineData?.data) {
        parts.push({
          inlineData: {
            mimeType: mime === "image/jpg" ? "image/jpeg" : mime,
            data: part.inlineData.data,
          },
        });
      }
    }
  }

  if (!parts.length) {
    for (const att of attachments) {
      if (
        (att?.kind === "image" ||
          String(att?.mimeType || "").startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(att?.name || "")) &&
        att.dataBase64
      ) {
        parts.push({
          inlineData: {
            mimeType: normalizeImageMime(att.mimeType) || "image/jpeg",
            data: att.dataBase64,
          },
        });
      }
    }
  }

  return parts.slice(0, 8);
}

export function conversationHasImages(contents = [], attachments = []) {
  if (collectImageParts(contents, attachments).length > 0) return true;
  // fileId-only image chips still count — the edit tool can rehydrate bytes.
  return (attachments || []).some((att) => {
    if (!att) return false;
    const mime = String(att.mimeType || "").toLowerCase();
    const kind = String(att.kind || "").toLowerCase();
    const isImage =
      kind === "image" ||
      mime.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(att.name || "");
    return isImage && (att.dataBase64 || att.fileId || att.id);
  });
}
