/**
 * STANDALONE Gemini image-edit probe — ZERO VANI imports.
 *
 * Implements the official @google/genai "Edit Images" sample from
 * https://github.com/googleapis/js-genai/blob/main/codegen_instructions.md
 * and Vertex generateContent image modality pattern.
 *
 * Uses ONLY: @google/genai + fs + path + Vertex credentials from backend/.env
 *
 * No Sharp, no OCR, no wrappers, no prompt engineering, no resizing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Modality } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "outputs");
const SOURCE_PATH = path.join(OUT_DIR, "original.jpg");

// Load backend/.env manually (no dotenv dependency / no VANI modules).
function loadEnvFile(envPath) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(__dirname, "../../.env"));

// Resolve relative GOOGLE_APPLICATION_CREDENTIALS against backend/
const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (creds && !path.isAbsolute(creds)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
    __dirname,
    "../..",
    creds
  );
}

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";
const MODEL = process.env.VANI_IMAGE_MODEL || "gemini-2.5-flash-image";

const TESTS = [
  {
    id: 1,
    out: "result_1.png",
    // Exact user instruction — no prompt engineering
    instruction: "Remove the white car while keeping everything else identical.",
  },
  {
    id: 2,
    out: "result_2.png",
    instruction: "Replace only the swimming pool water with snow.",
  },
  {
    id: 3,
    out: "result_3.png",
    instruction: "Change only the shirt color to black.",
  },
];

function extractImage(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  const textPart = parts.find(
    (p) => typeof p?.text === "string" && p.text.trim()
  );
  return {
    imageBase64: imagePart?.inlineData?.data || null,
    mimeType: imagePart?.inlineData?.mimeType || null,
    text: textPart?.text || null,
    finishReason: response?.candidates?.[0]?.finishReason || null,
    usage: response?.usageMetadata || null,
  };
}

/**
 * Official edit path (Vertex / codegen):
 *   models.generateContent({
 *     model: 'gemini-2.5-flash-image',
 *     contents: [{ role:'user', parts: [inlineData, text] }],
 *     config: { responseModalities: [TEXT, IMAGE] },
 *   })
 *
 * Also mirrors the chat sample:
 *   chat.sendMessage({ content: [inlineData, instruction] })
 * which serializes to the same multimodal generateContent shape.
 */
async function editWithOfficialGenerateContent(ai, imageBase64, mimeType, instruction) {
  const payload = {
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: instruction },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  };

  const started = Date.now();
  const response = await ai.models.generateContent(payload);
  const elapsedMs = Date.now() - started;
  const extracted = extractImage(response);
  return { payloadMeta: {
    model: MODEL,
    endpoint: "models.generateContent",
    partOrder: ["inlineData", "text"],
    responseModalities: ["TEXT", "IMAGE"],
    instruction,
    sourceMime: mimeType,
    sourceBytes: Buffer.from(imageBase64, "base64").length,
  }, extracted, elapsedMs, rawResponseId: response?.responseId || response?.name || null };
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing source image: ${SOURCE_PATH}`);
  }
  if (!PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT missing from .env");

  const imageBuffer = fs.readFileSync(SOURCE_PATH);
  const imageBase64 = imageBuffer.toString("base64");
  const mimeType = "image/jpeg";

  const ai = new GoogleGenAI({
    vertexai: true,
    project: PROJECT,
    location: LOCATION,
    apiVersion: "v1",
  });

  const pkgPath = path.resolve(
    __dirname,
    "../../node_modules/@google/genai/package.json"
  );
  const sdkVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;

  const report = {
    sdk: "@google/genai",
    sdkVersion,
    model: MODEL,
    project: PROJECT,
    location: LOCATION,
    apiVersion: "v1",
    endpoint: "models.generateContent",
    source: {
      path: SOURCE_PATH,
      mimeType,
      bytes: imageBuffer.length,
      sha256: (await import("node:crypto")).createHash("sha256").update(imageBuffer).digest("hex"),
    },
    runs: [],
  };

  console.log("=== STANDALONE Gemini image edit (official SDK only) ===");
  console.log(`SDK @google/genai@${sdkVersion}`);
  console.log(`Model ${MODEL} | Vertex project=${PROJECT} location=${LOCATION}`);
  console.log(`Source ${SOURCE_PATH} (${imageBuffer.length} bytes)`);
  console.log("");

  for (const test of TESTS) {
    console.log(`--- Test ${test.id}: ${test.instruction}`);
    try {
      const { payloadMeta, extracted, elapsedMs, rawResponseId } =
        await editWithOfficialGenerateContent(
          ai,
          imageBase64,
          mimeType,
          test.instruction
        );

      const outPath = path.join(OUT_DIR, test.out);
      let savedBytes = 0;
      if (extracted.imageBase64) {
        const outBuf = Buffer.from(extracted.imageBase64, "base64");
        fs.writeFileSync(outPath, outBuf);
        savedBytes = outBuf.length;
        console.log(`  OK saved ${outPath} (${savedBytes} bytes) in ${elapsedMs}ms`);
      } else {
        console.log(`  FAIL no image returned in ${elapsedMs}ms`);
        console.log(`  text=${extracted.text?.slice(0, 200) || "(none)"}`);
      }

      report.runs.push({
        id: test.id,
        instruction: test.instruction,
        ok: Boolean(extracted.imageBase64),
        elapsedMs,
        out: test.out,
        savedBytes,
        mimeType: extracted.mimeType,
        finishReason: extracted.finishReason,
        modelText: extracted.text,
        usage: extracted.usage,
        responseId: rawResponseId,
        payload: payloadMeta,
      });
    } catch (err) {
      console.error(`  ERROR: ${err?.message || err}`);
      report.runs.push({
        id: test.id,
        instruction: test.instruction,
        ok: false,
        error: String(err?.message || err),
        stack: err?.stack,
      });
    }
  }

  const reportPath = path.join(OUT_DIR, "run_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
