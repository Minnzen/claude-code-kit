import { estimateTotalTokens } from "../context-manager.js";
import type { CompactionStrategy, Message, ToolResultMessage } from "../types.js";

/**
 * Placeholder string substituted for cleared tool-result content. Aligned
 * verbatim with Claude Code's `TOOL_RESULT_CLEARED_MESSAGE`.
 */
export const TOOL_RESULT_CLEARED_MESSAGE = "[Old tool result content cleared]";

/**
 * Default whitelist of tool names whose results are eligible for clearing,
 * mirroring Claude Code's `COMPACTABLE_TOOLS` set in `microCompact.ts`.
 *
 * The intent is to clear results of tools whose output tends to be large
 * and re-derivable (file reads, shell output, search hits, web fetch) while
 * leaving results of bespoke tools alone.
 */
export const DEFAULT_COMPACTABLE_TOOLS: readonly string[] = [
  "Bash",
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
];

export interface MicroCompactionOptions {
  /**
   * How many of the most-recent compactable tool results to keep verbatim.
   * Default: 5 (matches Claude Code's `TIME_BASED_MC_CONFIG_DEFAULTS.keepRecent`).
   * Floored at 1 — clearing every tool result would leave the model with
   * zero working context.
   */
  keepRecentN?: number;
  /**
   * Fraction of the context limit at which `shouldCompact()` returns true.
   * Default: 0.7 — slightly more eager than summarization (0.75) since this
   * strategy is cheap and lossless for decisions.
   */
  thresholdFraction?: number;
  /**
   * Names of tools whose results are eligible for clearing. Tool-call IDs
   * produced by tools NOT in this list are never cleared.
   *
   * - Omit (default): use `DEFAULT_COMPACTABLE_TOOLS` (the 8 names from
   *   Claude Code).
   * - Pass an explicit array: only those tool names are compactable.
   * - Pass `"all"`: every tool's result is compactable.
   */
  compactableTools?: readonly string[] | "all";
}

/**
 * Cheap, deterministic compaction that clears the *content* of older
 * tool-result messages while preserving every other message and the
 * assistant's `toolCalls` array (which is the actual decision trail).
 *
 * Aligned with Claude Code's microcompact strategy
 * (`src/services/compact/microCompact.ts`):
 *
 *   - operates per tool-call id, not per message
 *   - keeps the most-recent N compactable tool results untouched
 *   - replaces older tool-result content with `TOOL_RESULT_CLEARED_MESSAGE`
 *   - filtered by a tool-name whitelist (default: 8 well-known names)
 *   - idempotent: already-cleared messages are not rewritten
 *   - no LLM call, synchronous
 *
 * Use this as the first layer in `LayeredCompaction`; only fall through to
 * `SummarizationCompaction` or `SlidingWindowCompaction` when this is not
 * enough.
 */
export class MicroCompaction implements CompactionStrategy {
  private readonly keepRecentN: number;
  private readonly thresholdFraction: number;
  private readonly compactableTools: Set<string> | null;

  constructor(options: MicroCompactionOptions = {}) {
    this.keepRecentN = Math.max(1, options.keepRecentN ?? 5);
    this.thresholdFraction = options.thresholdFraction ?? 0.7;

    const tools = options.compactableTools ?? DEFAULT_COMPACTABLE_TOOLS;
    this.compactableTools = tools === "all" ? null : new Set(tools);
  }

  shouldCompact(_messages: Message[], tokenCount: number, contextLimit: number): boolean {
    return tokenCount >= contextLimit * this.thresholdFraction;
  }

  /**
   * Synchronous: walks the message array twice — once to learn each
   * `toolCallId -> toolName`, once to rewrite eligible tool results.
   */
  compact(messages: Message[], _maxTokens: number): Message[] {
    if (messages.length === 0) return messages;

    // 1. Build the toolCallId -> toolName lookup so we can apply the
    //    whitelist. Tool-result messages do not carry the tool name; only
    //    the corresponding assistant message's `toolCalls[].name` does.
    const toolNameById = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        toolNameById.set(tc.id, tc.name);
      }
    }

    // 2. Collect indices of compactable tool-result messages, in chronological
    //    order. A message is compactable iff its tool name is in the whitelist
    //    (or no whitelist is configured).
    const compactableIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role !== "tool") continue;
      if (this.compactableTools !== null) {
        const name = toolNameById.get(msg.toolCallId);
        if (name === undefined || !this.compactableTools.has(name)) continue;
      }
      compactableIndices.push(i);
    }

    // 3. Keep the last keepRecentN; clear the rest. `Math.max(1, ...)` in the
    //    constructor guarantees at least one survives even if keepRecentN
    //    was passed as 0.
    if (compactableIndices.length <= this.keepRecentN) return messages;
    const clearIndices = new Set(
      compactableIndices.slice(0, compactableIndices.length - this.keepRecentN),
    );

    // 4. Rewrite — preserves `toolCallId`, `isError`, etc.; only `content`
    //    changes. Skip already-cleared messages so the operation is
    //    idempotent and safe to call inside a LayeredCompaction loop.
    return messages.map((msg, idx) => {
      if (!clearIndices.has(idx)) return msg;
      const tool = msg as ToolResultMessage;
      if (tool.content === TOOL_RESULT_CLEARED_MESSAGE) return msg;
      const cleared: ToolResultMessage = {
        role: "tool",
        toolCallId: tool.toolCallId,
        content: TOOL_RESULT_CLEARED_MESSAGE,
        ...(tool.isError !== undefined ? { isError: tool.isError } : {}),
      };
      return cleared;
    });
  }

  /**
   * Convenience: returns the same shape as
   * `SummarizationCompaction.compactAsync` for callers (e.g. instrumentation
   * around `LayeredCompaction`) that want before/after token stats.
   */
  compactWithStats(messages: Message[]): {
    messages: Message[];
    tokensBefore: number;
    tokensAfter: number;
    strategy: string;
  } {
    const tokensBefore = estimateTotalTokens(messages);
    const compacted = this.compact(messages, Number.POSITIVE_INFINITY);
    return {
      messages: compacted,
      tokensBefore,
      tokensAfter: estimateTotalTokens(compacted),
      strategy: "micro-compact",
    };
  }
}
