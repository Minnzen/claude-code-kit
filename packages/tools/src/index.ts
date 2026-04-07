export { bashTool } from "./bash.js";
export { editTool } from "./edit.js";
export { enterWorktreeTool } from "./enter-worktree.js";
export { exitWorktreeTool } from "./exit-worktree.js";
export { globTool } from "./glob.js";
export { grepTool } from "./grep.js";
export type { LspConnection } from "./lsp.js";
export { createLspTool } from "./lsp.js";
export { notebookEditTool } from "./notebook-edit.js";
export { readTool } from "./read.js";
export type { SubagentConfig, SubagentFactoryInput } from "./subagent.js";
export { createSubagentTool } from "./subagent.js";
export type { Task, TaskToolInstance, TaskToolSet } from "./task.js";
export { createTaskTool } from "./task.js";
export { webFetchTool } from "./web-fetch.js";
export { webSearchTool } from "./web-search.js";
export { writeTool } from "./write.js";

import type { ToolDefinition } from "@claude-code-kit/agent";
import { bashTool } from "./bash.js";
import { editTool } from "./edit.js";
import { enterWorktreeTool } from "./enter-worktree.js";
import { exitWorktreeTool } from "./exit-worktree.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { readTool } from "./read.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";
import { writeTool } from "./write.js";

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
  enterWorktreeTool,
  exitWorktreeTool,
];
