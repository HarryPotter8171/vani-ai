/**
 * BrowserPermissions — site trust + per-run approval.
 * Never bypassed by agents or tools.
 */

import type {
  BrowserPermissionRecord,
  BrowserStep,
  PendingApprovalPublic,
  PermissionChoice,
} from "./types.ts";
import { originFromUrl } from "./safety.ts";
import { browserLog } from "./logger.ts";
import { DEFAULT_APPROVAL_TIMEOUT_MS } from "./safety.ts";

export type PermissionDecision =
  | { allowed: true; reason: "always_allow" | "allow_once" | "auto_approve" }
  | {
      allowed: false;
      reason: "denied" | "always_deny" | "awaiting" | "expired" | "cancelled";
      message: string;
    };

type Store = {
  get(userId: string, origin: string): Promise<BrowserPermissionRecord | null>;
  set(record: BrowserPermissionRecord): Promise<BrowserPermissionRecord>;
  list(userId: string): Promise<BrowserPermissionRecord[]>;
  remove(userId: string, origin: string): Promise<boolean>;
};

class MemoryPermissionStore implements Store {
  private map = new Map<string, BrowserPermissionRecord>();

  private key(userId: string, origin: string) {
    return `${userId}::${origin}`;
  }

  async get(userId: string, origin: string) {
    return this.map.get(this.key(userId, origin)) || null;
  }

  async set(record: BrowserPermissionRecord) {
    const next = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    this.map.set(this.key(record.userId, record.origin), next);
    return next;
  }

  async list(userId: string) {
    return [...this.map.values()].filter((r) => r.userId === userId);
  }

  async remove(userId: string, origin: string) {
    return this.map.delete(this.key(userId, origin));
  }
}

type PendingInternal = {
  approvalId: string;
  runId: string;
  userId: string;
  origin: string;
  goal: string;
  steps: BrowserStep[];
  createdAt: string;
  expiresAt: string;
  resolve: (choice: PermissionChoice) => void;
  reject: (err: Error) => void;
};

function publicApproval(p: PendingInternal): PendingApprovalPublic {
  const dangerousSteps = p.steps
    .filter((s) => s.dangerous)
    .map((s) => ({
      id: s.id,
      label: s.label,
      dangerReason: s.dangerReason,
    }));

  return {
    approvalId: p.approvalId,
    runId: p.runId,
    origin: p.origin,
    goal: p.goal,
    steps: p.steps.map((s) => ({
      id: s.id,
      action: s.action,
      label: s.label,
      dangerous: s.dangerous,
      dangerReason: s.dangerReason,
    })),
    dangerousSteps,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
  };
}

export class BrowserPermissions {
  private store: Store;
  private memory = new MemoryPermissionStore();
  private pending = new Map<string, PendingInternal>();

  constructor(store?: Store) {
    this.store = store || this.memory;
  }

  setStore(store: Store): void {
    this.store = store;
  }

  async getPermission(
    userId: string,
    origin: string
  ): Promise<BrowserPermissionRecord> {
    const existing = await this.store.get(userId, origin);
    if (existing) return existing;
    return {
      userId,
      origin,
      alwaysAllow: false,
      alwaysDeny: false,
    };
  }

  async listPermissions(userId: string): Promise<BrowserPermissionRecord[]> {
    return this.store.list(userId);
  }

  async alwaysAllow(userId: string, origin: string) {
    const current = await this.getPermission(userId, origin);
    const next = await this.store.set({
      ...current,
      alwaysAllow: true,
      alwaysDeny: false,
    });
    browserLog.info("permissions", "Always allow site", { userId, origin });
    return next;
  }

  async alwaysDeny(userId: string, origin: string) {
    const current = await this.getPermission(userId, origin);
    const next = await this.store.set({
      ...current,
      alwaysAllow: false,
      alwaysDeny: true,
    });
    browserLog.info("permissions", "Always deny site", { userId, origin });
    return next;
  }

