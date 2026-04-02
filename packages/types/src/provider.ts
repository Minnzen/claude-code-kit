import type { Message } from "./message";

// ---------------------------------------------------------------------------
// LLM Provider
// ---------------------------------------------------------------------------

/** Provider capability flags. */
export interface ProviderCapabilities {
  supportsToolUse: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsPromptCaching: boolean;
}

/** Tool definition in the provider-agnostic JSON Schema format (sent to the API). */
export interface ToolAPIDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Parameters for a chat completion request. */
export interface ChatParams {
  messages: Message[];
  tools?: ToolAPIDefinition[];
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  signal?: AbortSignal;
  /** Provider-specific options (e.g. Anthropic thinking config). */
  providerOptions?: Record<string, unknown>;
}

/** Reason the model stopped generating. */
export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";

/** Token usage statistics. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

// -- Stream chunks ----------------------------------------------------------

export interface TextDeltaChunk {
  type: "text_delta";
  text: string;
}

export interface ToolUseStartChunk {
  type: "tool_use_start";
  id: string;
  name: string;
}

export interface ToolUseDeltaChunk {
  type: "tool_use_delta";
  id: string;
  partialJson: string;
}

export interface ToolUseEndChunk {
  type: "tool_use_end";
  id: string;
}

export interface ThinkingDeltaChunk {
  type: "thinking_delta";
  text: string;
}

export interface UsageChunk {
  type: "usage";
  usage: TokenUsage;
}

export interface DoneChunk {
  type: "done";
  stopReason: StopReason;
}

export interface ErrorChunk {
  type: "error";
  error: Error;
}

/** Union of all chunk types yielded by a streaming provider. */
export type StreamChunk =
  | TextDeltaChunk
  | ToolUseStartChunk
  | ToolUseDeltaChunk
  | ToolUseEndChunk
  | ThinkingDeltaChunk
  | UsageChunk
  | DoneChunk
  | ErrorChunk;

// -- Provider interface -----------------------------------------------------

/** Abstract LLM provider that streams chat completions. */
export interface LLMProvider {
  /** Human-readable provider name (e.g. "anthropic", "openai"). */
  name: string;
  /** Provider capability flags. */
  capabilities: ProviderCapabilities;

  /** Stream a chat completion. Yields chunks as they arrive. */
  chat(params: ChatParams): AsyncGenerator<StreamChunk>;

  /** Return the default model identifier for this provider. */
  getDefaultModel(): string;

  /** Count tokens in a set of messages (optional, for compaction). */
  countTokens?(messages: Message[]): Promise<number>;

  /** Return the context window size for the given model. */
  getContextWindow?(model?: string): number;
}
