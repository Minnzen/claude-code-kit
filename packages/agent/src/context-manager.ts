import type { CompactionStrategy, LLMProvider, Message } from "./types.js";
import { NoopCompaction } from "./compaction/interface.js";

/**
 * Estimate token count for a message using the ~4 chars/token heuristic.
 */
export function estimateTokens(message: Message): number {
  let text: string;
  if (typeof message.content === "string") {
    text = message.content;
  } else {
    text = message.content
      .map((part) => (part.type === "text" ? part.text : "[image]"))
      .join("");
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
   */
  async maybeCompact(messages: Message[]): Promise<Message[]> {
    const tokenCount = await this.countTokens(messages);
    const threshold = this.contextLimit * this.compactionThreshold;

    if (tokenCount > threshold) {
      const targetTokens = Math.floor(this.contextLimit * 0.6);
      return this.compactionStrategy.compact(messages, targetTokens);
    }

    return messages;
  }

  /**
   * Force compaction (e.g. after receiving a "context too long" error from the API).
   */
  forceCompact(messages: Message[]): Message[] {
    const targetTokens = Math.floor(this.contextLimit * 0.5);
    return this.compactionStrategy.compact(messages, targetTokens);
  }

  setContextLimit(limit: number): void {
    this.contextLimit = limit;
  }

  setCompactionStrategy(strategy: CompactionStrategy): void {
    this.compactionStrategy = strategy;
  }
}
