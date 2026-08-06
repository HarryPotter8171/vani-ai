import { describe, it, expect } from "vitest";
import { AppError, createHttpError, toErrorBody } from "../../../utils/errors.js";

describe("utils/errors", () => {
  it("AppError defaults status 500 and generates errorId", () => {
    const err = new AppError("boom");
    expect(err.status).toBe(500);
    expect(err.expose).toBe(false);
    expect(err.errorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("createHttpError exposes 4xx messages", () => {
    const err = createHttpError(404, "Not found", "NOT_FOUND");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.expose).toBe(true);
  });

  it("toErrorBody hides 5xx internals and includes requestId + errorId", () => {
    const err = new Error("secret stack detail");
    err.status = 500;
    const { status, body } = toErrorBody(err, { requestId: "req-1" });
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(body.requestId).toBe("req-1");
    expect(body.errorId).toBeTruthy();
    expect(body.error).not.toContain("secret");
  });

  it("toErrorBody surfaces AppError 4xx message + code", () => {
    const err = createHttpError(400, "Bad input", "BAD_INPUT");
    const { status, body } = toErrorBody(err, { requestId: "req-2" });
    expect(status).toBe(400);
    expect(body).toMatchObject({
      error: "Bad input",
      code: "BAD_INPUT",
      requestId: "req-2",
      errorId: err.errorId,
    });
  });
});
