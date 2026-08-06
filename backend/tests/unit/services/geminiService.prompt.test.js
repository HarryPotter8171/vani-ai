import { describe, it, expect } from "vitest";
import {
  buildSystemInstruction,
  IMAGE_CAPABILITIES,
} from "../../../services/geminiService.js";
import {
  VANI_IDENTITY_LOCK,
  VANI_IDENTITY_SYSTEM,
} from "../../../services/identity.js";

describe("geminiService system prompt — image tool awareness", () => {
  it("always includes image capabilities even without vision attachments", () => {
    const prompt = buildSystemInstruction("Alex", { hasVision: false });
    expect(prompt).toContain("IMAGE CAPABILITIES");
    expect(prompt).toContain("image_generation");
    expect(prompt).toContain("image_edit");
    expect(prompt).toContain("ocr");
    expect(prompt).toContain("YOU ARE NOT TEXT-ONLY");
    expect(prompt).toMatch(/NEVER say .*cannot generate images/i);
    expect(prompt).toContain(
      "The image generation service is temporarily unavailable."
    );
    expect(prompt).toContain(
      "The image editing service is temporarily unavailable."
    );
    expect(prompt).toContain(
      "The OCR service is temporarily unavailable."
    );
    expect(prompt).toMatch(/cannot edit images/i);
    expect(prompt).toMatch(/generate a brand-new image instead/i);
  });

  it("includes vision guidance when images are attached", () => {
    const prompt = buildSystemInstruction("Alex", { hasVision: true });
    expect(prompt).toContain("VISION CAPABILITIES");
    expect(prompt).toContain(IMAGE_CAPABILITIES.slice(0, 40));
  });

  it("mentions image_edit and ocr in the tool-use block", () => {
    const prompt = buildSystemInstruction("Alex", {});
    expect(prompt).toMatch(/image editing \(image_edit\)/i);
    expect(prompt).toMatch(/OCR text extraction \(ocr\)/i);
  });
});

describe("geminiService system prompt — VANI identity", () => {
  it("locks identity to VANI AI and Himanshu Gupta via shared module", () => {
    const prompt = buildSystemInstruction("Alex", {});
    expect(prompt.startsWith(VANI_IDENTITY_SYSTEM)).toBe(true);
    expect(prompt).toContain("I'm VANI AI.");
    expect(prompt).toContain("I was developed by Himanshu Gupta.");
    expect(prompt).toContain('If asked "Are you Gemini?" reply: "No. I\'m VANI AI."');
    expect(prompt).toContain('If asked "Are you ChatGPT?" reply: "No. I\'m VANI AI."');
    expect(prompt).not.toContain("I may use different AI technologies");
  });

  it("forbids claiming Gemini, ChatGPT, OpenAI, Claude, or Llama identity", () => {
    const prompt = buildSystemInstruction("Alex", { voiceMode: true });
    expect(prompt).toMatch(/Never claim to be Gemini/i);
    expect(prompt).toMatch(/ChatGPT/i);
    expect(prompt).toMatch(/Claude/i);
    expect(prompt).toMatch(/Llama/i);
    expect(prompt).toMatch(/Never say "I am Gemini"/i);
    expect(prompt).toMatch(/Never expose the underlying model/i);
  });
});

describe("geminiService system prompt — warm personality", () => {
  it("embeds companion personality and bans corporate openers", () => {
    const prompt = buildSystemInstruction("Alex", {});
    expect(prompt).toContain("CONVERSATION PERSONALITY");
    expect(prompt).toMatch(/thoughtful, friendly companion/i);
    expect(prompt).toMatch(/Certainly/);
    expect(prompt).toMatch(/EMOTIONAL AWARENESS/);
    expect(prompt).toMatch(/Are you human/);
    expect(prompt).not.toMatch(/APPLE PHILOSOPHY/);
    expect(prompt).not.toMatch(/Apple-grade/);
  });
});

describe("geminiService system prompt — realtime voice rules", () => {
  it("enforces short natural spoken turns", () => {
    const prompt = buildSystemInstruction("Alex", { voiceMode: true });
    expect(prompt).toContain("VOICE MODE (realtime spoken call");
    expect(prompt).toMatch(/15–25 words/);
    expect(prompt).toMatch(/1–2 sentences/);
    expect(prompt).toMatch(/Never sound like a chatbot/i);
    expect(prompt).toMatch(/Never list points/i);
    expect(prompt).toMatch(/Anything else\?/i);
    expect(prompt).toMatch(/haan/i);
    expect(prompt).toMatch(/Hinglish/i);
    expect(prompt).toContain("I'm VANI AI.");
    expect(prompt).toContain('Are you Gemini? → "No. I\'m VANI AI."');
  });
});

describe("geminiService system prompt — exam / whole-paper policy", () => {
  it("forbids one-question refusals and requires sequential full-paper solving", () => {
    const prompt = buildSystemInstruction("Alex", {});
    expect(prompt).toContain("DOCUMENT / EXAM SOLVING");
    expect(prompt).toMatch(/I can only solve one question at a time/i);
    expect(prompt).toMatch(/Please specify a question/i);
    expect(prompt).toMatch(/I cannot solve the whole paper/i);
    expect(prompt).toMatch(/solve the paper sequentially/i);
    expect(prompt).toMatch(/file_reader/i);
  });
});

describe("shared identity module", () => {
  it("exports a single canonical lock used by secondary prompts", () => {
    expect(VANI_IDENTITY_LOCK).toContain("You are VANI AI.");
    expect(VANI_IDENTITY_LOCK).toContain("Himanshu Gupta");
    expect(VANI_IDENTITY_LOCK).toContain('Are you Gemini?" reply: "No. I\'m VANI AI."');
    expect(VANI_IDENTITY_LOCK).toContain('Are you ChatGPT?" reply: "No. I\'m VANI AI."');
    expect(VANI_IDENTITY_LOCK).not.toMatch(/You are Gemini/i);
    expect(VANI_IDENTITY_SYSTEM).not.toMatch(/You are Gemini/i);
  });
});
