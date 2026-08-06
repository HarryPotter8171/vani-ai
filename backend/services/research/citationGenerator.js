/**
 * Citation numbering and inline reference formatting.
 */

/**
 * Assign stable citation ids [1]..[n] to ranked sources.
 * @param {Array<object>} sources
 */
export function assignCitations(sources) {
  return (sources || []).map((source, index) => ({
    ...source,
    citationId: index + 1,
    citationLabel: `[${index + 1}]`,
  }));
}

/**
 * Build a References markdown section.
 * @param {Array<object>} citedSources
 */
export function buildReferencesMarkdown(citedSources) {
  if (!citedSources?.length) return "";

  const lines = ["## References", ""];
  for (const s of citedSources) {
    const id = s.citationId || 0;
    const title = (s.title || s.url || "Source").replace(/\s+/g, " ").trim();
    const host = safeHost(s.url);
    lines.push(`${id}. [${title}](${s.url})${host ? ` — ${host}` : ""}`);
  }
  return lines.join("\n");
}

/**
 * Structured citation objects for the UI citation viewer.
 */
export function buildCitationList(citedSources) {
  return (citedSources || []).map((s) => ({
    id: s.citationId,
    label: s.citationLabel || `[${s.citationId}]`,
    title: s.title || s.url,
    url: s.url,
    snippet: (s.snippet || s.text || "").slice(0, 280),
    score: s.score,
    provider: s.provider,
    hostname: safeHost(s.url),
  }));
}

/**
 * Ensure the report ends with a references block if missing.
 */
export function ensureReferences(reportMarkdown, citedSources) {
  const body = String(reportMarkdown || "").trim();
  const refs = buildReferencesMarkdown(citedSources);
  if (!refs) return body;
  if (/^##\s+References\b/im.test(body)) return body;
  return `${body}\n\n${refs}\n`;
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
