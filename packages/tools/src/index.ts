export { bashTool } from "./bash.js";
export { readTool } from "./read.js";
export { editTool } from "./edit.js";
export { writeTool } from "./write.js";
export { globTool } from "./glob.js";
export { grepTool } from "./grep.js";
export { webFetchTool } from "./web-fetch.js";
export { webSearchTool } from "./web-search.js";
export { createTaskTool } from "./task.js";
export type { Task, TaskToolInstance } from "./task.js";
export { createSubagentTool } from "./subagent.js";
export type { SubagentConfig, SubagentFactoryInput } from "./subagent.js";

import type { ToolDefinition } from "@claude-code-kit/agent";
import { bashTool } from "./bash.js";
import { readTool } from "./read.js";
import { editTool } from "./edit.js";
import { writeTool } from "./write.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";

/** All built-in tools as an array, ready to pass to AgentConfig.tools */
export const builtinTools: ToolDefinition[] = [
  bashTool,
  readTool,
  editTool,
  writeTool,
  globTool,
  grepTool,
  webFetchTool,
  webSearchTool,
];
