import { estimateTokens } from "../context-manager.js";
import type { CompactionStrategy, Message } from "../types.js";

/**
 * Sliding window compaction: keeps the system message (if any) plus
 * the most recent messages that fit within the token budget.
 *
 * When compacting, older messages are dropped from the middle, preserving
 * the system message at the start and the most recent messages at the end.
 */
export class SlidingWindowCompaction implements CompactionStrategy {
  compact(messages: Message[], maxTokens: number): Message[] {
    if (messages.length === 0) return messages;

    // Separate system messages from conversation messages
    const systemMessages: Message[] = [];
    const conversationMessages: Message[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessages.push(msg);
      } else {
        conversationMessages.push(msg);
      }
    }

    // Start with system messages (always keep)
    let totalTokens = 0;
    for (const msg of systemMessages) {
      totalTokens += estimateTokens(msg);
    }

    // If system messages alone exceed the budget, return just them
    if (totalTokens >= maxTokens) {
      return systemMessages;
    }

    const remainingBudget = maxTokens - totalTokens;

    // Walk backwards from most recent, keeping messages that fit
    const kept: Message[] = [];
    let usedTokens = 0;

    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const msg = conversationMessages[i]!;
      const msgTokens = estimateTokens(msg);
      if (usedTokens + msgTokens > remainingBudget) {
        break;
      }
      kept.unshift(msg);
      usedTokens += msgTokens;
    }

    // Ensure we don't start with a tool result message (orphaned from its assistant)
    while (kept.length > 0 && kept[0]!.role === "tool") {
      kept.shift();
    }

    return [...systemMessages, ...kept];
  }
}
