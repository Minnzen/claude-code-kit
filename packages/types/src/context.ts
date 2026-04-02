import type { Message } from "./message";

// ---------------------------------------------------------------------------
// Context management
// ---------------------------------------------------------------------------

/** Result of a compaction operation. */
export interface CompactionResult {
  /** The compacted message array. */
  messages: Message[];
  /** Token count before compaction. */
  tokensBefore: number;
  /** Token count after compaction. */
  tokensAfter: number;
  /** Name of the strategy that was applied. */
  strategy: string;
}

/** Strategy for compacting conversation context when approaching limits. */
export interface CompactionStrategy {
  /** Determine whether compaction should be triggered. */
  shouldCompact(messages: Message[], currentTokens: number, maxTokens: number): boolean;
  /** Perform compaction and return the result. */
  compact(messages: Message[], currentTokens: number, maxTokens: number): Promise<CompactionResult>;
}

/** Token counting interface used by compaction and context management. */
export interface TokenCounter {
  /** Count tokens in a set of messages. */
  count(messages: Message[]): Promise<number>;
  /** Estimate tokens consumed by tool definitions (optional). */
  estimateToolTokens?(toolCount: number): number;
  /** Return the context window size for the current model. */
  getContextWindow?(): number;
}
