/**
 * Code Interpreter configuration — env-overridable resource limits.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeInterpreterLimits } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function isCodeInterpreterEnabled(): boolean {
  return process.env.VANI_ENABLE_CODE_EXECUTION === "true";
}

export function getPythonBinary(): string {
  return (
    process.env.VANI_CODE_INTERPRETER_PYTHON ||
    process.env.PYTHON_PATH ||
    "python3"
  );
}

export function getWorkspaceRoot(): string {
  return (
    process.env.VANI_CODE_INTERPRETER_DIR ||
    path.resolve(__dirname, "../../.code-interpreter")
  );
}

export function getKernelScriptPath(): string {
  return path.join(__dirname, "kernel", "bootstrap.py");
}

export function getLimits(): CodeInterpreterLimits {
  return {
    cpuSeconds: intEnv("VANI_CI_CPU_SECONDS", 30),
    memoryMb: intEnv("VANI_CI_MEMORY_MB", 512),
    diskMb: intEnv("VANI_CI_DISK_MB", 256),
    timeoutMs: intEnv("VANI_CI_TIMEOUT_MS", 30_000),
    maxSessionsPerUser: intEnv("VANI_CI_MAX_SESSIONS_PER_USER", 3),
    maxCodeChars: intEnv("VANI_CI_MAX_CODE_CHARS", 100_000),
    maxOutputChars: intEnv("VANI_CI_MAX_OUTPUT_CHARS", 200_000),
    maxPlots: intEnv("VANI_CI_MAX_PLOTS", 20),
    maxGeneratedFiles: intEnv("VANI_CI_MAX_FILES", 50),
    sessionTtlMs: intEnv("VANI_CI_SESSION_TTL_MS", 60 * 60_000),
    idleTtlMs: intEnv("VANI_CI_IDLE_TTL_MS", 15 * 60_000),
  };
}

/** Packages expected inside the sandbox (informational / health). */
export const SANDBOX_PACKAGES = [
  "numpy",
  "pandas",
  "matplotlib",
  "openpyxl",
  "reportlab",
  "Pillow",
] as const;

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".csv",
  ".tsv",
  ".txt",
  ".md",
  ".json",
  ".xlsx",
  ".xls",
  ".pdf",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".py",
  ".parquet",
]);

export const MIME_BY_EXT: Record<string, string> = {
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".py": "text/x-python",
  ".parquet": "application/octet-stream",
};
