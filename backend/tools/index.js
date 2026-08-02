import { registerTool, listTools, getFunctionDeclarations, executeTool, getTool } from "./registry.js";
import { webSearchTool } from "./implementations/webSearch.js";
import { imageGenerationTool } from "./implementations/imageGeneration.js";
import { visionTool } from "./implementations/vision.js";
import { calculatorTool } from "./implementations/calculator.js";
import { dateTimeTool } from "./implementations/dateTime.js";
import { weatherTool } from "./implementations/weather.js";
import { fileReaderTool } from "./implementations/fileReader.js";
import { memoryTool } from "./implementations/memory.js";
import { codeExecutionTool } from "./implementations/codeExecution.js";
import { browserAutomationTool } from "./implementations/browserAutomation.js";

let initialized = false;

/** Register all built-in VANI tools once. */
export function initTools() {
  if (initialized) return listTools({ includeDisabled: true });

  const builtins = [
    webSearchTool,
    imageGenerationTool,
    visionTool,
    calculatorTool,
    dateTimeTool,
    weatherTool,
    fileReaderTool,
    memoryTool,
    codeExecutionTool,
    browserAutomationTool,
  ];

  for (const tool of builtins) {
    registerTool(tool);
  }

  initialized = true;
  return listTools({ includeDisabled: true });
}

export {
  registerTool,
  listTools,
  getFunctionDeclarations,
  executeTool,
  getTool,
};
