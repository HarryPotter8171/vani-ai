/**
 * Optional Code Interpreter bridge for Deep Research.
 * Runs lightweight quantitative analysis when the sandbox is enabled.
 */

import {
  isCodeInterpreterEnabled,
  sessionManager,
} from "../codeInterpreter/init.js";

/**
 * Analyze structured research findings with Python when available.
 * Never throws — research pipeline must remain resilient.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.query
 * @param {Array<{title?: string, score?: number, url?: string}>} opts.sources
 * @returns {Promise<{ ok: boolean, stdout?: string, error?: string, sessionId?: string }>}
 */
export async function analyzeResearchWithCode({
  userId,
  query,
  sources = [],
} = {}) {
  if (!userId || !isCodeInterpreterEnabled()) {
    return { ok: false, error: "Code Interpreter unavailable" };
  }

  const rows = (Array.isArray(sources) ? sources : [])
    .slice(0, 40)
    .map((s, i) => ({
      i: i + 1,
      title: String(s.title || "").slice(0, 120),
      score: Number(s.score) || 0,
      url: String(s.url || "").slice(0, 200),
    }));

  const code = `
import json
import statistics

query = ${JSON.stringify(String(query || "").slice(0, 500))}
rows = json.loads(${JSON.stringify(JSON.stringify(rows))})

scores = [float(r.get("score") or 0) for r in rows]
print(f"Research query: {query}")
print(f"Sources analyzed: {len(rows)}")
if scores:
    print(f"Score mean: {statistics.mean(scores):.3f}")
    print(f"Score median: {statistics.median(scores):.3f}")
    print(f"Score min/max: {min(scores):.3f} / {max(scores):.3f}")
    top = sorted(rows, key=lambda r: r.get("score") or 0, reverse=True)[:5]
    print("Top sources:")
    for r in top:
        print(f"  - {r.get('score', 0):.3f} · {r.get('title')}")
else:
    print("No scored sources available.")
`.trim();

  try {
    const { session, result } = await sessionManager.runPython(userId, code, {
      timeoutMs: 15_000,
    });
    return {
      ok: result.status === "completed",
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      sessionId: session.sessionId,
      executionId: result.executionId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
