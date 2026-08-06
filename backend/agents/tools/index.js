/**
 * Register all built-in agent tools.
 * Add future tools here (or call registerAgentTool from plugins) —
 * AgentManager never needs to change.
 */

import { registerAgentTool, listAgentTools } from "../ToolRegistry.js";
import {
  webSearchAgentTool,
  visionAgentTool,
  imageGenerationAgentTool,
  imageEditAgentTool,
  ocrAgentTool,
  memoryAgentTool,
  calculatorAgentTool,
  weatherAgentTool,
  currentTimeAgentTool,
  fileUploadAgentTool,
  browserAutomationAgentTool,
  codeExecutionAgentTool,
} from "./adapters.js";
import { canvasAgentTool } from "./canvas.js";

let initialized = false;

export function initAgentTools() {
  if (initialized) return listAgentTools({ includeDisabled: true });

  const builtins = [
    webSearchAgentTool,
    visionAgentTool,
    imageGenerationAgentTool,
    imageEditAgentTool,
    ocrAgentTool,
    memoryAgentTool,
    canvasAgentTool,
    fileUploadAgentTool,
    calculatorAgentTool,
    weatherAgentTool,
    currentTimeAgentTool,
    browserAutomationAgentTool,
    codeExecutionAgentTool,
  ];

  for (const tool of builtins) {
    registerAgentTool(tool);
  }

  initialized = true;
  return listAgentTools({ includeDisabled: true });
}

export {
  webSearchAgentTool,
  visionAgentTool,
  imageGenerationAgentTool,
  imageEditAgentTool,
  ocrAgentTool,
  memoryAgentTool,
  canvasAgentTool,
  fileUploadAgentTool,
  calculatorAgentTool,
  weatherAgentTool,
  currentTimeAgentTool,
  browserAutomationAgentTool,
  codeExecutionAgentTool,
};
