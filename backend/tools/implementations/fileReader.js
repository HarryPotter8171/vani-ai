function extractTextFromContents(contents = []) {
  const blocks = [];
  for (const content of contents) {
    for (const part of content.parts || []) {
      if (typeof part.text === "string" && part.text.includes("--- File:")) {
        blocks.push(part.text);
      }
    }
  }
  return blocks.join("\n\n");
}

function listAttachmentMeta(attachments = [], contents = []) {
  const fromArgs = (attachments || []).map((a, i) => ({
    index: i + 1,
    name: a.name,
    kind: a.kind,
    mimeType: a.mimeType,
    size: a.size,
    hasExtractedText: !!a.extractedText,
    hasData: !!a.dataBase64,
  }));

  if (fromArgs.length) return fromArgs;

  // Infer from content markers when history was persisted without raw bytes
  const names = [];
  for (const content of contents) {
    for (const part of content.parts || []) {
      const text = part.text || "";
      const fileMatches = text.matchAll(/--- File: (.+?) \(/g);
      for (const m of fileMatches) names.push(m[1]);
      const imageMatches = text.matchAll(/\[Image \d+: (.+?)\]/g);
      for (const m of imageMatches) names.push(m[1]);
    }
  }
  return names.map((name, i) => ({ index: i + 1, name }));
}

export const fileReaderTool = {
  id: "file_reader",
  name: "file_reader",
  displayName: "File Reader",
  description:
    "Read and extract content from files the user attached in this chat (PDF text sections, DOCX, CSV, XLSX, TXT, Markdown, ZIP extracts). Use when you need to inspect file contents explicitly. Prefer this for large documents that were chunked in the main prompt — call repeatedly with increasing offset/limit and keep solving until the whole document/exam is finished; do not ask the user to continue.",
  schema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Optional exact or partial filename to focus on",
      },
      instruction: {
        type: "string",
        description: "Optional focus instruction, e.g. 'summarize sheet 2' or 'list headers'",
      },
      offset: {
        type: "number",
        description: "Optional character offset into extracted text for large documents",
      },
      limit: {
        type: "number",
        description: "Optional max characters to return (default 60000)",
      },
    },
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    const attachments = ctx.attachments || [];
    const contents = ctx.contents || [];
    const catalog = listAttachmentMeta(attachments, contents);

    if (!catalog.length && !extractTextFromContents(contents)) {
      return {
        ok: false,
        error: "No attached files are available in the current conversation.",
      };
    }

    const filename = String(args.filename || "").trim().toLowerCase();
    let selected = attachments;

    if (filename && attachments.length) {
      selected = attachments.filter((a) =>
        String(a.name || "")
          .toLowerCase()
          .includes(filename)
      );
      if (!selected.length) {
        return {
          ok: false,
          error: `No attachment matching "${args.filename}"`,
          available: catalog,
        };
      }
    }

    const pieces = [];
    for (const att of selected) {
      let text = att.extractedText || "";

      // Lazy-extract PDF/DOC text when hydration has bytes but no prior extract.
      if (!text && att.dataBase64 && (att.kind === "pdf" || !att.kind)) {
        try {
          const { parseAttachment } = await import("../../services/fileParseService.js");
          const parsed = await parseAttachment(att);
          text = parsed.text || "";
        } catch {
          text = "";
        }
      }

      if (text) {
        pieces.push(`--- File: ${att.name} ---\n${text}`);
      } else if (att.kind === "image") {
        pieces.push(
          `--- File: ${att.name} (image) ---\n[No OCR text stored — use vision_analyze for visual understanding]`
        );
      } else if (att.kind === "pdf") {
        pieces.push(
          `--- File: ${att.name} ---\n[PDF text could not be extracted. Ask the user to re-upload if the file is scanned or encrypted.]`
        );
      }
    }

    if (!pieces.length) {
      const fromHistory = extractTextFromContents(contents);
      if (fromHistory) {
        let text = fromHistory;
        if (filename) {
          const filtered = fromHistory
            .split(/--- File: /)
            .filter((block) => block.toLowerCase().includes(filename))
            .map((b, i) => (i === 0 && !b.startsWith("---") ? b : `--- File: ${b}`));
          text = filtered.join("\n\n") || fromHistory;
        }
        pieces.push(text);
      }
    }

    if (!pieces.length) {
      return {
        ok: false,
        error: "Files are listed but readable text was not found. Ask the user to re-attach if needed.",
        available: catalog,
      };
    }

    let content = pieces.join("\n\n");
    const offset =
      typeof args.offset === "number" && Number.isFinite(args.offset)
        ? Math.max(0, Math.floor(args.offset))
        : 0;
    const max =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(120_000, Math.max(1_000, Math.floor(args.limit)))
        : 60_000;

    if (offset > 0 || content.length > max) {
      const slice = content.slice(offset, offset + max);
      const hasMore = offset + max < content.length;
      content =
        slice +
        (hasMore
          ? `\n\n[Truncated at offset ${offset + slice.length}/${content.length}. Call file_reader again with a higher offset to continue.]`
          : "");
    }

    return {
      ok: true,
      instruction: args.instruction || null,
      available: catalog,
      content,
    };
  },
};
