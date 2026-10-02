import { NoopCompaction } from "./compaction/interface.js";
import type { CompactionStrategy, LLMProvider, Message } from "./types.js";

/**
 * Estimate token count for a message using the ~4 chars/token heuristic.
 */
export function estimateTokens(message: Message): number {
  let text: string;
  if (typeof message.content === "string") {
    text = message.content;
  } else {
    text = message.content.map((part) => (part.type === "text" ? part.text : "[image]")).join("");
  }

  // Add overhead for tool calls on assistant messages
  if (message.role === "assistant" && message.toolCalls) {
    for (const tc of message.toolCalls) {
      text += tc.name + JSON.stringify(tc.input);
    }
  }

  return Math.ceil(text.length / 4);
}

/**
 * Estimate total token count for an array of messages.
 */
export function estimateTotalTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg);
  }
  return total;
}

/**
 * Manages the conversation context window, triggering compaction
 * when approaching the token limit.
 */
export class ContextManager {
  private contextLimit: number;
  private compactionStrategy: CompactionStrategy;
  private provider: LLMProvider | null;

  /** Compact when usage exceeds this fraction of the context limit */
  private compactionThreshold = 0.85;

  constructor(options: {
    contextLimit?: number;
    compactionStrategy?: CompactionStrategy;
    provider?: LLMProvider;
  }) {
    this.contextLimit = options.contextLimit ?? 100_000;
    this.compactionStrategy = options.compactionStrategy ?? new NoopCompaction();
    this.provider = options.provider ?? null;
  }

  /**
   * Count tokens for the messages. Uses provider.countTokens if available,
   * otherwise falls back to heuristic estimation.
   */
  async countTokens(messages: Message[]): Promise<number> {
    if (this.provider?.countTokens) {
      return this.provider.countTokens(messages);
    }
    return estimateTotalTokens(messages);
  }

  /**
   * Check if compaction is needed and apply it if so.
   * Returns the (possibly compacted) messages array.
   *
   * Threshold policy:
   *   - if the strategy implements `shouldCompact`, delegate to it
   *     (so options like `MicroCompaction.thresholdFraction` actually take
   *     effect)
   *   - otherwise fall back to the manager's built-in 0.85 threshold
   */
  async maybeCompact(messages: Message[], abortSignal?: AbortSignal): Promise<Message[]> {
    abortSignal?.throwIfAborted();
    const tokenCount = await this.countTokens(messages);
    abortSignal?.throwIfAborted();

    const shouldCompact = this.compactionStrategy.shouldCompact
      ? this.compactionStrategy.shouldCompact(messages, tokenCount, this.contextLimit)
      : tokenCount > this.contextLimit * this.compactionThreshold;

    if (shouldCompact) {
      const targetTokens = Math.floor(this.contextLimit * 0.6);
      return await this.compactionStrategy.compact(messages, targetTokens, abortSignal);
    }

    return messages;
  }

  /**
   * Force compaction (e.g. after receiving a "context too long" error from the API).
   */
  async forceCompact(messages: Message[], abortSignal?: AbortSignal): Promise<Message[]> {
    abortSignal?.throwIfAborted();
    const targetTokens = Math.floor(this.contextLimit * 0.5);
    return await this.compactionStrategy.compact(messages, targetTokens, abortSignal);
  }

  setContextLimit(limit: number): void {
    this.contextLimit = limit;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  setCompactionStrategy(strategy: CompactionStrategy): void {
    this.compactionStrategy = strategy;
  }
}
