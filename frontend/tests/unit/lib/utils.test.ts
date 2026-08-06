import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, getGreeting } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("resolves conflicting Tailwind utility classes (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("merges conditional object syntax from clsx", () => {
    expect(cn({ a: true, b: false }, "c")).toBe("a c");
  });
});

describe("getGreeting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Good Morning' before noon", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0, 0));
    expect(getGreeting()).toBe("Good Morning");
  });

  it("returns 'Good Afternoon' between 12 and 17", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0, 0));
    expect(getGreeting()).toBe("Good Afternoon");
  });

  it("returns 'Good Evening' after 17", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 20, 0, 0));
    expect(getGreeting()).toBe("Good Evening");
  });
});
