import { describe, it, expect } from "vitest";
import {
  buildSystemInstruction,
  IMAGE_CAPABILITIES,
  detectScriptStyle,
} from "../../../services/geminiService.js";
import {
  VANI_IDENTITY_LOCK,
  VANI_IDENTITY_SYSTEM,
  VANI_IDENTITY_PREFIX,
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

  it("forbids embedding fake images in chat text", () => {
    const prompt = buildSystemInstruction("Alex", {});
    expect(prompt).toContain("CHAT TEXT — NEVER FAKE IMAGES");
    expect(prompt).toMatch(/Markdown image tags/i);
    expect(prompt).toMatch(/base64 image data/i);
    expect(prompt).toMatch(/data:image/i);
    expect(prompt).toMatch(/never fabricate/i);
  });
});

describe("geminiService system prompt — VANI identity", () => {
  it("locks identity to VANI AI and only mentions creator when asked", () => {
    const prompt = buildSystemInstruction("Alex", {});
    expect(prompt.startsWith(VANI_IDENTITY_SYSTEM)).toBe(true);
    expect(prompt).toContain("I'm VANI AI.");
    expect(prompt).toContain("NEVER proactively mention your creator/developer in normal conversation");
    expect(prompt).toContain("unless the user specifically asks");
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

  it("only mentions creator when specifically asked in identity lock", () => {
    expect(VANI_IDENTITY_LOCK).toContain("If asked");
    expect(VANI_IDENTITY_LOCK).toContain("Who made you");
    expect(VANI_IDENTITY_LOCK).toContain("Who created you");
    expect(VANI_IDENTITY_LOCK).toContain("Tumhe kisne banaya");
    expect(VANI_IDENTITY_LOCK).toContain("VANI ko kisne banaya");
  });

  it("only mentions creator when specifically asked in identity system", () => {
    expect(VANI_IDENTITY_SYSTEM).toContain("NEVER proactively mention your creator/developer");
    expect(VANI_IDENTITY_SYSTEM).toContain("unless the user specifically asks");
    expect(VANI_IDENTITY_SYSTEM).toContain("Who made you");
    expect(VANI_IDENTITY_SYSTEM).toContain("Who created you");
    expect(VANI_IDENTITY_SYSTEM).toContain("Who is your developer");
    expect(VANI_IDENTITY_SYSTEM).toContain("Tumhe kisne banaya");
    expect(VANI_IDENTITY_SYSTEM).toContain("VANI ko kisne banaya");
    expect(VANI_IDENTITY_SYSTEM).toContain("Tumhara creator kaun hai");
  });

  it("identity prefix does not include creator name proactively", () => {
    expect(VANI_IDENTITY_PREFIX).toContain("You are VANI AI");
    expect(VANI_IDENTITY_PREFIX).not.toContain("created by");
    expect(VANI_IDENTITY_PREFIX).not.toContain("Himanshu Gupta");
  });
});

describe("script style detection", () => {
  it("detects Roman Hindi/Hinglish input", () => {
    expect(detectScriptStyle("iske bare m sab batao")).toBe("roman");
    expect(detectScriptStyle("mujhe iska summary do")).toBe("roman");
    expect(detectScriptStyle("bhai explain this document")).toBe("roman");
    expect(detectScriptStyle("kya hai ye")).toBe("roman");
    expect(detectScriptStyle("acha batao")).toBe("roman");
    expect(detectScriptStyle("theek hai")).toBe("roman");
  });

  it("detects Devanagari Hindi input", () => {
    expect(detectScriptStyle("इस दस्तावेज़ के बारे में बताओ")).toBe("devanagari");
    expect(detectScriptStyle("क्या है यह")).toBe("devanagari");
    expect(detectScriptStyle("मुझे सारांश दो")).toBe("devanagari");
  });

  it("detects English input", () => {
    expect(detectScriptStyle("what is this document about?")).toBe("english");
    expect(detectScriptStyle("Hello, how are you?")).toBe("english");
    expect(detectScriptStyle("Explain this")).toBe("english");
  });

  it("detects mixed script input", () => {
    expect(detectScriptStyle("यह document के बारे में बताओ")).toBe("mixed");
    expect(detectScriptStyle("What is यह thing")).toBe("mixed");
  });

  it("handles edge cases", () => {
    expect(detectScriptStyle("")).toBe("english");
    expect(detectScriptStyle(null)).toBe("english");
    expect(detectScriptStyle(undefined)).toBe("english");
    expect(detectScriptStyle("123")).toBe("english");
  });
});

describe("language instruction generation", () => {
  it("generates Roman Hindi instruction for Roman Hindi input", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "iske bare m sab batao" });
    expect(prompt).toContain("Roman Hindi/Hinglish");
    expect(prompt).toContain("batao");
    expect(prompt).toContain("bataunga");
    expect(prompt).toContain("same script style");
  });

  it("generates Devanagari instruction for Devanagari input", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "इस दस्तावेज़ के बारे में बताओ" });
    expect(prompt).toContain("Devanagari Hindi");
    expect(prompt).toContain("हिंदी");
  });

  it("generates English instruction for English input", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "what is this document about?" });
    expect(prompt).toContain("Reply in English");
  });

  it("generates mixed script instruction for mixed input", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "यह document के बारे में बताओ" });
    expect(prompt).toContain("mixed style");
  });

  it("preserves voice mode language instructions", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "batao", voiceMode: true });
    expect(prompt).toContain("Auto-detect Hindi, English, or Hinglish");
    expect(prompt).toContain("Reply in the same language/mix");
  });
});

describe("creator mention behavior", () => {
  it("does NOT proactively mention creator in normal conversation", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "hello, how are you?" });
    expect(prompt).toContain("NEVER proactively mention your creator/developer in normal conversation");
    expect(prompt).toContain("unless the user specifically asks");
  });

  it("includes specific creator question handling instructions", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "who are you?" });
    expect(prompt).toContain("Who made you");
    expect(prompt).toContain("Who created you");
    expect(prompt).toContain("Who is your developer");
    expect(prompt).toContain("Tumhe kisne banaya");
    expect(prompt).toContain("VANI ko kisne banaya");
    expect(prompt).toContain("Tumhara creator kaun hai");
    expect(prompt).toContain("I was developed by Himanshu Gupta");
    expect(prompt).toContain("I'm VANI AI, an AI assistant");
  });

  it("instructs to match user's language/script for creator answers", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "Tumhe kisne banaya?" });
    expect(prompt).toContain("Match the user's language/script");
    expect(prompt).toContain("Roman Hindi");
    expect(prompt).toContain("Devanagari");
    expect(prompt).toContain("English");
  });

  it("does NOT claim creator is monitoring or controlling", () => {
    const prompt = buildSystemInstruction("Alex", { userMessage: "hello" });
    expect(prompt).not.toContain("monitoring");
    expect(prompt).not.toContain("controlling");
    expect(prompt).not.toContain("receiving feedback");
    expect(prompt).not.toContain("personally interacting");
  });
});
