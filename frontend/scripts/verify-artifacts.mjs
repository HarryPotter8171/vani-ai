/**
 * Smoke-test artifact detection + preview document builders.
 * Run from frontend/: node scripts/verify-artifacts.mjs
 */
import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.resolve(__dirname, '../lib');
const tmpDir = path.join(__dirname, '.tmp-verify');
fs.mkdirSync(tmpDir, { recursive: true });

function transpile(rel) {
  const file = path.join(libDir, rel);
  let source = fs.readFileSync(file, 'utf8');
  source = source.replaceAll("from '@/lib/artifacts'", "from './artifacts.mjs'");
  source = source.replaceAll('from "@/lib/artifacts"', "from './artifacts.mjs'");
  source = source.replaceAll("from '@/lib/htmlSanitize'", "from './htmlSanitize.mjs'");
  source = source.replaceAll('from "@/lib/htmlSanitize"', "from './htmlSanitize.mjs'");
  source = source.replaceAll("from '@/lib/reactPreviewRuntime'", "from './reactPreviewRuntime.mjs'");
  source = source.replaceAll('from "@/lib/reactPreviewRuntime"', "from './reactPreviewRuntime.mjs'");

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      verbatimModuleSyntax: false,
    },
    fileName: file,
  });

  const outFile = path.join(tmpDir, rel.replace(/\.ts$/, '.mjs'));
  fs.writeFileSync(outFile, outputText);
  return pathToFileURL(outFile).href;
}

const artifactsUrl = transpile('artifacts.ts');
transpile('htmlSanitize.ts');
transpile('reactPreviewRuntime.ts');
const previewUrl = transpile('artifactPreview.ts');
const sanitizeUrl = pathToFileURL(path.join(tmpDir, 'htmlSanitize.mjs')).href;
const runtimeUrl = pathToFileURL(path.join(tmpDir, 'reactPreviewRuntime.mjs')).href;

const {
  extractArtifacts,
  canPreview,
  detectLanguage,
  isHtmlPreviewLanguage,
  isReactPreviewLanguage,
  isMermaidPreviewLanguage,
  supportsSplitView,
} = await import(artifactsUrl);
const {
  buildPreviewDocument,
  prepareReactSource,
  IFRAME_SANDBOX,
  buildReactBootstrapDocument,
  looksLikeReact,
} = await import(previewUrl);
const { sanitizeHtmlForPreview } = await import(sanitizeUrl);
const { REACT_PREVIEW_CHANNEL } = await import(runtimeUrl);

