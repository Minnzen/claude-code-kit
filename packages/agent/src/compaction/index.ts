/**
 * Compaction strategies for the agent's context window.
 *
 * See `agent/README.md#context-compaction` for a comparison of the
 * available strategies and recommendations on how to combine them.
 */

export { NoopCompaction } from "./interface.js";
export { LayeredCompaction } from "./layered.js";
export {
  DEFAULT_COMPACTABLE_TOOLS,
  MicroCompaction,
  type MicroCompactionOptions,
  TOOL_RESULT_CLEARED_MESSAGE,
} from "./micro-compact.js";
export { SlidingWindowCompaction } from "./sliding-window.js";
export type { CompactionResult } from "./summarization.js";
export { SummarizationCompaction } from "./summarization.js";
