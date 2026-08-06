import { describe, it, expect, beforeEach } from "vitest";
import { BrowserPermissions } from "../../../browser/BrowserPermissions.ts";

describe("browser/BrowserPermissions", () => {
  let permissions;

  beforeEach(() => {
    permissions = new BrowserPermissions();
  });

  it("returns an unset default permission for a new origin", async () => {
    const perm = await permissions.getPermission("user-1", "https://example.com");
    expect(perm).toMatchObject({ alwaysAllow: false, alwaysDeny: false });
  });

  it("requires explicit approval (awaiting) for a first-time origin", async () => {
    const decision = await permissions.checkSitePermission("user-1", "https://example.com", []);
    expect(decision).toEqual({
      allowed: false,
      reason: "awaiting",
      message: expect.any(String),
    });
  });

  it("alwaysAllow lets non-dangerous automation proceed automatically", async () => {
    await permissions.alwaysAllow("user-1", "https://trusted.com");
    const decision = await permissions.checkSitePermission("user-1", "https://trusted.com", [
      { id: "s1", action: "click", label: "Click button", dangerous: false },
    ]);
    expect(decision).toEqual({ allowed: true, reason: "always_allow" });
  });

  it("dangerous steps still require confirmation even on an always-allowed site", async () => {
    await permissions.alwaysAllow("user-1", "https://trusted.com");
    const decision = await permissions.checkSitePermission("user-1", "https://trusted.com", [
      { id: "s1", action: "submit", label: "Submit payment", dangerous: true, dangerReason: "Payment" },
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("awaiting");
    expect(decision.message).toMatch(/[Dd]angerous/);
  });

  it("alwaysDeny blocks automation outright", async () => {
    await permissions.alwaysDeny("user-1", "https://blocked.com");
    const decision = await permissions.checkSitePermission("user-1", "https://blocked.com", []);
    expect(decision).toEqual({
      allowed: false,
      reason: "always_deny",
      message: expect.stringContaining("blocked.com"),
    });
  });

  it("alwaysAllow after alwaysDeny overrides the deny (last write wins)", async () => {
    await permissions.alwaysDeny("user-1", "https://site.com");
    await permissions.alwaysAllow("user-1", "https://site.com");
    const perm = await permissions.getPermission("user-1", "https://site.com");
    expect(perm.alwaysAllow).toBe(true);
    expect(perm.alwaysDeny).toBe(false);
  });

  it("revoke clears a stored permission back to the unset default", async () => {
    await permissions.alwaysAllow("user-1", "https://site.com");
    await permissions.revoke("user-1", "https://site.com");
    const perm = await permissions.getPermission("user-1", "https://site.com");
    expect(perm.alwaysAllow).toBe(false);
  });

  it("rejects checks with missing user or origin", async () => {
    const decision = await permissions.checkSitePermission("", "https://x.com", []);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("denied");
  });

  it("isolates permissions per user for the same origin", async () => {
    await permissions.alwaysAllow("user-1", "https://shared.com");
    const decision = await permissions.checkSitePermission("user-2", "https://shared.com", []);
    expect(decision.allowed).toBe(false);
  });

  describe("waitForApproval / resolveApproval / cancelApproval", () => {
    it("resolves with the user's choice and persists always_allow", async () => {
      const pendingPromise = permissions.waitForApproval({
        approvalId: "appr-1",
        runId: "run-1",
        userId: "user-1",
        origin: "https://example.com",
        goal: "Book a flight",
        steps: [{ id: "s1", action: "click", label: "Click", dangerous: false }],
        timeoutMs: 5000,
      });

      const pending = permissions.getPendingApproval("appr-1");
      expect(pending).toMatchObject({ approvalId: "appr-1", origin: "https://example.com" });

      const resolved = await permissions.resolveApproval("appr-1", "user-1", "always_allow");
      expect(resolved.approvalId).toBe("appr-1");
      await expect(pendingPromise).resolves.toBe("always_allow");

      const perm = await permissions.getPermission("user-1", "https://example.com");
      expect(perm.alwaysAllow).toBe(true);
    });

    it("rejects resolution attempts from a different user", async () => {
      const pendingPromise = permissions.waitForApproval({
        approvalId: "appr-2",
        runId: "run-2",
        userId: "user-1",
        origin: "https://example.com",
        goal: "Do a thing",
        steps: [],
        timeoutMs: 5000,
      });
      pendingPromise.catch(() => {}); // avoid unhandled rejection when we cancel below

      await expect(
        permissions.resolveApproval("appr-2", "user-intruder", "allow_once")
      ).rejects.toThrow(/[Nn]ot authorized/);

      permissions.cancelApproval("appr-2", "test cleanup");
      await expect(pendingPromise).rejects.toThrow("test cleanup");
    });

    it("throws when resolving an approval that does not exist", async () => {
      await expect(
        permissions.resolveApproval("nope", "user-1", "deny")
      ).rejects.toThrow(/not found/);
    });

    it("listPendingApprovals filters by user when given", async () => {
      const p1 = permissions.waitForApproval({
        approvalId: "a1",
        runId: "r1",
        userId: "user-1",
        origin: "https://a.com",
        goal: "g",
        steps: [],
        timeoutMs: 5000,
      });
      const p2 = permissions.waitForApproval({
        approvalId: "a2",
        runId: "r2",
        userId: "user-2",
        origin: "https://b.com",
        goal: "g",
        steps: [],
        timeoutMs: 5000,
      });
      p1.catch(() => {});
      p2.catch(() => {});

      expect(permissions.listPendingApprovals("user-1")).toHaveLength(1);
      expect(permissions.listPendingApprovals()).toHaveLength(2);

      permissions.cancelApproval("a1");
      permissions.cancelApproval("a2");
    });
  });

  describe("resolveOriginFromPlan", () => {
    it("prefers an explicit url over steps or goal", () => {
      const origin = permissions.resolveOriginFromPlan(
        "book a flight on https://goal.com",
        [{ url: "https://step.com" }],
        "https://explicit.com/path"
      );
      expect(origin).toBe("https://explicit.com");
    });

    it("falls back to a step URL when no explicit url is given", () => {
      const origin = permissions.resolveOriginFromPlan("do something", [
        { url: "https://step.com/foo" },
      ]);
      expect(origin).toBe("https://step.com");
    });

    it("falls back to a URL embedded in the goal text", () => {
      const origin = permissions.resolveOriginFromPlan(
        "please check https://goal-origin.com/page for prices",
        []
      );
      expect(origin).toBe("https://goal-origin.com");
    });

    it("defaults to about:blank when nothing resolves", () => {
      const origin = permissions.resolveOriginFromPlan("do something vague", []);
      expect(origin).toBe("about:blank");
    });
  });
});
