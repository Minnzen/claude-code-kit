import type { CompactionStrategy, Message } from "../types.js";

export type { CompactionStrategy };

/**
 * No-op compaction strategy that returns messages unchanged.
 * Used when no compaction is desired.
 */
export class NoopCompaction implements CompactionStrategy {
  compact(messages: Message[], _maxTokens: number): Message[] {
    return messages;
  }
}