const fixtures = {
  HTML: `Here is a page:\n\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head><title>Demo</title></head>\n<body>\n  <h1>Hello VANI</h1>\n  <p>Live HTML preview works.</p>\n  <script>document.body.dataset.ready = '1';<\/script>\n</body>\n</html>\n\`\`\`\n`,
  CSS: `Styles:\n\n\`\`\`css\n.card {\n  display: flex;\n  gap: 12px;\n  padding: 16px;\n  background: #f5f5f7;\n  border-radius: 12px;\n}\n@media (max-width: 640px) {\n  .card { flex-direction: column; }\n}\n\`\`\`\n`,
  JS: `Script:\n\n\`\`\`javascript\nconst el = document.createElement('div');\nel.textContent = 'Hello from JS';\nconsole.log(el.textContent);\n\`\`\`\n`,
  Responsive: `Page:\n\n\`\`\`html\n<div class="wrap">\n  <style>\n    .wrap { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }\n    .box { padding: 20px; background: #0071e3; color: #fff; border-radius: 12px; }\n  </style>\n  <div class="box">A</div>\n  <div class="box">B</div>\n  <div class="box">C</div>\n</div>\n\`\`\`\n`,
  Dangerous: `<!DOCTYPE html><html><head>
<base href="https://evil.example/">
<meta http-equiv="refresh" content="0;url=https://evil.example">
</head><body>
<object data="x"></object>
<a href="https://example.com" target="_blank">x</a>
<script>window.open('https://evil.example')<\/script>
</body></html>`,
  Counter: `Component:\n\n\`\`\`jsx\nfunction App() {\n  const [n, setN] = useState(0);\n  return (\n    <div>\n      <h1>Count {n}</h1>\n      <button onClick={() => setN(n + 1)}>Inc</button>\n    </div>\n  );\n}\n\`\`\`\n`,
  Todo: `Todo:\n\n\`\`\`jsx\nfunction TodoApp() {\n  const [items, setItems] = useState(['Ship React preview']);\n  const [text, setText] = useState('');\n  return (\n    <div className="p-4">\n      <form onSubmit={(e) => {\n        e.preventDefault();\n        if (!text.trim()) return;\n        setItems([...items, text.trim()]);\n        setText('');\n      }}>\n        <input value={text} onChange={(e) => setText(e.target.value)} />\n        <button type="submit">Add</button>\n      </form>\n      <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>\n    </div>\n  );\n}\n\`\`\`\n`,
  Tailwind: `Tailwind:\n\n\`\`\`jsx\nfunction Card() {\n  return (\n    <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-slate-900 p-6 text-white shadow-xl">\n      <h2 className="text-xl font-semibold">Tailwind Card</h2>\n      <p className="mt-2 text-slate-300">Utility classes render via CDN.</p>\n      <button className="mt-4 rounded-full bg-sky-500 px-4 py-2 text-sm font-medium">Action</button>\n    </div>\n  );\n}\n\`\`\`\n`,
  Hooks: `Hooks:\n\n\`\`\`jsx\nfunction HooksDemo() {\n  const [count, setCount] = useState(0);\n  const doubled = useMemo(() => count * 2, [count]);\n  useEffect(() => {\n    console.log('count changed', count);\n  }, [count]);\n  return (\n    <button onClick={() => setCount((c) => c + 1)}>\n      count {count} / doubled {doubled}\n    </button>\n  );\n}\n\`\`\`\n`,
  TSX: `Typed:\n\n\`\`\`tsx\ninterface Props {\n  label: string;\n}\n\nfunction Greeter({ label }: Props) {\n  const [name, setName] = useState<string>('VANI');\n  return (\n    <div>\n      <h1>{label}: {name}</h1>\n      <input value={name} onChange={(e) => setName(e.target.value)} />\n    </div>\n  );\n}\n\`\`\`\n`,
  Markdown: `Notes:\n\n\`\`\`markdown\n# Title\n\nHello **world**\n\n- one\n- two\n- three\n\`\`\`\n`,
  Mermaid: `Diagram:\n\n\`\`\`mermaid\nflowchart LR\n  A[Chat] --> B[Detect]\n  B --> C[Artifact Panel]\n  C --> D[Preview]\n\`\`\`\n`,
  MermaidSequence: `Seq:\n\n\`\`\`mermaid\nsequenceDiagram\n  participant U as User\n  participant V as VANI\n  U->>V: Ask\n  V-->>U: Answer\n\`\`\`\n`,
  MermaidClass: `Class:\n\n\`\`\`mermaid\nclassDiagram\n  class Animal {\n    +String name\n    +eat()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog\n\`\`\`\n`,
  MermaidER: `ER:\n\n\`\`\`mermaid\nerDiagram\n  USER ||--o{ CHAT : owns\n  CHAT ||--|{ MESSAGE : contains\n\`\`\`\n`,
  MermaidMindmap: `Mind:\n\n\`\`\`mermaid\nmindmap\n  root((VANI))\n    Chat\n    Artifacts\n      Mermaid\n      HTML\n    Projects\n\`\`\`\n`,
  MermaidTimeline: `Time:\n\n\`\`\`mermaid\ntimeline\n  title Product\n  2024 : Prototype\n  2025 : Beta\n       : Launch\n\`\`\`\n`,
};

let failed = 0;
function assert(cond, label, detail = '') {
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed += 1;
}

const htmlA = extractArtifacts(fixtures.HTML, 'm1', false).artifacts[0];
assert(htmlA?.language === 'html' && canPreview('html'), 'detect HTML', htmlA?.language);
assert(isHtmlPreviewLanguage('html'), 'html uses live iframe preview');

const cssA = extractArtifacts(fixtures.CSS, 'm-css', false).artifacts[0];
assert(cssA?.language === 'css' && canPreview('css'), 'detect CSS', cssA?.language);

