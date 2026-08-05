/**
 * Backward-compatible shim — prefer importing from `./memory/index.js`.
 * Kept so existing tool imports (`../services/memoryService.js`) keep working.
 */
export {
  saveMemory,
  recallMemory,
  listMemories,
  deleteMemory,
  createMemory,
  formatMemoriesForPrompt,
  isMemoryEnabled,
} from "./memory/index.js";
