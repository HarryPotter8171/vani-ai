import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
  },
}));

import dns from "node:dns/promises";
import {
  validatePublicUrl,
  isPrivateIpv4,
  isBlockedIpAddress,
  fetchWithSafeRedirects,
  assertResolvedPublicHost,
} from "../../../services/research/urlSafety.js";

describe("urlSafety SSRF guards", () => {
  beforeEach(() => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("allows public https URLs", () => {
    const r = validatePublicUrl("https://example.com/path");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.hostname).toBe("example.com");
  });

  it("blocks localhost / loopback / metadata hosts", () => {
    expect(validatePublicUrl("http://localhost/x").ok).toBe(false);
    expect(validatePublicUrl("http://127.0.0.1/").ok).toBe(false);
    expect(validatePublicUrl("http://0.0.0.0/").ok).toBe(false);
    expect(validatePublicUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(
      false
    );
    expect(validatePublicUrl("http://metadata.google.internal/").ok).toBe(false);
    expect(validatePublicUrl("http://instance-data/").ok).toBe(false);
    expect(validatePublicUrl("http://kubernetes.default/").ok).toBe(false);
  });

  it("blocks private IPv4 ranges", () => {
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("172.16.5.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(validatePublicUrl("http://10.1.2.3/").ok).toBe(false);
    expect(validatePublicUrl("http://192.168.0.5/admin").ok).toBe(false);
  });

  it("blocks internal hostname suffixes", () => {
    expect(validatePublicUrl("https://db.internal/").ok).toBe(false);
    expect(validatePublicUrl("https://app.corp/").ok).toBe(false);
    expect(validatePublicUrl("https://nas.local/").ok).toBe(false);
  });

  it("blocks IPv6 loopback / ULA / link-local literals", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(validatePublicUrl("http://[::1]/").ok).toBe(false);
  });

  it("allows websocket schemes when opted in", () => {
    expect(validatePublicUrl("wss://mcp.example.com/ws").ok).toBe(false);
    const ok = validatePublicUrl("wss://mcp.example.com/ws", {
      allowWebSocket: true,
    });
    expect(ok.ok).toBe(true);
    expect(
      validatePublicUrl("ws://127.0.0.1/ws", { allowWebSocket: true }).ok
    ).toBe(false);
  });

  it("rejects DNS answers that resolve to private IPs (rebinding)", async () => {
    dns.lookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const r = await assertResolvedPublicHost("evil.example");
    expect(r.ok).toBe(false);
  });

  it("rejects redirect hops to private hosts", async () => {
    const responses = [
      new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data/" },
      }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const next = responses.shift();
        if (!next) throw new Error("unexpected extra fetch");
        return next;
      })
    );

    await expect(
      fetchWithSafeRedirects("https://example.com/open-redirect", {
        maxRedirects: 3,
      })
    ).rejects.toThrow(/private|blocked|local|metadata|not allowed/i);
  });

  it("follows safe redirects and returns the final response", async () => {
    const responses = [
      new Response(null, {
        status: 301,
        headers: { Location: "https://cdn.example.com/page" },
      }),
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const next = responses.shift();
        if (!next) throw new Error("unexpected extra fetch");
        return next;
      })
    );

    const res = await fetchWithSafeRedirects("https://example.com/start", {
      maxRedirects: 3,
    });
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
