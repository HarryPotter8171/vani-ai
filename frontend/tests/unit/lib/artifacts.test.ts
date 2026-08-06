import { describe, it, expect } from "vitest";
import {
  extractArtifacts,
  detectLanguage,
  canPreview,
  defaultViewMode,
  supportsSplitView,
  isHtmlPreviewLanguage,
  isReactPreviewLanguage,
  isMermaidPreviewLanguage,
  getDownloadFilename,
  getMimeType,
  LANGUAGE_INFO,
  type Artifact,
} from "@/lib/artifacts";

describe("lib/artifacts: language predicates", () => {
  it("classifies HTML-preview languages", () => {
    expect(isHtmlPreviewLanguage("html")).toBe(true);
    expect(isHtmlPreviewLanguage("css")).toBe(true);
    expect(isHtmlPreviewLanguage("svg")).toBe(true);
    expect(isHtmlPreviewLanguage("javascript")).toBe(true);
    expect(isHtmlPreviewLanguage("jsx")).toBe(true);
    expect(isHtmlPreviewLanguage("tsx")).toBe(true);
    expect(isHtmlPreviewLanguage("python")).toBe(false);
    expect(isHtmlPreviewLanguage("mermaid")).toBe(false);
  });

  it("classifies React-preview languages", () => {
    expect(isReactPreviewLanguage("jsx")).toBe(true);
    expect(isReactPreviewLanguage("tsx")).toBe(true);
    expect(isReactPreviewLanguage("html")).toBe(false);
  });

  it("classifies Mermaid", () => {
    expect(isMermaidPreviewLanguage("mermaid")).toBe(true);
    expect(isMermaidPreviewLanguage("html")).toBe(false);
  });

  it("supportsSplitView only for html-family and mermaid", () => {
    expect(supportsSplitView("html")).toBe(true);
    expect(supportsSplitView("mermaid")).toBe(true);
    expect(supportsSplitView("python")).toBe(false);
    expect(supportsSplitView("json")).toBe(false);
  });

  it("canPreview / defaultViewMode reflect LANGUAGE_INFO.previewable", () => {
    expect(canPreview("html")).toBe(true);
    expect(canPreview("python")).toBe(false);
    expect(defaultViewMode("html")).toBe("preview");
    expect(defaultViewMode("python")).toBe("code");
  });
});

describe("lib/artifacts: getDownloadFilename / getMimeType", () => {
  function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
    return {
      id: "m1-artifact-0",
      messageId: "m1",
      index: 0,
      language: "javascript",
      title: "Script",
      content: "console.log(1)",
      isStreaming: false,
      ...overrides,
    };
  }

  it("uses the artifact title when it already has an extension", () => {
    const artifact = makeArtifact({ title: "app.js" });
    expect(getDownloadFilename(artifact)).toBe("app.js");
  });

  it("falls back to a generic name with the language's extension", () => {
    const artifact = makeArtifact({ title: "Script", language: "python" });
    expect(getDownloadFilename(artifact)).toBe("artifact.py");
  });

  it("returns the language's MIME type", () => {
    expect(getMimeType(makeArtifact({ language: "html" }))).toBe(LANGUAGE_INFO.html.mimeType);
    expect(getMimeType(makeArtifact({ language: "json" }))).toBe("application/json");
  });
});