  async revoke(userId: string, origin: string) {
    await this.store.remove(userId, origin);
    browserLog.info("permissions", "Permission revoked", { userId, origin });
    return true;
  }

  /**
   * Site-level check. Dangerous steps still require explicit confirmation
   * even when the site is always-allowed.
   */
  async checkSitePermission(
    userId: string,
    origin: string,
    steps: BrowserStep[]
  ): Promise<PermissionDecision> {
    if (!userId || !origin) {
      return {
        allowed: false,
        reason: "denied",
        message: "Missing user or site origin for permission check",
      };
    }

    const perm = await this.getPermission(userId, origin);
    if (perm.alwaysDeny) {
      return {
        allowed: false,
        reason: "always_deny",
        message: `Browser automation is denied for ${origin}`,
      };
    }

    const hasDangerous = steps.some((s) => s.dangerous);
    if (perm.alwaysAllow && !hasDangerous) {
      return { allowed: true, reason: "always_allow" };
    }

    return {
      allowed: false,
      reason: "awaiting",
      message: hasDangerous
        ? "Dangerous actions require explicit confirmation"
        : "User approval required before browser automation",
    };
  }

  listPendingApprovals(userId?: string): PendingApprovalPublic[] {
    const all = [...this.pending.values()];
    const filtered = userId
      ? all.filter((p) => p.userId === userId)
      : all;
    return filtered.map(publicApproval);
  }

  getPendingApproval(approvalId: string): PendingApprovalPublic | null {
    const p = this.pending.get(approvalId);
    return p ? publicApproval(p) : null;
  }

  /**
   * Create a pending approval and wait for the user's choice.
   */
  waitForApproval(params: {
    approvalId: string;
    runId: string;
    userId: string;
    origin: string;
    goal: string;
    steps: BrowserStep[];
    timeoutMs?: number;
  }): Promise<PermissionChoice> {
    const timeoutMs = params.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

    return new Promise<PermissionChoice>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(params.approvalId);
        reject(new Error("Browser approval timed out"));
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();

      this.pending.set(params.approvalId, {
        approvalId: params.approvalId,
        runId: params.runId,
        userId: params.userId,
        origin: params.origin,
        goal: params.goal,
        steps: params.steps,
        createdAt,
        expiresAt,
        resolve: (choice) => {
          clearTimeout(timer);
          this.pending.delete(params.approvalId);
          resolve(choice);
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pending.delete(params.approvalId);
          reject(err);
        },
      });

      browserLog.info("permissions", "Awaiting user approval", {
        approvalId: params.approvalId,
        origin: params.origin,
        steps: params.steps.length,
      });
    });
  }

  async resolveApproval(
    approvalId: string,
    userId: string,
    choice: PermissionChoice
  ): Promise<PendingApprovalPublic> {
    const pending = this.pending.get(approvalId);
    if (!pending) {
      throw new Error("Approval request not found or already resolved");
    }
    if (pending.userId !== userId) {
      throw new Error("Not authorized to resolve this approval");
    }

    const pub = publicApproval(pending);

    if (choice === "always_allow") {
      await this.alwaysAllow(userId, pending.origin);
    } else if (choice === "deny") {
      // One-time deny — do not persist always_deny unless caller asks.
    }

    pending.resolve(choice);
    return pub;
  }

  cancelApproval(approvalId: string, reason = "cancelled"): void {
    const pending = this.pending.get(approvalId);
    if (!pending) return;
    pending.reject(new Error(reason));
  }

  resolveOriginFromPlan(goal: string, steps: BrowserStep[], url?: string): string {
    const fromUrl = originFromUrl(url);
    if (fromUrl) return fromUrl;

    for (const step of steps) {
      const o = originFromUrl(step.url);
      if (o) return o;
    }

    const match = String(goal || "").match(/https?:\/\/[^\s)]+/i);
    if (match) {
      const o = originFromUrl(match[0]);
      if (o) return o;
    }

    return "about:blank";
  }
}

export const browserPermissions = new BrowserPermissions();
