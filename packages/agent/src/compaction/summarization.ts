import { estimateTotalTokens } from "../context-manager.js";
import type {
  AssistantMessage,
  CompactionStrategy,
  LLMProvider,
  Message,
  UserMessage,
} from "../types.js";
import { partitionExchanges } from "./exchanges.js";
import { TOOL_RESULT_CLEARED_MESSAGE } from "./micro-compact.js";

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
  "Capture the user's task, constraints, key information, decisions, tool actions, " +
  "and unfinished work needed to continue the conversation. Be comprehensive but brief.";

async function waitForChunk<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Compaction aborted", "AbortError"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([pending, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * LLM-based compaction that summarizes older messages and keeps only
 * at least the most recent N messages, extending to the start of a user turn.
 * Complete tool exchanges and their user instructions are never split.
 *
 * Implements `CompactionStrategy` so it can be used with `AgentConfig.compactionStrategy`.
 * The LLM provider must be passed in the constructor since the `compact()` interface
 * only receives `(messages, maxTokens)`.
 *
 * Use `compactAsync()` when you need the full
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
    this.keepRecentN = Math.max(1, Math.floor(options.keepRecentN ?? 10));
    if (!Number.isFinite(this.keepRecentN)) throw new RangeError("keepRecentN must be finite.");
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
  async compact(
    messages: Message[],
    _maxTokens: number,
    abortSignal?: AbortSignal,
  ): Promise<Message[]> {
    const result = await this.compactAsync(messages, abortSignal);
    return result.messages;
  }

  /**
   * Async compaction that uses the LLM provider to summarize older messages.
   * Returns a `CompactionResult` with full token stats.
   */
  async compactAsync(messages: Message[], abortSignal?: AbortSignal): Promise<CompactionResult> {
    abortSignal?.throwIfAborted();
    const tokensBefore = estimateTotalTokens(messages);

    // Separate system messages (always kept verbatim)
    const { systemMessages, exchanges } = partitionExchanges(messages);
    let boundary = exchanges.length;
    let keptCount = 0;
    while (boundary > 0 && keptCount < this.keepRecentN) {
      keptCount += exchanges[--boundary]!.length;
    }

    // If there is nothing to summarize, return as-is
    if (boundary === 0) {
      return {
        messages,
        tokensBefore,
        tokensAfter: tokensBefore,
        strategy: "summarization",
      };
    }

    const toSummarize = exchanges.slice(0, boundary).flat();
    const toKeep = exchanges.slice(boundary).flat();

    // Build a readable transcript of the messages to summarize. Skip tool
    // results whose content has already been cleared by an earlier layer
    // (e.g. MicroCompaction inside a LayeredCompaction stack) — feeding the
    // sentinel into the summarizer would just produce a summary that
    // literally contains "[Old tool result content cleared]" lines.
    const transcript = [...systemMessages, ...toSummarize]
      .filter((m) => !(m.role === "tool" && m.content === TOOL_RESULT_CLEARED_MESSAGE))
      .map((m) => {
        const role = m.role.toUpperCase();
        const text =
          typeof m.content === "string"
            ? m.content
            : m.content.map((part) => (part.type === "text" ? part.text : "[image]")).join("");
        const calls =
          m.role === "assistant"
            ? m.toolCalls
                ?.map((call) => `TOOL CALL ${call.id}: ${call.name} ${JSON.stringify(call.input)}`)
                .join("\n")
            : undefined;
        const label =
          m.role === "tool" ? `${role} RESULT ${m.toolCallId}${m.isError ? " (error)" : ""}` : role;
        return `${label}: ${text}${calls ? `\n${calls}` : ""}`;
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
      signal: abortSignal,
    });

    try {
      while (true) {
        abortSignal?.throwIfAborted();
        const next = await waitForChunk(stream.next(), abortSignal);
        if (next.done) break;
        const chunk = next.value;
        if (chunk.type === "error") throw chunk.error;
        if (chunk.type === "done") break;
        if (chunk.type === "text" && chunk.text) summaryText += chunk.text;
      }
    } finally {
      // A provider ignoring cancellation may still be stuck in next(); cleanup cannot block it.
      void stream.return(undefined).catch(() => {});
    }
    abortSignal?.throwIfAborted();
    if (!summaryText.trim()) throw new Error("Summary provider returned an empty summary.");

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
