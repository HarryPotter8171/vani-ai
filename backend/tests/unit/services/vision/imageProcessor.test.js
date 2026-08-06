import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { processImageForVision } from "../../../../services/vision/imageProcessor.js";

async function makeSamplePngBuffer() {
  const svg = `
    <svg width="320" height="120" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="20" y="70" font-size="36" fill="black">VANI HEIC TEST</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("vision/imageProcessor", () => {
  it("normalizes HEIC-labeled inputs to Gemini-safe raster output", async () => {
    const source = await makeSamplePngBuffer();
    const out = await processImageForVision(source, {
      filename: "camera.heic",
      mimeType: "image/heic",
      force: true,
    });

    expect(Buffer.isBuffer(out.buffer)).toBe(true);
    expect(out.buffer.length).toBeGreaterThan(0);
    expect(typeof out.sourceFormat).toBe("string");
    expect(["image/jpeg", "image/png"]).toContain(out.mimeType);
    expect(["jpeg", "png"]).toContain(out.format);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
  });
});

