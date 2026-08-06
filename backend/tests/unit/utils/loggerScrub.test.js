import { describe, it, expect } from "vitest";
import { scrubUrlForLogs } from "../../../utils/logger.js";

describe("utils/logger scrubUrlForLogs", () => {
  it("leaves paths without query strings unchanged", () => {
    expect(scrubUrlForLogs("/api/chat")).toBe("/api/chat");
    expect(scrubUrlForLogs(null)).toBe(null);
  });

  it("redacts access_token and token query params", () => {
    expect(scrubUrlForLogs("/api/files/x?access_token=secret&download=1")).toBe(
      "/api/files/x?access_token=%5BREDACTED%5D&download=1"
    );
    expect(scrubUrlForLogs("/ws?token=abc")).toBe("/ws?token=%5BREDACTED%5D");
  });

  it("preserves unrelated query params", () => {
    expect(scrubUrlForLogs("/api/chat?q=hello&limit=10")).toBe("/api/chat?q=hello&limit=10");
  });
});