describe("lib/artifacts: detectLanguage", () => {
  it("returns null for empty content", () => {
    expect(detectLanguage("   ")).toBeNull();
  });

  it("detects raw SVG", () => {
    expect(detectLanguage("<svg viewBox='0 0 1 1'><rect/></svg>")?.canonical).toBe("svg");
  });

  it("detects Mermaid diagrams by keyword", () => {
    expect(detectLanguage("flowchart TD\n  A-->B")?.canonical).toBe("mermaid");
    expect(detectLanguage("sequenceDiagram\n  A->>B: hi")?.canonical).toBe("mermaid");
  });

  it("detects a full HTML document", () => {
    expect(detectLanguage("<!DOCTYPE html><html><body></body></html>")?.canonical).toBe("html");
  });

  it("detects JSX/React components", () => {
    const code = `function App() {\n  return (\n    <div>Hello</div>\n  );\n}`;
    expect(detectLanguage(code)?.canonical).toBe("jsx");
  });

  it("promotes to TSX when TypeScript annotations are present", () => {
    const code = `interface Props { name: string }\nfunction App(props: Props) {\n  return (\n    <div>{props.name}</div>\n  );\n}`;
    expect(detectLanguage(code)?.canonical).toBe("tsx");
  });

  it("detects standalone HTML fragments", () => {
    expect(detectLanguage("<div class='card'><p>Hi</p></div>")?.canonical).toBe("html");
  });

  it("detects CSS stylesheets", () => {
    const code = ".card {\n  display: flex;\n  color: red;\n}";
    expect(detectLanguage(code)?.canonical).toBe("css");
  });

  it("detects Markdown documents", () => {
    const code = "# Title\n\n- item one\n- item two\n\n[link](https://example.com)";
    expect(detectLanguage(code)?.canonical).toBe("markdown");
  });

  it("detects plain JavaScript / TypeScript imports", () => {
    expect(detectLanguage("import { foo } from 'bar';\nfoo();")?.canonical).toBe("javascript");
    expect(
      detectLanguage("import { foo } from 'bar';\ninterface X { a: number }")?.canonical
    ).toBe("typescript");
  });

  it("returns null for content that matches nothing", () => {
    expect(detectLanguage("just some plain prose without any code signals")).toBeNull();
  });
});

describe("lib/artifacts: extractArtifacts", () => {
  it("returns a single text segment for plain content with no fences", () => {
    const { segments, artifacts } = extractArtifacts("Hello, just chatting.", "m1", false);
    expect(artifacts).toHaveLength(0);
    expect(segments).toEqual([{ type: "text", value: "Hello, just chatting." }]);
  });

  it("promotes a substantial fenced code block into an artifact", () => {
    const code = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
    const content = `Here you go:\n\n\`\`\`python\n${code}\n\`\`\`\n\nDone.`;
    const { segments, artifacts } = extractArtifacts(content, "m1", false);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      language: "python",
      isStreaming: false,
      messageId: "m1",
      id: "m1-artifact-0",
    });
    expect(segments.map((s) => s.type)).toEqual(["text", "artifact", "text"]);
  });

  it("leaves short/non-qualifying fences inline as text (not promoted)", () => {
    const content = "Run this:\n\n```bash\nls -la\n```\n";
    const { segments, artifacts } = extractArtifacts(content, "m1", false);
    expect(artifacts).toHaveLength(0);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ type: "text", value: content });
  });

  it("promotes short HTML/mermaid fences at a lower size threshold", () => {
    const content = "```mermaid\ngraph TD\n  A-->B\n```";
    const { artifacts } = extractArtifacts(content, "m1", false);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].language).toBe("mermaid");
    expect(artifacts[0].title).toBe("Flowchart");
  });

  it("detects an unterminated trailing fence as a live streaming artifact", () => {
    const partialCode = Array.from({ length: 5 }, (_, i) => `<div>${i}</div>`).join("\n");
    const content = `Building your page:\n\n\`\`\`html\n${partialCode}`;
    const { segments, artifacts } = extractArtifacts(content, "m1", true);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].isStreaming).toBe(true);
    expect(artifacts[0].language).toBe("html");
    expect(segments.at(-1)).toMatchObject({ type: "artifact" });
  });

  it("does not treat a trailing unterminated fence as an artifact when isStreaming is false", () => {
    const content = "```html\n<div>unterminated";
    const { artifacts } = extractArtifacts(content, "m1", false);
    expect(artifacts).toHaveLength(0);
  });

  it("assigns sequential ids and indices across multiple artifacts", () => {
    const bigPy = Array.from({ length: 12 }, (_, i) => `x${i} = ${i}`).join("\n");
    const content = `\`\`\`python\n${bigPy}\n\`\`\`\n\ntext between\n\n\`\`\`mermaid\ngraph TD\n  A-->B\n\`\`\``;
    const { artifacts } = extractArtifacts(content, "m2", false);

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].id).toBe("m2-artifact-0");
    expect(artifacts[1].id).toBe("m2-artifact-1");
    expect(artifacts[1].index).toBe(1);
  });

  it("derives a title from a leading filename comment", () => {
    const bigJson = JSON.stringify({ a: 1, b: 2, c: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, null, 2);
    const content = `\`\`\`json\n// config.json\n${bigJson}\n\`\`\``;
    const { artifacts } = extractArtifacts(content, "m1", false);
    expect(artifacts[0].title).toBe("config.json");
  });
});
