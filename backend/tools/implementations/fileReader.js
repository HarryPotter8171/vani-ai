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
    "Read and extract content from files the user attached in this chat (PDF text sections, DOCX, CSV, XLSX, TXT, Markdown, ZIP extracts). Use when you need to inspect file contents explicitly.",
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
      if (att.extractedText) {
        pieces.push(`--- File: ${att.name} ---\n${att.extractedText}`);
      } else if (att.kind === "image") {
        pieces.push(`--- File: ${att.name} ---\n[Image file — use vision_analyze for visual understanding]`);
      } else if (att.kind === "pdf") {
        pieces.push(
          `--- File: ${att.name} ---\n[PDF is available as multimodal context in the main conversation]`
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

    const content = pieces.join("\n\n");
    const max = 60_000;
    return {
      ok: true,
      instruction: args.instruction || null,
      available: catalog,
      content: content.length > max ? `${content.slice(0, max)}\n\n[Truncated]` : content,
    };
  },
};
