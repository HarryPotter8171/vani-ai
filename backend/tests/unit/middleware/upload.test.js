import { describe, expect, it } from "vitest";

import {
  isAllowedUpload,
  sanitizeOriginalName,
} from "../../../middleware/upload.js";

describe("upload middleware helpers", () => {
  it("sanitizes path segments from original names", () => {
    expect(sanitizeOriginalName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(sanitizeOriginalName("plain.csv")).toBe("plain.csv");
  });

  it("allows known extensions with matching or octet-stream MIME", () => {
    expect(
      isAllowedUpload({ originalname: "a.pdf", mimetype: "application/pdf" }).ok
    ).toBe(true);
    expect(
      isAllowedUpload({ originalname: "a.zip", mimetype: "application/zip" }).ok
    ).toBe(true);
    expect(
      isAllowedUpload({ originalname: "a.heic", mimetype: "application/octet-stream" })
        .ok
    ).toBe(true);
  });

  it("rejects unknown extensions and MIME/extension mismatches", () => {
    expect(isAllowedUpload({ originalname: "x.exe", mimetype: "text/plain" }).ok).toBe(
      false
    );
    expect(
      isAllowedUpload({ originalname: "photo.png", mimetype: "application/pdf" }).ok
    ).toBe(false);
  });
});
