import type { ChatOptions, LLMProvider, Message, StreamChunk } from "../types.js";

/**
 * Mock provider for testing. Takes a queue of scripted responses —
 * each run() call shifts one response off the queue and streams it.
 *
 * @example
 * ```ts
 * const provider = new MockProvider([
 *   [{ type: "text", text: "Hello!" }, { type: "done" }],
 *   [{ type: "text", text: "Goodbye!" }, { type: "done" }],
 * ]);
 * ```
 */
export class MockProvider implements LLMProvider {
  private queue: StreamChunk[][];
  private callLog: ChatOptions[] = [];

  constructor(responses: StreamChunk[][]) {
    this.queue = [...responses];
  }

  async *chat(options: ChatOptions): AsyncGenerator<StreamChunk> {
    this.callLog.push(options);

    const response = this.queue.shift();
    if (!response) {
      throw new Error("MockProvider: no more scripted responses in queue");
    }

    for (const chunk of response) {
      yield chunk;
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        total += Math.ceil(msg.content.length / 4);
      }
    }
    return total;
  }

  /** Get the log of all chat() calls made to this provider. */
  getCalls(): ChatOptions[] {
    return this.callLog;
  }

  /** Check if all scripted responses have been consumed. */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
