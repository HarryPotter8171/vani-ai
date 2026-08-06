import { describe, expect, it } from "vitest";

import {
  prepareEditSourceImage,
  stripDataUriPrefix,
} from "../../../services/image/prepareEditSource.js";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("prepareEditSourceImage", () => {
  it("strips data-URI prefixes", () => {
    expect(stripDataUriPrefix(`data:image/png;base64,${TINY_PNG_B64}`)).toBe(
      TINY_PNG_B64
    );
    expect(stripDataUriPrefix(TINY_PNG_B64)).toBe(TINY_PNG_B64);
  });

  it("rejects empty source bytes", async () => {
    await expect(prepareEditSourceImage("")).rejects.toThrow(/empty/i);
  });

  it("prepares a valid PNG for editing", async () => {
    const prepared = await prepareEditSourceImage(TINY_PNG_B64, "image/png");
    expect(prepared.width).toBeGreaterThan(0);
    expect(prepared.height).toBeGreaterThan(0);
    expect(prepared.bytes).toBeGreaterThan(0);
    expect(prepared.dataBase64).toBeTruthy();
    expect(prepared.mimeType).toMatch(/^image\//);
  });

  it("accepts data-URI wrapped PNG input", async () => {
    const prepared = await prepareEditSourceImage(
      `data:image/png;base64,${TINY_PNG_B64}`,
      "image/png"
    );
    expect(prepared.bytes).toBeGreaterThan(0);
  });
});
