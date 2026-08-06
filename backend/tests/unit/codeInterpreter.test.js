import { describe, expect, it, beforeAll } from "vitest";
import {
  sandboxManager,
  getLimits,
  isCodeInterpreterEnabled,
} from "../../services/codeInterpreter/index.ts";

describe("Code Interpreter sandbox", () => {
  beforeAll(() => {
    // Ensure deterministic defaults for unit assertions.
  });

  it("exposes resource limits", () => {
    const limits = getLimits();
    expect(limits.timeoutMs).toBeGreaterThan(0);
    expect(limits.memoryMb).toBeGreaterThan(0);
    expect(limits.diskMb).toBeGreaterThan(0);
    expect(limits.cpuSeconds).toBeGreaterThan(0);
  });

  it("validates code input", () => {
    expect(() => sandboxManager.validateCode("")).toThrow(/empty/i);
    expect(() => sandboxManager.validateCode(null)).toThrow(/string/i);
    expect(sandboxManager.validateCode("print(1)")).toBe("print(1)");
  });

  it("reports feature flag state", () => {
    expect(typeof isCodeInterpreterEnabled()).toBe("boolean");
    expect(sandboxManager.isEnabled()).toBe(isCodeInterpreterEnabled());
  });

  it("health check returns structure", async () => {
    const health = await sandboxManager.checkHealth(true);
    expect(health).toHaveProperty("enabled");
    expect(health).toHaveProperty("python");
    expect(health).toHaveProperty("packages");
    expect(health).toHaveProperty("limits");
    expect(health).toHaveProperty("networkIsolation");
  });
});
