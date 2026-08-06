/**
 * Client-side plugin tool registry (metadata + permission helpers).
 * Server execution lives in backend/agents/ToolRegistry.js — this mirrors
 * the contract so the UI and future client plugins stay aligned.
 */

export interface AgentToolDefinition {
  name: string;
  description: string;
  displayName?: string;
  enabled?: boolean;
  /** Client-side argument validation. Return { ok:false } to block. */
  validate: (args: Record<string, unknown>) => { ok: boolean; error?: string; args?: Record<string, unknown> };
  /** Optional client stub — real execution is always server-side. */
  execute?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

const tools = new Map<string, AgentToolDefinition>();

export function registerTool(tool: AgentToolDefinition): AgentToolDefinition {
  if (!tool?.name || typeof tool.validate !== 'function') {
    throw new Error('Agent tool requires name and validate()');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    throw new Error(`Invalid tool name: ${tool.name}`);
  }
  const normalized: AgentToolDefinition = {
    enabled: true,
    displayName: tool.displayName || tool.name,
    ...tool,
  };
  tools.set(normalized.name, normalized);
  return normalized;
}

export function getTool(name: string): AgentToolDefinition | null {
  return tools.get(name) || null;
}

export function listTools(includeDisabled = false): AgentToolDefinition[] {
  const all = [...tools.values()];
  return includeDisabled ? all : all.filter((t) => t.enabled !== false);
}

export function checkPermission(
  toolName: string,
  allowedTools?: string[] | null
): { ok: boolean; error?: string; tool?: AgentToolDefinition } {
  const tool = getTool(toolName);
  if (!tool) return { ok: false, error: `Unknown tool: ${toolName}` };
  if (tool.enabled === false) return { ok: false, error: `Tool "${toolName}" is disabled` };
  if (Array.isArray(allowedTools) && !allowedTools.includes(toolName)) {
    return { ok: false, error: `Tool "${toolName}" is not permitted for this agent` };
  }
  return { ok: true, tool };
}

export function clearRegistry(): void {
  tools.clear();
}

/** Built-in tool metadata for selectors and empty states. */
export const BUILTIN_AGENT_TOOLS: Array<{
  name: string;
  displayName: string;
  description: string;
}> = [
  { name: 'web_search', displayName: 'Web Search', description: 'Live web search' },
  { name: 'vision', displayName: 'Vision', description: 'Image understanding' },
  { name: 'image_generation', displayName: 'Image Generation', description: 'Create images from text' },
  { name: 'image_edit', displayName: '✏️ Editing image', description: 'Edit uploaded images' },
  { name: 'ocr', displayName: 'OCR', description: 'Extract text from images and PDFs' },
  { name: 'memory', displayName: 'Memory', description: 'Durable user memory' },
  { name: 'canvas', displayName: 'Canvas', description: 'Long-form drafts' },
  { name: 'file_upload', displayName: 'File Upload', description: 'Read uploaded files' },
  { name: 'calculator', displayName: 'Calculator', description: 'Exact arithmetic' },
  { name: 'weather', displayName: 'Weather', description: 'Current weather' },
  { name: 'current_time', displayName: 'Current Time', description: 'Date and time' },
  { name: 'browser_automation', displayName: 'Browser', description: 'Interactive browser automation' },
  { name: 'code_execution', displayName: 'Code Interpreter', description: 'Run Python in a sandbox' },
];

export function initBuiltinToolMetadata(): void {
  if (tools.size) return;
  for (const t of BUILTIN_AGENT_TOOLS) {
    registerTool({
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      validate: (args) => ({ ok: true, args }),
    });
  }
}

export class ToolRegistry {
  register = registerTool;
  get = getTool;
  list = listTools;
  checkPermission = checkPermission;
  clear = clearRegistry;
  init = initBuiltinToolMetadata;
}

export const toolRegistry = new ToolRegistry();
