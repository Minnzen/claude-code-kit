import type { Message, Session } from "../types.js";

/**
 * In-memory session that holds conversation messages.
 * Messages are lost when the process exits.
 */
export class InMemorySession implements Session {
  private messages: Message[] = [];

  getMessages(): Message[] {
    return [...this.messages];
  }

  setMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  clear(): void {
    this.messages = [];
  }
}
