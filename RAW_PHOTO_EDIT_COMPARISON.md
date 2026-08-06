# Photographic raw-byte edit experiment — comparison report

**Branch:** `experiment/raw-photo-edit-bytes`  
**Code change:** only `backend/services/image/prepareEditSource.js`  
**Instruction:** `Remove the white car while keeping everything else identical.`  
**Model / SDK:** `gemini-2.5-flash-image` via `image_edit` → `editImage` → `models.generateContent`  
**Source fixture:** `/tmp/vani_photo_edit_ab/source_white_car.jpg` (JPEG 1280×720, SHA-256 `1c3723be7cd71afd6707e0089661e880a85194f8b4e1465f800e7fe9eb522f8a`)

This report compares two live runs on the **same** source bytes and the **same** instruction. It does not claim product readiness.

---

## What changed in code

For sniffed photographic formats (`jpeg` / `jpg` / `heic`):

- No resize, rotate, PNG→JPEG conversion, recompress, metadata strip, or color-space rewrite
- Return original uploaded base64 / bytes as received (after optional data-URI unwrap only)
- MIME normalized from sniff (fallback: claimed → `image/jpeg`)

Non-photographic formats keep the previous sharp re-encode path.

---

## Wire / prepare comparison

| Metric | Original pipeline | Raw-byte pipeline |
|--------|-------------------|-------------------|
| `prepareEditSource` mode | Re-encode (sharp → JPEG q92/mozjpeg) | `photographic_passthrough` |
| Prepared bytes | **9150** | **9436** |
| Prepared SHA-256 | `31acfbc83fa4bba633d958e1f034b5fa4ecb0e6f1bed01331b67c25ad4288181` | `1c3723be7cd71afd6707e0089661e880a85194f8b4e1465f800e7fe9eb522f8a` |
| Bytes identical to upload? | **No** | **Yes** |
| Base64 identical to upload? | **No** | **Yes** |
| Sent `inlineData.mimeType` | `image/jpeg` | `image/jpeg` |
| Sent dimensions (reported) | 1280×720 | 1280×720 |
| Sent inline byte length | 9150 | 9436 |
| Part order | `inlineData`, `text` | `inlineData`, `text` |
| `responseModalities` | `TEXT`, `IMAGE` | `TEXT`, `IMAGE` |
| Prompt text length | 379 | 379 |
| Prompt IMAGE tokens | 1806 | 1806 |
| Prompt TEXT tokens | 72 | 72 |
| Total prompt tokens | 1878 | 1878 |
| Candidate IMAGE tokens | 1290 | 1290 |
| `finishReason` | `STOP` | `STOP` |
| App `ok` | `true` | `true` |
| Latency | 8178 ms | 7962 ms |
| Response id | `3qFxavWAI9Ct7PkPvZWl8AQ` | `KaJxav3yEuGe7PkP3MC66QY` |

---

## Output image comparison

| Metric | Original pipeline | Raw-byte pipeline |
|--------|-------------------|-------------------|
| Output path | `/tmp/vani_photo_edit_ab/original_pipeline_result.png` | `/tmp/vani_photo_edit_ab/raw_pipeline_result.png` |
| Output format | PNG | PNG |
| Output size | 1344×768 (654 441 bytes) | 1344×768 (655 089 bytes) |
| Output SHA-256 | `a6e8fc93…25194f` | `ae92144a…5a98a3` |
| Identical outputs? | — | **No** |

**Crude luminance distance** (both outputs resized to 160×90 RGB):

| Pair | RMSE |
|------|------|
| Original result vs raw result | **0.67** (very close) |
| Original result vs source | 21.85 |
| Raw result vs source | 21.91 |

### Visual / content observations (manual)

**Source:** Flat geometric scene — light blue sky, dark gray ground, green block (left), **white car** (center: body + wheels + blue window), brown block (right).

**Original pipeline result:** White car absent. Green and brown blocks remain. Sky/ground split preserved. Flat style retained. Output resolution upscaled to 1344×768 (not 1280×720).

**Raw-byte pipeline result:** White car absent. Green and brown blocks remain. Sky/ground split preserved. Flat style retained. Same 1344×768 output size. Visually near-indistinguishable from the original-pipeline result at a glance; pixel hashes differ.

Neither run returned a text part — image only.

---

## Interpretation

1. **Passthrough worked as intended on the wire:** raw pipeline sent SHA-identical JPEG bytes; original pipeline recompressed (9436 → 9150 bytes) before the API call.
2. **Token accounting was identical** for this fixture (same IMAGE/TEXT prompt token counts), so the recompress did not change billed prompt image tokens here.
3. **Edit outcomes were similar** for this synthetic JPEG: both removed the white car and kept the other shapes; outputs were not byte-identical but had very low inter-result RMSE.
4. **Unresolved / not proven by this run:** whether raw bytes improve fidelity on *real* camera photos (EXIF orientation, large edges, high ISO noise, complex backgrounds). This fixture is a JPEG container with flat graphics, not a camera capture.
5. **Shared non-prepare behavior unchanged:** both still wrap the user text via `buildEditInstruction`, both use `generateContent` (no dedicated edit API), both received 1344×768 PNG outputs from the model.

---

## Artifacts

| File | Role |
|------|------|
| `/tmp/vani_photo_edit_ab/source_white_car.jpg` | Shared source |
| `/tmp/vani_photo_edit_ab/original_pipeline_trace.json` | Original run trace |
| `/tmp/vani_photo_edit_ab/raw_pipeline_trace.json` | Raw-byte run trace |
| `/tmp/vani_photo_edit_ab/original_pipeline_result.png` | Original output |
| `/tmp/vani_photo_edit_ab/raw_pipeline_result.png` | Raw-byte output |
| `/tmp/vani_photo_edit_ab/pixel_compare.json` | Size/hash/RMSE stats |
