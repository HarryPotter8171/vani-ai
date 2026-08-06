/**
 * Unit tests — forgetMemory content matching, cleanup expiry,
 * MemoryManager enable gate, createMemory privacy gate.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Memory from "../../../models/Memory.js";
import User from "../../../models/User.js";
import { decryptContent } from "../../../services/memory/encryption.js";
import {
  createMemory,
  forgetMemory,
  isMemoryEnabled,
} from "../../../services/memory/memoryService.js";
import { cleanupStaleMemories } from "../../../services/memory/cleanup.js";
import { MemoryManager } from "../../../agents/MemoryManager.js";
import { cacheInvalidateUser } from "../../../services/memory/cache.js";

describe("forgetMemory content match", () => {
  let userId;

  beforeEach(async () => {
    const user = await User.create({
      email: `mem-forget-${Date.now()}@test.local`,
      name: "Forget Tester",
      passwordHash: "x",
    });
    userId = user._id;
  });

  afterEach(async () => {
    await Memory.deleteMany({ user: userId });
    await User.deleteOne({ _id: userId });
    cacheInvalidateUser(userId);
    vi.restoreAllMocks();
  });

  it("only deletes memories whose decrypted content matches the snippet", async () => {
    const keep = await createMemory(userId, {
      content: "User lives in Bengaluru",
      category: "profile",
      source: "manual",
    });
    const drop = await createMemory(userId, {
      content: "User prefers dark mode in the editor",
      category: "preference",
      source: "manual",
    });

    // Simulate Mongo regex over-matching both docs (the old bug path), while
    // decrypted text only matches the target snippet for one of them.
    const keepDoc = await Memory.findById(keep.memory.id);
    const dropDoc = await Memory.findById(drop.memory.id);
    const chain = {
      limit: vi.fn(async () => [keepDoc, dropDoc]),
    };
    vi.spyOn(Memory, "find").mockReturnValueOnce(chain);

    const result = await forgetMemory(userId, {
      content: "User prefers dark mode in the editor",
    });
    expect(result.deleted).toBe(true);
    expect(result.count).toBe(1);

    const remaining = await Memory.find({ user: userId });
    expect(remaining).toHaveLength(1);
    expect(String(remaining[0]._id)).toBe(String(keep.memory.id));
  });

  it("matches encrypted memories via decrypt, not ciphertext", async () => {
    process.env.VANI_MEMORY_ENCRYPTION_KEY = "a".repeat(64);
    try {
      const created = await createMemory(userId, {
        content: "Favorite cuisine is sushi",
        category: "preference",
        source: "manual",
      });
      // createMemory already encrypts when key is set — force re-pack to be sure.
      const doc = await Memory.findById(created.memory.id);
      expect(doc.encrypted).toBe(true);

      // Plaintext regex will miss ciphertext — force candidate via spy.
      const encryptedDoc = await Memory.findById(created.memory.id);
      const chain = {
        limit: vi.fn(async () => [encryptedDoc]),
      };
      vi.spyOn(Memory, "find").mockReturnValueOnce(chain);

      const result = await forgetMemory(userId, {
        content: "Favorite cuisine is sushi",
      });
      expect(result.deleted).toBe(true);
      expect(await Memory.countDocuments({ user: userId })).toBe(0);
      expect(decryptContent(doc.content, true)).toMatch(/sushi/);
    } finally {
      delete process.env.VANI_MEMORY_ENCRYPTION_KEY;
    }
  });
});

describe("cleanupStaleMemories temporary expiry", () => {
  let userId;

  beforeEach(async () => {
    const user = await User.create({
      email: `mem-clean-${Date.now()}@test.local`,
      name: "Clean Tester",
      passwordHash: "x",
    });
    userId = user._id;
  });

  afterEach(async () => {
    await Memory.deleteMany({ user: userId });
    await User.deleteOne({ _id: userId });
  });

  it("deletes temporary memories whose expiresAt is in the past even if recently updated", async () => {
    const past = new Date(Date.now() - 60_000);
    await Memory.create({
      user: userId,
      category: "task",
      content: "Temp note that should expire",
      scope: "temporary",
      expiresAt: past,
      source: "manual",
      importance: 0.5,
    });

    const result = await cleanupStaleMemories();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const left = await Memory.countDocuments({ user: userId });
    expect(left).toBe(0);
  });
});

describe("MemoryManager enable gate", () => {
  it("awaits isMemoryEnabled and skips durable load when disabled", async () => {
    const user = await User.create({
      email: `mem-mgr-${Date.now()}@test.local`,
      name: "Mgr Tester",
      passwordHash: "x",
      memoryEnabled: false,
    });

    const mgr = new MemoryManager({ userId: user._id });
    const enabled = await isMemoryEnabled(user._id);
    expect(enabled).toBe(false);

    const ctx = await mgr.loadDurableContext("hello");
    expect(ctx.extras).toBe("");
    expect(ctx.memories).toEqual([]);

    await User.deleteOne({ _id: user._id });
  });
});

describe("createMemory respects memoryEnabled", () => {
  it("rejects creates when memory is disabled", async () => {
    const user = await User.create({
      email: `mem-off-${Date.now()}@test.local`,
      name: "Off Tester",
      passwordHash: "x",
      memoryEnabled: false,
    });
    cacheInvalidateUser(user._id);

    await expect(
      createMemory(user._id, { content: "Should not save", source: "manual" })
    ).rejects.toMatchObject({ code: "MEMORY_DISABLED" });

    await User.deleteOne({ _id: user._id });
  });
});
