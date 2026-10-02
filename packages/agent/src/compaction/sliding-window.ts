import { estimateTotalTokens } from "../context-manager.js";
import type { CompactionStrategy, Message } from "../types.js";
import { partitionExchanges } from "./exchanges.js";

/**
 * Keeps system messages and a suffix of complete user turns within the token budget.
 * The newest turn is always retained, even when it exceeds the budget, so compaction
 * cannot discard the task currently being performed. Token targets are best effort.
 */
export class SlidingWindowCompaction implements CompactionStrategy {
  compact(messages: Message[], maxTokens: number, abortSignal?: AbortSignal): Message[] {
    abortSignal?.throwIfAborted();
    const { systemMessages, exchanges } = partitionExchanges(messages);
    let totalTokens = estimateTotalTokens(systemMessages);
    const kept: Message[][] = [];

    for (let i = exchanges.length - 1; i >= 0; i--) {
      const exchange = exchanges[i]!;
      const exchangeTokens = estimateTotalTokens(exchange);
      if (kept.length > 0 && totalTokens + exchangeTokens > maxTokens) break;
      kept.unshift(exchange);
      totalTokens += exchangeTokens;
    }

    return [...systemMessages, ...kept.flat()];
  }
}
