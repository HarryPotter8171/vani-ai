import { generateReply } from "../geminiService.js";
import { VANI_IDENTITY_LOCK } from "../identity.js";
import { sanitizeIdentityResponse } from "../identity/IdentityGuard.js";
import { updateCanvas } from "./canvasService.js";

export const AI_EDIT_ACTIONS = [
  "rewrite",
  "expand",
  "shorten",
  "fix_grammar",
  "improve_writing",
  "translate",
  "explain",
  "continue_writing",
  "refactor_code",
  "optimize_code",
  "custom",
];

const ACTION_INSTRUCTIONS = {
  rewrite: "Rewrite the selected text with clearer phrasing. Preserve meaning and tone.",
  expand: "Expand the selected text with useful detail. Keep the original voice.",
  shorten: "Shorten the selected text while preserving key meaning.",
  fix_grammar: "Fix grammar, spelling, and punctuation. Do not change meaning.",
  improve_writing: "Improve clarity, flow, and polish. Preserve intent and facts.",
  translate: "Translate the selected text into the target language specified by the user.",
  explain: "Explain the selected text clearly and concisely for the reader.",
  continue_writing: "Continue writing from the end of the selection in the same style.",
  refactor_code: "Refactor the selected code for clarity and structure without changing behavior.",
  optimize_code: "Optimize the selected code for performance/readability. Preserve behavior.",
  custom: "Follow the user's instruction precisely for the selected region.",
};

function clampIndex(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

/**
 * Apply an AI edit to a selection (or whole document when wholeDocument=true).
 * Returns the updated canvas plus the replacement text.
 */
export async function applyAiEdit(userId, canvas, input = {}) {
  if (!canvas) throw new Error("Canvas required");

  const action = String(input.action || "rewrite").toLowerCase();
  if (!AI_EDIT_ACTIONS.includes(action)) {
    throw new Error(`Invalid AI action. Expected one of: ${AI_EDIT_ACTIONS.join(", ")}`);
  }

  const content = canvas.content ?? "";
  const wholeDocument = Boolean(input.wholeDocument);
  const instruction = String(input.instruction || "").trim().slice(0, 2000);
  const targetLanguage = String(input.targetLanguage || "English").trim().slice(0, 80);

  let start = 0;
  let end = content.length;

  if (!wholeDocument) {
    if (input.selectedText != null && input.start == null && input.end == null) {
      // Locate first occurrence of provided selection when offsets omitted.
      const selected = String(input.selectedText);
      const idx = content.indexOf(selected);
      if (idx === -1) {
        throw new Error("Selected text was not found in the canvas content");
      }
      start = idx;
      end = idx + selected.length;
    } else {
      start = clampIndex(input.start, content.length);
      end = clampIndex(input.end, content.length);
      if (end < start) [start, end] = [end, start];
    }
  }

  const selectedText = content.slice(start, end);
  if (!selectedText.trim() && action !== "continue_writing") {
    throw new Error("Select some text to edit, or request a whole-document edit");
  }

  const actionGuide = ACTION_INSTRUCTIONS[action];
  const scopeNote = wholeDocument
    ? "Edit the entire document."
    : "Edit ONLY the selected region. Return ONLY the replacement for that region — not the full document.";

  const systemMessages = [
    {
      role: "user",
      content: [
        "You are VANI AI Canvas editor. You transform document regions for a collaborative writing/coding workspace.",
        VANI_IDENTITY_LOCK,
        scopeNote,
        `Action: ${action}`,
        actionGuide,
        action === "translate" ? `Target language: ${targetLanguage}` : "",
        instruction ? `Additional user instruction: ${instruction}` : "",
        "Canvas type: " + canvas.type,
        canvas.language ? `Language: ${canvas.language}` : "",
        "Rules:",
        "- Return ONLY the edited text for the region (or full document if whole-document).",
        "- Do not wrap the answer in markdown fences unless the source itself is fenced.",
        "- Do not add commentary, labels, or explanations outside the replacement text.",
        action === "explain"
          ? "- For explain: return a clear explanation (this replaces the selection)."
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        "=== SELECTED REGION ===",
        selectedText || "(empty — continue writing from surrounding context)",
        "=== DOCUMENT CONTEXT (read-only) ===",
        content.length > 12000
          ? `${content.slice(0, 6000)}\n\n…[truncated]…\n\n${content.slice(-6000)}`
          : content,
      ].join("\n"),
    },
  ];

  let replacement = await generateReply(systemMessages, "Canvas");
  replacement = sanitizeIdentityResponse(
    String(replacement || "").replace(/^\uFEFF/, ""),
    instruction || action
  );

  // Strip accidental outer fences when the source region wasn't fenced.
  if (!selectedText.trimStart().startsWith("```")) {
    const fenced = replacement.match(/^```[^\n]*\n([\s\S]*?)\n```\s*$/);
    if (fenced) replacement = fenced[1];
  }

  const nextContent = content.slice(0, start) + replacement + content.slice(end);

  const updated = await updateCanvas(
    userId,
    canvas.id,
    { content: nextContent },
    {
      expectedRevision: input.expectedRevision,
      source: "ai",
      note: `AI ${action}`,
      force: Boolean(input.force),
    }
  );

  return {
    canvas: updated,
    replacement,
    start,
    end: start + replacement.length,
    action,
  };
}
