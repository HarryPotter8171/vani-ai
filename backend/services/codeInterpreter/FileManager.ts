/**
 * FileManager — per-session workspace, uploads, generated files, disk quota.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MIME_BY_EXT,
  getLimits,
  getWorkspaceRoot,
} from "./config.ts";
import type { GeneratedFile, UploadFileInput } from "./types.ts";

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function sanitizeName(name: string): string {
  const base = path.basename(String(name || "file")).replace(/[\x00-\x1f\x7f]/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ()[\]]+/g, "_").trim();
  return cleaned.slice(0, 180) || "file";
}

function extOf(name: string): string {
  return path.extname(name).toLowerCase();
}

function kindFor(name: string, mime?: string): GeneratedFile["kind"] {
  const ext = extOf(name);
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].includes(ext)) {
    return name.includes("plot") || mime?.startsWith("image/") ? "plot" : "image";
  }
  if ([".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"].includes(ext)) return "data";
  if ([".pdf", ".txt", ".md"].includes(ext)) return "document";
  if (ext === ".zip") return "archive";
  return "other";
}

async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSizeBytes(full);
    } else if (entry.isFile()) {
      try {
        const st = await fsp.stat(full);
        total += st.size;
      } catch {
        // skip
      }
    }
  }
  return total;
}

export class FileManager {
  readonly root: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly workspace: string;
  readonly inputsDir: string;
  readonly outputsDir: string;
  readonly plotsDir: string;
  private files = new Map<string, GeneratedFile>();

  constructor(userId: string, sessionId: string, root = getWorkspaceRoot()) {
    this.root = root;
    this.userId = userId;
    this.sessionId = sessionId;
    this.workspace = path.join(root, "sessions", userId, sessionId);
    this.inputsDir = path.join(this.workspace, "inputs");
    this.outputsDir = path.join(this.workspace, "outputs");
    this.plotsDir = path.join(this.workspace, "plots");
  }

  async init(): Promise<void> {
    await fsp.mkdir(this.inputsDir, { recursive: true });
    await fsp.mkdir(this.outputsDir, { recursive: true });
    await fsp.mkdir(this.plotsDir, { recursive: true });
  }

  async destroy(): Promise<void> {
    this.files.clear();
    try {
      await fsp.rm(this.workspace, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }

  async usageBytes(): Promise<number> {
    return dirSizeBytes(this.workspace);
  }

  async assertQuota(extraBytes = 0): Promise<void> {
    const limits = getLimits();
    const used = await this.usageBytes();
    const max = limits.diskMb * 1024 * 1024;
    if (used + extraBytes > max) {
      const err = new Error(
        `Disk quota exceeded (${Math.ceil((used + extraBytes) / (1024 * 1024))}MB / ${limits.diskMb}MB)`
      );
      (err as Error & { status?: number }).status = 413;
      throw err;
    }
  }

  listFiles(): GeneratedFile[] {
    return [...this.files.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }

  getFile(fileId: string): GeneratedFile | null {
    return this.files.get(fileId) || null;
  }

  resolveSafePath(relativePath: string): string | null {
    const rel = String(relativePath || "").replace(/^\/+/, "");
    if (!rel || rel.includes("\0")) return null;
    const abs = path.resolve(this.workspace, rel);
    const root = path.resolve(this.workspace);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
  }

  async upload(input: UploadFileInput): Promise<GeneratedFile> {
    const name = sanitizeName(input.originalName);
    const ext = extOf(name);
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      const err = new Error(`Unsupported upload type: ${ext || "(none)"}`);
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    const buf = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from([]);
    if (!buf.length) {
      const err = new Error("Empty file");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    await this.assertQuota(buf.length);

    const unique = `${Date.now().toString(36)}_${name}`;
    const abs = path.join(this.inputsDir, unique);
    await fsp.writeFile(abs, buf);

    const file: GeneratedFile = {
      id: id("cif"),
      name,
      path: path.posix.join("inputs", unique),
      mimeType: input.mimeType || MIME_BY_EXT[ext] || "application/octet-stream",
      size: buf.length,
      kind: kindFor(name, input.mimeType),
      createdAt: new Date().toISOString(),
    };
    this.files.set(file.id, file);
    return file;
  }

  /**
   * Scan outputs/ and plots/ for new files produced by the kernel.
   */
  async syncGenerated(knownPaths: Set<string> = new Set()): Promise<{
    files: GeneratedFile[];
    plots: GeneratedFile[];
  }> {
    const limits = getLimits();
    const discovered: GeneratedFile[] = [];
    const plots: GeneratedFile[] = [];

    for (const dir of [this.outputsDir, this.plotsDir]) {
      let entries: string[] = [];
      try {
        entries = await fsp.readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry);
        let st: fs.Stats;
        try {
          st = await fsp.stat(abs);
        } catch {
          continue;
        }
        if (!st.isFile()) continue;
        const rel = path.relative(this.workspace, abs).split(path.sep).join("/");
        if (knownPaths.has(rel)) continue;

        const existing = [...this.files.values()].find((f) => f.path === rel);
        if (existing) {
          knownPaths.add(rel);
          continue;
        }

        if (this.files.size >= limits.maxGeneratedFiles) break;

        const file: GeneratedFile = {
          id: id("cif"),
          name: entry,
          path: rel,
          mimeType: MIME_BY_EXT[extOf(entry)] || "application/octet-stream",
          size: st.size,
          kind: kindFor(entry),
          createdAt: new Date().toISOString(),
        };
        this.files.set(file.id, file);
        discovered.push(file);
        if (file.kind === "plot" || file.kind === "image") plots.push(file);
        knownPaths.add(rel);
      }
    }

    return { files: discovered, plots };
  }

  async readFile(fileId: string): Promise<{ file: GeneratedFile; buffer: Buffer } | null> {
    const file = this.files.get(fileId);
    if (!file) return null;
    const abs = this.resolveSafePath(file.path);
    if (!abs) return null;
    try {
      const buffer = await fsp.readFile(abs);
      return { file, buffer };
    } catch {
      return null;
    }
  }

  registerKnown(file: GeneratedFile): void {
    this.files.set(file.id, file);
  }
}
