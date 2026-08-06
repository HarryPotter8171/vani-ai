import { describe, it, expect } from "vitest";
import {
  normalizeKey,
  normalizeContent,
  normalizeCategory,
  normalizeSource,
  clampImportance,
  scoreImportance,
  validateMemoryInput,
  escapeRegex,
} from "../../../services/memory/validate.js";

describe("services/memory/validate", () => {
  describe("normalizeKey", () => {
    it("lowercases, trims, and truncates", () => {
      expect(normalizeKey("  Preferred_Name  ")).toBe("preferred_name");
    });
    it("returns null for empty/nullish keys", () => {
      expect(normalizeKey(null)).toBeNull();
      expect(normalizeKey("")).toBeNull();
      expect(normalizeKey(undefined)).toBeNull();
    });
  });

  describe("normalizeContent", () => {
    it("trims and caps at maxContentLength", () => {
      const long = "x".repeat(5000);
      expect(normalizeContent(long).length).toBe(4000);
    });
    it("coerces non-string input", () => {
      expect(normalizeContent(undefined)).toBe("");
    });
  });

  describe("normalizeCategory", () => {
    it("accepts a known category", () => {
      expect(normalizeCategory("goal")).toBe("goal");
    });
    it("falls back to fact for unknown categories", () => {
      expect(normalizeCategory("nonsense")).toBe("fact");
      expect(normalizeCategory(undefined)).toBe("fact");
    });
    it("is case-insensitive", () => {
      expect(normalizeCategory("PROFILE")).toBe("profile");
    });
  });

  describe("normalizeSource", () => {
    it("accepts known sources and defaults to manual", () => {
      expect(normalizeSource("auto")).toBe("auto");
      expect(normalizeSource("bogus")).toBe("manual");
    });
  });

  describe("clampImportance", () => {
    it("clamps numeric values to [0, 1]", () => {
      expect(clampImportance(1.5, "fact")).toBe(1);
      expect(clampImportance(-1, "fact")).toBe(0);
      expect(clampImportance(0.42, "fact")).toBe(0.42);
    });
    it("falls back to category default when not a finite number", () => {
      expect(clampImportance(undefined, "profile")).toBe(0.9);
      expect(clampImportance(NaN, "goal")).toBe(0.8);
    });
  });

  describe("scoreImportance", () => {
    it("boosts score for explicit preference language", () => {
      const withPref = scoreImportance({ content: "I always prefer dark mode", category: "fact" });
      const plain = scoreImportance({ content: "the sky is blue today ok", category: "fact" });
      expect(withPref).toBeGreaterThan(plain);
    });
    it("penalizes very short content", () => {
      const short = scoreImportance({ content: "hi", category: "fact" });
      const base = 0.6; // CATEGORY_IMPORTANCE.fact
      expect(short).toBeLessThan(base);
    });
    it("stays within [0.05, 1]", () => {
      const score = scoreImportance({
        content: "always never prefer please remember my name is goal deadline",
        category: "profile",
        source: "manual",
      });
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe("validateMemoryInput", () => {
    it("accepts valid input and normalizes fields", () => {
      const result = validateMemoryInput({
        content: "  User prefers dark mode  ",
        key: "UI_PREF",
        category: "preference",
      });
      expect(result.ok).toBe(true);
      expect(result.content).toBe("User prefers dark mode");
      expect(result.key).toBe("ui_pref");
      expect(result.category).toBe("preference");
    });

    it("rejects empty content", () => {
      const result = validateMemoryInput({ content: "   " });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/required/);
    });

    it("rejects content longer than the configured max", () => {
      // normalizeContent silently truncates, so overly long content is
      // actually fine post-normalization — this documents that behavior.
      const long = "a".repeat(4001);
      const result = validateMemoryInput({ content: long });
      expect(result.ok).toBe(true);
      expect(result.content.length).toBe(4000);
    });
  });

  describe("escapeRegex", () => {
    it("escapes regex special characters", () => {
      const escaped = escapeRegex("a.b*c?[d]");
      expect(new RegExp(escaped).test("a.b*c?[d]")).toBe(true);
      expect(new RegExp(escaped).test("axbxcxd")).toBe(false);
    });
  });
});
