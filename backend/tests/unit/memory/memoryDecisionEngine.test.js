import { describe, it, expect } from "vitest";
import {
  classifyCandidateHeuristic,
  detectExplicitRememberRequest,
  shouldPersistDecision,
} from "../../../services/memory/memoryDecisionEngine.js";

describe("services/memory/memoryDecisionEngine", () => {
  describe("classifyCandidateHeuristic", () => {
    it("classifies stable identity and preferences as LONG_TERM", () => {
      const cases = [
        "My name is Alex Rivera.",
        "I work at Acme Corp.",
        "I own a small design studio.",
        "I like Apple products.",
        "My favorite color is blue.",
        "I am building VANI AI.",
        "I speak Hindi and English.",
        "I prefer short answers.",
      ];

      for (const content of cases) {
        const result = classifyCandidateHeuristic(content, "profile");
        expect(result?.decision, content).toBe("LONG_TERM");
        expect(result?.reason, content).toBeTruthy();
        expect(shouldPersistDecision(result)).toBe(true);
      }
    });

    it("classifies one-time events and incidents as IGNORE", () => {
      const cases = [
        "When I was 10 years old a dog bit my leg.",
        "I have fever today.",
        "I was bitten by a dog yesterday.",
        "I fell yesterday and hurt my knee.",
        "I am angry today.",
        "My internet is slow right now.",
        "I bought shoes today.",
        "I went to Delhi last week.",
        "My laptop battery died this morning.",
      ];

      for (const content of cases) {
        const result = classifyCandidateHeuristic(content, "fact");
        expect(result?.decision, content).toBe("IGNORE");
        expect(result?.reason, content).toBeTruthy();
        expect(shouldPersistDecision(result)).toBe(false);
      }
    });

    it("allows explicit remember requests to override IGNORE defaults", () => {
      const content = "When I was 10 years old a dog bit my leg.";
      const contextText = "Please remember this. When I was 10 years old a dog bit my leg.";

      expect(detectExplicitRememberRequest(contextText)).toBe(true);

      const result = classifyCandidateHeuristic(content, "fact", { contextText });
      expect(result?.decision).toBe("LONG_TERM");
      expect(result?.reason).toMatch(/explicit/i);
      expect(shouldPersistDecision(result)).toBe(true);
    });

    it("does not persist TEMPORARY classifications", () => {
      const result = classifyCandidateHeuristic(
        "I am debugging this current bug in the auth flow right now.",
        "task"
      );
      expect(result?.decision).toBe("TEMPORARY");
      expect(shouldPersistDecision(result)).toBe(false);
    });
  });
});
