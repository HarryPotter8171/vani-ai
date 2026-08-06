import { describe, it, expect } from "vitest";
import {
  assessDanger,
  markDangerousSteps,
  originFromUrl,
  assertHttpUrl,
} from "../../../browser/safety.ts";

describe("browser/safety", () => {
  describe("originFromUrl", () => {
    it("returns the origin for http(s) URLs", () => {
      expect(originFromUrl("https://example.com/a/b?c=1")).toBe("https://example.com");
      expect(originFromUrl("http://sub.example.com:8080/x")).toBe("http://sub.example.com:8080");
    });

    it("rejects non-http(s) protocols (e.g. javascript:, file:)", () => {
      expect(originFromUrl("javascript:alert(1)")).toBeNull();
      expect(originFromUrl("file:///etc/passwd")).toBeNull();
    });

    it("returns null for invalid/empty input", () => {
      expect(originFromUrl(undefined)).toBeNull();
      expect(originFromUrl(null)).toBeNull();
      expect(originFromUrl("not a url")).toBeNull();
    });
  });

  describe("assertHttpUrl", () => {
    it("allows public http and https", () => {
      expect(assertHttpUrl("https://example.com/x").origin).toBe("https://example.com");
      expect(assertHttpUrl("http://example.org/path").hostname).toBe("example.org");
    });

    it("blocks file:, javascript:, and data: URLs", () => {
      expect(() => assertHttpUrl("file:///etc/passwd")).toThrow(/Blocked non-http/);
      expect(() => assertHttpUrl("javascript:alert(1)")).toThrow(/Blocked non-http/);
      expect(() => assertHttpUrl("data:text/html,hi")).toThrow(/Blocked non-http/);
    });

    it("blocks private, loopback, and cloud-metadata hosts (SSRF)", () => {
      expect(() => assertHttpUrl("http://localhost:3000")).toThrow(/Blocked non-public/);
      expect(() => assertHttpUrl("http://127.0.0.1/")).toThrow(/Blocked non-public/);
      expect(() => assertHttpUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
        /Blocked non-public/
      );
      expect(() => assertHttpUrl("http://10.0.0.5/admin")).toThrow(/Blocked non-public/);
      expect(() => assertHttpUrl("http://192.168.1.1/")).toThrow(/Blocked non-public/);
      expect(() => assertHttpUrl("http://[::1]/")).toThrow(/Blocked non-public/);
      expect(() => assertHttpUrl("http://metadata.google.internal/")).toThrow(
        /Blocked non-public/
      );
    });

    it("rejects empty or invalid URLs", () => {
      expect(() => assertHttpUrl("")).toThrow(/required/i);
      expect(() => assertHttpUrl("not a url")).toThrow(/Invalid URL/);
    });
  });

  describe("assessDanger", () => {
    it("flags purchase-intent labels as dangerous", () => {
      const result = assessDanger({ action: "click", label: "Place order" });
      expect(result.dangerous).toBe(true);
      expect(result.reason).toMatch(/purchase/i);
    });

    it("flags payment-intent values as dangerous", () => {
      const result = assessDanger({ action: "click", value: "Submit Payment" });
      expect(result.dangerous).toBe(true);
    });

    it("flags account-destructive actions as dangerous", () => {
      const result = assessDanger({ action: "click", label: "Delete Account" });
      expect(result.dangerous).toBe(true);
      expect(result.reason).toMatch(/delete/i);
    });

    it("flags high-risk selectors even without a matching label", () => {
      const result = assessDanger({ action: "click", selector: "#checkout-button" });
      expect(result.dangerous).toBe(true);
    });

    it("flags checkout/payment URLs", () => {
      const result = assessDanger({ action: "goto", url: "https://shop.example.com/cart/checkout" });
      expect(result.dangerous).toBe(true);
    });

    it("does not flag ordinary navigation/click actions", () => {
      const result = assessDanger({ action: "click", label: "Read more", selector: ".article-link" });
      expect(result.dangerous).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("markDangerousSteps", () => {
    it("annotates only the dangerous steps, leaving others untouched", () => {
      const steps = [
        { id: "1", action: "click", label: "Read article" },
        { id: "2", action: "click", label: "Buy now" },
      ];
      const marked = markDangerousSteps(steps);
      expect(marked[0].dangerous).toBeUndefined();
      expect(marked[1].dangerous).toBe(true);
      expect(marked[1].dangerReason).toBeDefined();
    });
  });
});
