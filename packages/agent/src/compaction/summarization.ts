import { estimateTotalTokens } from "../context-manager.js";
import type {
  AssistantMessage,
  CompactionStrategy,
  LLMProvider,
  Message,
  UserMessage,
} from "../types.js";

export interface CompactionResult {
  /** The compacted message array. */
  messages: Message[];
  /** Estimated token count before compaction. */
  tokensBefore: number;
  /** Estimated token count after compaction. */
  tokensAfter: number;
  /** Name of the strategy that was applied. */
  strategy: string;
}

const SUMMARY_PROMPT =
  "Please summarize the following conversation history concisely. " +
  "Capture the key information, decisions, and context needed to continue " +
  "the conversation. Be comprehensive but brief.";

/**
 * LLM-based compaction that summarizes older messages and keeps only
 * the most recent N messages verbatim.
 *
 * Implements `CompactionStrategy` so it can be used with `AgentConfig.compactionStrategy`.
 * The LLM provider must be passed in the constructor since the `compact()` interface
 * only receives `(messages, maxTokens)`.
 *
 * The synchronous `compact()` method (required by the interface) kicks off an
 * async summarization internally. Use `compactAsync()` when you need the full
 * `CompactionResult` with token stats.
 */
export class SummarizationCompaction implements CompactionStrategy {
  private keepRecentN: number;
  private thresholdFraction: number;
  private summaryMaxTokens: number;
  private summaryModel: string;
  private provider: LLMProvider;

  constructor(
    provider: LLMProvider,
    options: {
      keepRecentN?: number;
      thresholdFraction?: number;
      summaryMaxTokens?: number;
      /** Model to use for generating summaries. Defaults to "claude-3-5-haiku-20241022". */
      summaryModel?: string;
    } = {},
  ) {
    this.provider = provider;
    this.keepRecentN = options.keepRecentN ?? 10;
    this.thresholdFraction = options.thresholdFraction ?? 0.75;
    this.summaryMaxTokens = options.summaryMaxTokens ?? 2000;
    this.summaryModel = options.summaryModel ?? "claude-3-5-haiku-20241022";
  }

  /** Return true when the current usage exceeds the configured threshold. */
  shouldCompact(_messages: Message[], tokenCount: number, contextLimit: number): boolean {
    return tokenCount >= contextLimit * this.thresholdFraction;
  }

  /**
   * Async compaction conforming to the CompactionStrategy interface.
   * Uses the LLM provider to summarize older messages before dropping them.
   */
  async compact(messages: Message[], _maxTokens: number): Promise<Message[]> {
    const result = await this.compactAsync(messages);
    return result.messages;
  }

  /**
   * Async compaction that uses the LLM provider to summarize older messages.
   * Returns a `CompactionResult` with full token stats.
   */
  async compactAsync(messages: Message[]): Promise<CompactionResult> {
    const tokensBefore = estimateTotalTokens(messages);

    // Separate system messages (always kept verbatim)
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    // If there is nothing to summarize, return as-is
    if (conversationMessages.length <= this.keepRecentN) {
      return {
        messages,
        tokensBefore,
        tokensAfter: tokensBefore,
        strategy: "summarization",
      };
    }

    const toSummarize = conversationMessages.slice(0, -this.keepRecentN);
    const toKeep = conversationMessages.slice(-this.keepRecentN);

    // Build a readable transcript of the messages to summarize
    const transcript = toSummarize
      .map((m) => {
        const role = m.role.toUpperCase();
        const text =
          typeof m.content === "string"
            ? m.content
            : m.content.map((part) => (part.type === "text" ? part.text : "[image]")).join("");
        return `${role}: ${text}`;
      })
      .join("\n\n");

    // Ask the provider to produce a summary
    const summaryMessages: Message[] = [
      {
        role: "user",
        content: `${SUMMARY_PROMPT}\n\n---\n\n${transcript}`,
      } satisfies UserMessage,
    ];

    let summaryText = "";
    const stream = this.provider.chat({
      model: this.summaryModel,
      messages: summaryMessages,
      maxTokens: this.summaryMaxTokens,
    });

    for await (const chunk of stream) {
      if (chunk.type === "text" && chunk.text) {
        summaryText += chunk.text;
      }
    }

    // Construct the compacted history
    const summaryUserMessage: UserMessage = {
      role: "user",
      content: `[Summary of earlier conversation]\n\n${summaryText}`,
    };

    const understoodMessage: AssistantMessage = {
      role: "assistant",
      content: "Understood.",
    };

    const compactedMessages: Message[] = [
      ...systemMessages,
      summaryUserMessage,
      understoodMessage,
      ...toKeep,
    ];

    return {
      messages: compactedMessages,
      tokensBefore,
      tokensAfter: estimateTotalTokens(compactedMessages),
      strategy: "summarization",
    };
  }
}