const jsA = extractArtifacts(fixtures.JS, 'm-js', false).artifacts[0];
assert(jsA?.language === 'javascript' && canPreview('javascript'), 'detect JavaScript', jsA?.language);

const respA = extractArtifacts(fixtures.Responsive, 'm-resp', false).artifacts[0];
assert(respA?.language === 'html', 'detect responsive HTML', respA?.language);

const counterA = extractArtifacts(fixtures.Counter, 'm-counter', false).artifacts[0];
assert(counterA?.language === 'jsx' && canPreview('jsx'), 'detect Counter React', counterA?.language);
assert(isReactPreviewLanguage('jsx'), 'jsx uses React preview engine');

const todoA = extractArtifacts(fixtures.Todo, 'm-todo', false).artifacts[0];
assert(todoA?.language === 'jsx', 'detect Todo App', todoA?.language);

const twA = extractArtifacts(fixtures.Tailwind, 'm-tw', false).artifacts[0];
assert(twA?.language === 'jsx', 'detect Tailwind component', twA?.language);

const hooksA = extractArtifacts(fixtures.Hooks, 'm-hooks', false).artifacts[0];
assert(hooksA?.language === 'jsx', 'detect Hooks demo', hooksA?.language);

const tsxA = extractArtifacts(fixtures.TSX, 'm-tsx', false).artifacts[0];
assert(tsxA?.language === 'tsx' && canPreview('tsx'), 'detect TypeScript component', tsxA?.language);
assert(isReactPreviewLanguage('tsx'), 'tsx uses React preview engine');

const mdA = extractArtifacts(fixtures.Markdown, 'm3', false).artifacts[0];
assert(mdA?.language === 'markdown' && canPreview('markdown'), 'detect Markdown', mdA?.language);

const mermaidA = extractArtifacts(fixtures.Mermaid, 'm4', false).artifacts[0];
assert(mermaidA?.language === 'mermaid' && canPreview('mermaid'), 'detect Mermaid', mermaidA?.language);
assert(isMermaidPreviewLanguage('mermaid'), 'mermaid uses Mermaid preview engine');
assert(supportsSplitView('mermaid'), 'mermaid supports split live edit');
assert(mermaidA?.title === 'Flowchart', 'mermaid flowchart title', mermaidA?.title);

const seqA = extractArtifacts(fixtures.MermaidSequence, 'm-seq', false).artifacts[0];
assert(seqA?.language === 'mermaid' && seqA?.title === 'Sequence Diagram', 'detect Sequence', seqA?.title);

const classA = extractArtifacts(fixtures.MermaidClass, 'm-class', false).artifacts[0];
assert(classA?.language === 'mermaid' && classA?.title === 'Class Diagram', 'detect Class', classA?.title);

const erA = extractArtifacts(fixtures.MermaidER, 'm-er', false).artifacts[0];
assert(erA?.language === 'mermaid' && erA?.title === 'ER Diagram', 'detect ER', erA?.title);

const mindA = extractArtifacts(fixtures.MermaidMindmap, 'm-mind', false).artifacts[0];
assert(mindA?.language === 'mermaid' && mindA?.title === 'Mindmap', 'detect Mindmap', mindA?.title);

const timeA = extractArtifacts(fixtures.MermaidTimeline, 'm-time', false).artifacts[0];
assert(timeA?.language === 'mermaid' && timeA?.title === 'Timeline', 'detect Timeline', timeA?.title);

const mermaidDoc = buildPreviewDocument('mermaid', mermaidA.content);
assert(!!mermaidDoc?.includes('mermaid@11') && mermaidDoc.includes('flowchart LR'), 'Mermaid preview document');
assert(!!mermaidDoc?.includes('securityLevel'), 'Mermaid doc uses strict security');

const htmlDoc = buildPreviewDocument('html', htmlA.content);
assert(!!htmlDoc?.includes('<h1>Hello VANI</h1>'), 'HTML preview document');
assert(!!htmlDoc?.includes('Content-Security-Policy'), 'HTML injects CSP');
assert(!!htmlDoc?.includes("window.open = function"), 'HTML blocks window.open');

const cssDoc = buildPreviewDocument('css', cssA.content);
assert(!!cssDoc?.includes('.card') && cssDoc.includes('CSS Preview'), 'CSS preview document');

