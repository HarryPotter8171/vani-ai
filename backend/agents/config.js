/**
 * Agent runtime configuration — timeouts, retries, rate limits, caching.
 */

export const AGENT_CONFIG = {
  maxPlanSteps: 12,
  maxRetriesPerStep: 2,
  stepTimeoutMs: 45_000,
  planTimeoutMs: 30_000,
  verifyTimeoutMs: 25_000,
  finalAnswerTimeoutMs: 60_000,
  maxParallelTools: 3,
  sessionTtlMs: 30 * 60_000,
  maxSessionsPerUser: 8,
  rateLimit: {
    windowMs: 60_000,
    maxRuns: 20,
  },
  cacheTtlMs: 5 * 60_000,
  cacheMaxEntries: 200,
};

export const AGENT_TYPES = {
  general: {
    id: "general",
    name: "General Assistant",
    description: "Plans and executes multi-step tasks across all available tools.",
    systemFocus:
      "You are VANI AI acting as a versatile assistant. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Break work into clear steps and use tools when they improve accuracy. VANI can generate and edit images — call image_generation or image_edit immediately for visual requests; never claim you are text-only. When an exam/PDF/document is already uploaded, solve the full request against it: if the user asks to solve the whole paper / complete the exam / give all correct options, answer every question sequentially in one continuous response — never refuse or ask them to pick one question. Use file_reader to continue through large chunked documents until finished.",
    tools: [
      "web_search",
      "vision",
      "image_generation",
      "image_edit",
      "ocr",
      "memory",
      "canvas",
      "file_upload",
      "calculator",
      "weather",
      "current_time",
      "browser_automation",
      "code_execution",
    ],
  },
  coding: {
    id: "coding",
    name: "Coding Agent",
    description: "Software engineering — design, debug, refactor, and explain code.",
    systemFocus:
      "You are VANI AI acting as a senior software engineer. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Prefer precise, production-ready solutions. Use code_execution to run and verify Python, calculator for exact math, file/vision for attached code, canvas for larger drafts, and image_generation/image_edit for UI mockups or diagrams when asked.",
    tools: [
      "calculator",
      "file_upload",
      "vision",
      "image_generation",
      "image_edit",
      "ocr",
      "memory",
      "canvas",
      "current_time",
      "code_execution",
    ],
  },
  research: {
    id: "research",
    name: "Research Agent",
    description: "Deep research with web sources, synthesis, and citations.",
    systemFocus:
      "You are VANI AI acting as a research analyst. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Search thoroughly, read sources carefully, cross-check claims, and cite URLs when available. Use code_execution for quantitative analysis of gathered data. Use image_generation when a diagram or illustration would help communicate findings.",
    tools: [
      "web_search",
      "memory",
      "vision",
      "image_generation",
      "image_edit",
      "ocr",
      "file_upload",
      "current_time",
      "browser_automation",
      "code_execution",
    ],
  },
  writing: {
    id: "writing",
    name: "Writing Agent",
    description: "Drafts, edits, and polishes long-form writing.",
    systemFocus:
      "You are VANI AI acting as an expert writer and editor. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Focus on clarity, structure, and voice. Use memory for preferences, canvas for longer drafts, and image_generation/image_edit when the user wants accompanying visuals.",
    tools: [
      "memory",
      "canvas",
      "file_upload",
      "web_search",
      "current_time",
      "image_generation",
      "image_edit",
      "ocr",
      "vision",
    ],
  },
  data_analysis: {
    id: "data_analysis",
    name: "Data Analysis Agent",
    description: "Analyzes tables, charts, metrics, and uploaded data files.",
    systemFocus:
      "You are VANI AI acting as a data analyst. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Be quantitative, show workings, and ground claims in the provided data or calculations. Prefer code_execution (pandas/numpy/matplotlib) for tables, stats, and charts; publish charts to canvas when helpful. Use vision for chart images and image tools only when the user explicitly asks to generate or edit a visual. Use ocr to extract text/tables from scanned documents and screenshots.",
    tools: [
      "calculator",
      "file_upload",
      "vision",
      "ocr",
      "image_generation",
      "image_edit",
      "memory",
      "current_time",
      "code_execution",
      "canvas",
    ],
  },
  web: {
    id: "web",
    name: "Web Agent",
    description:
      "Live web lookup and browser automation — news, weather, time, and interactive browsing.",
    systemFocus:
      "You are VANI AI acting as a live-information agent. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Prefer fresh web/weather/time data over prior knowledge for anything that changes. Use browser_automation for interactive site tasks when the user approves.",
    tools: [
      "web_search",
      "weather",
      "current_time",
      "memory",
      "browser_automation",
      "image_generation",
      "ocr",
      "vision",
    ],
  },
};

export function getAgentType(typeId) {
  return AGENT_TYPES[typeId] || AGENT_TYPES.general;
}

export function listAgentTypes() {
  return Object.values(AGENT_TYPES).map(({ id, name, description, tools }) => ({
    id,
    name,
    description,
    tools,
  }));
}
