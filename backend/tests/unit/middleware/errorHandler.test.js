import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("../../../utils/errorTracking.js", () => ({
  captureException: mocks.captureException,
}));

vi.mock("../../../utils/metrics.js", () => ({
  increment: vi.fn(),
}));

const { globalErrorHandler, corsErrorHandler } = await import(
  "../../../middleware/errorHandler.js"
);
const { AppError } = await import("../../../utils/errors.js");

function mockRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("middleware/errorHandler", () => {
  beforeEach(() => {
    mocks.captureException.mockReset();
  });

  it("corsErrorHandler returns 403 for CORS rejections", () => {
    const res = mockRes();
    const next = vi.fn();
    corsErrorHandler(
      new Error("CORS origin not allowed: https://evil.test"),
      { id: "r1" },
      res,
      next
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("Origin not allowed");
    expect(next).not.toHaveBeenCalled();
  });

  it("globalErrorHandler returns standard envelope with errorId", () => {
    const res = mockRes();
    const err = new AppError("nope", { status: 400, code: "NOPE" });
    globalErrorHandler(err, { id: "req-abc", method: "GET", originalUrl: "/x" }, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: "nope",
      code: "NOPE",
      requestId: "req-abc",
      errorId: err.errorId,
    });
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("globalErrorHandler masks 5xx messages", () => {
    const res = mockRes();
    globalErrorHandler(
      new Error("db password xyz"),
      { id: "req-9", method: "POST", originalUrl: "/api" },
      res,
      vi.fn()
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.errorId).toBeTruthy();
    expect(res.body.requestId).toBe("req-9");
  });
});