const jsDoc = buildPreviewDocument('javascript', jsA.content);
assert(!!jsDoc?.includes('Hello from JS') && jsDoc.includes('console.log'), 'JS preview document');

const respDoc = buildPreviewDocument('html', respA.content);
assert(!!respDoc?.includes('auto-fit') && respDoc.includes('grid-template-columns'), 'responsive layout preview');

const counterDoc = buildPreviewDocument('jsx', counterA.content);
assert(!!counterDoc?.includes('react@18') && counterDoc.includes('function App'), 'Counter React document');
assert(!!counterDoc?.includes('cdn.tailwindcss.com'), 'React document includes Tailwind CDN');
assert(!!counterDoc?.includes('PreviewErrorBoundary'), 'React document includes error boundary');

const preparedCounter = prepareReactSource(counterA.content);
assert(preparedCounter.includes('createRoot'), 'React auto-mount');
assert(preparedCounter.includes('useState'), 'hooks preamble / useState available');

const preparedTodo = prepareReactSource(todoA.content);
assert(preparedTodo.includes('TodoApp') && preparedTodo.includes('createRoot'), 'Todo App auto-mount');

const preparedHooks = prepareReactSource(hooksA.content);
assert(
  preparedHooks.includes('useMemo') && preparedHooks.includes('useEffect'),
  'Hooks helpers injected'
);

const preparedTsx = prepareReactSource(tsxA.content);
assert(preparedTsx.includes('Greeter'), 'TSX source prepared');
assert(preparedTsx.includes('createRoot'), 'TSX auto-mount');

const tsxDoc = buildPreviewDocument('tsx', tsxA.content);
assert(!!tsxDoc?.includes('typescript') && tsxDoc.includes('Greeter'), 'TSX preview document');

const bootstrap = buildReactBootstrapDocument();
assert(!!bootstrap?.includes(REACT_PREVIEW_CHANNEL), 'bootstrap uses preview channel');
assert(!!bootstrap?.includes('react@18') && bootstrap.includes('@babel/standalone'), 'bootstrap loads React 18 + Babel');
assert(!!bootstrap?.includes('cdn.tailwindcss.com'), 'bootstrap loads Tailwind');
assert(!!bootstrap?.includes('postMessage'), 'bootstrap bridges via postMessage');
assert(looksLikeReact(counterA.content), 'looksLikeReact detects counter');

// Security
assert(!IFRAME_SANDBOX.includes('allow-same-origin'), 'sandbox blocks same-origin');
assert(!IFRAME_SANDBOX.includes('allow-popups'), 'sandbox blocks popups');
assert(!IFRAME_SANDBOX.includes('allow-top-navigation'), 'sandbox blocks top navigation');
assert(IFRAME_SANDBOX.includes('allow-scripts'), 'sandbox allows scripts');

const sanitized = sanitizeHtmlForPreview(fixtures.Dangerous);
assert(!/<base\b/i.test(sanitized), 'sanitize strips <base>');
assert(!/http-equiv\s*=\s*["']?refresh/i.test(sanitized), 'sanitize strips meta refresh');
assert(!/<object\b/i.test(sanitized), 'sanitize strips <object>');

const dangerousDoc = buildPreviewDocument('html', fixtures.Dangerous);
assert(!!dangerousDoc && !/<base\b/i.test(dangerousDoc), 'preview doc has no <base>');
assert(!!dangerousDoc && !/http-equiv\s*=\s*["']?refresh/i.test(dangerousDoc), 'preview doc has no meta refresh');

assert(detectLanguage('flowchart TD\n  A-->B\n  B-->C')?.canonical === 'mermaid', 'auto-detect mermaid');
assert(detectLanguage('sequenceDiagram\n  A->>B: hi')?.canonical === 'mermaid', 'auto-detect sequence');
assert(detectLanguage('mindmap\n  root((x))\n    a')?.canonical === 'mermaid', 'auto-detect mindmap');
assert(
  detectLanguage(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16"/></svg>'
  )?.canonical === 'svg',
  'auto-detect svg'
);

fs.rmSync(tmpDir, { recursive: true, force: true });

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll HTML / CSS / JS / React / Mermaid / responsive / security verifications passed.');
