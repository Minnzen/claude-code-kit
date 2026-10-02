import type { Message } from "../types.js";

/** User turns are indivisible so retained tool results keep their calls and task context. */
export function partitionExchanges(messages: Message[]): {
  systemMessages: Message[];
  exchanges: Message[][];
} {
  const systemMessages: Message[] = [];
  const exchanges: Message[][] = [];
  let current: Message[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemMessages.push(message);
      continue;
    }
    // A leading orphan result has no call to preserve.
    if (message.role === "tool" && current.length === 0 && exchanges.length === 0) continue;
    if (message.role === "user" && current.length > 0) {
      exchanges.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) exchanges.push(current);
  return { systemMessages, exchanges };
}
