import { estimateTotalTokens } from "../context-manager.js";
import type { CompactionStrategy, Message } from "../types.js";

/**
 * Runs a sequence of compaction strategies in order, stopping as soon as the
 * message array fits the token budget. Each layer's output becomes the next
 * layer's input.
 *
 * Recommended layering (cheapest, lowest information loss first):
 *
 *   new LayeredCompaction([
 *     new ToolResultClearingCompaction({ keepRecentN: 20 }),  // free, lossless for decisions
 *     new SummarizationCompaction(provider, { keepRecentN: 10 }), // 1 LLM call, lossy
 *     new SlidingWindowCompaction(),                          // free, very lossy fallback
 *   ])
 *
 * After each layer the resulting token count is re-estimated. If it is at or
 * below `maxTokens`, the loop short-circuits and the remaining layers are
 * skipped.
 *
 * Empty `layers` arrays are valid (returns the input unchanged).
 */
export class LayeredCompaction implements CompactionStrategy {
  private readonly layers: CompactionStrategy[];

  constructor(layers: CompactionStrategy[]) {
    this.layers = layers;
  }

  async compact(messages: Message[], maxTokens: number): Promise<Message[]> {
    if (messages.length === 0 || this.layers.length === 0) return messages;

    let current = messages;
    let currentTokens = estimateTotalTokens(current);

    // Already within budget — nothing to do.
    if (currentTokens <= maxTokens) return current;

    for (const layer of this.layers) {
      // Each layer may be sync or async; await handles both.
      current = await layer.compact(current, maxTokens);
      currentTokens = estimateTotalTokens(current);
      if (currentTokens <= maxTokens) break;
    }

    return current;
  }
}
