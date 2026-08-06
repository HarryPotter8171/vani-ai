/**
 * SandboxManager — policy + health for the Code Interpreter sandbox.
 *
 * Enforces:
 *  - Feature flag
 *  - Resource limits (CPU / memory / disk / timeout)
 *  - Network disabled (kernel + optional unshare)
 *  - Filesystem restricted to session workspace
 *  - Shell escape prevention (kernel)
 *  - Audit logging
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getLimits,
  getPythonBinary,
  isCodeInterpreterEnabled,
  SANDBOX_PACKAGES,
} from "./config.ts";
import { codeLog } from "./logger.ts";
import type { CodeInterpreterLimits } from "./types.ts";

const execFileAsync = promisify(execFile);

export type SandboxHealth = {
  enabled: boolean;
  python: string;
  pythonAvailable: boolean;
  pythonVersion: string | null;
  packages: Record<string, boolean>;
  limits: CodeInterpreterLimits;
  platform: string;
  networkIsolation: "unshare" | "userspace" | "unknown";
};

let cachedHealth: SandboxHealth | null = null;
let healthCheckedAt = 0;

export class SandboxManager {
  isEnabled(): boolean {
    return isCodeInterpreterEnabled();
  }

  assertEnabled(): void {
    if (!this.isEnabled()) {
      const err = new Error(
        "Code Interpreter is disabled. Set VANI_ENABLE_CODE_EXECUTION=true to enable."
      );
      (err as Error & { status?: number }).status = 503;
      throw err;
    }
  }

  getLimits(): CodeInterpreterLimits {
    return getLimits();
  }

  validateCode(code: unknown): string {
    if (typeof code !== "string") {
      const err = new Error("code must be a string");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    const trimmed = code;
    const limits = getLimits();
    if (!trimmed.trim()) {
      const err = new Error("code is empty");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    if (trimmed.length > limits.maxCodeChars) {
      const err = new Error(
        `code exceeds maximum length of ${limits.maxCodeChars} characters`
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    // Heuristic blocks for obvious escape attempts (defense in depth — kernel also blocks).
    const dangerous = [
      /\b__import__\s*\(\s*['"]subprocess['"]/,
      /\bos\.system\s*\(/,
      /\bpty\./,
      /\bsocket\./,
      /\bctypes\./,
    ];
    for (const re of dangerous) {
      if (re.test(trimmed)) {
        codeLog.warn("sandbox.blocked_pattern", "system", {
          pattern: String(re),
        });
        // Still allow — kernel enforces; we only flag. Soft warn only.
        break;
      }
    }
    return trimmed;
  }

  async checkHealth(force = false): Promise<SandboxHealth> {
    const now = Date.now();
    if (!force && cachedHealth && now - healthCheckedAt < 60_000) {
      return cachedHealth;
    }

    const python = getPythonBinary();
    let pythonAvailable = false;
    let pythonVersion: string | null = null;
    const packages: Record<string, boolean> = {};

    try {
      const { stdout } = await execFileAsync(
        python,
        ["-c", "import sys; print(sys.version.split()[0])"],
        { timeout: 5000 }
      );
      pythonAvailable = true;
      pythonVersion = stdout.trim();
    } catch {
      pythonAvailable = false;
    }

    if (pythonAvailable) {
      for (const pkg of SANDBOX_PACKAGES) {
        const importName = pkg === "Pillow" ? "PIL" : pkg;
        try {
          await execFileAsync(
            python,
            ["-c", `import ${importName}`],
            { timeout: 5000 }
          );
          packages[pkg] = true;
        } catch {
          packages[pkg] = false;
        }
      }
    }

    const networkIsolation =
      process.platform === "linux" &&
      process.env.VANI_CI_DISABLE_UNSHARE !== "true"
        ? "unshare"
        : "userspace";

    cachedHealth = {
      enabled: this.isEnabled(),
      python,
      pythonAvailable,
      pythonVersion,
      packages,
      limits: getLimits(),
      platform: process.platform,
      networkIsolation,
    };
    healthCheckedAt = now;
    return cachedHealth;
  }
}

export const sandboxManager = new SandboxManager();
