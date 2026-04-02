import type { Message } from "./message";
import type { CompactionStrategy } from "./context";
import type { PermissionHandler } from "./permission";
import type { LLMProvider, TokenUsage } from "./provider";
import type { SessionStore } from "./session";
import type { ToolDefinition } from "./tool";

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** The LLM provider to use. */
  provider: LLMProvider;
  /** Tools available to the agent. */
  tools?: ToolDefinition[];
  /** Override the provider's default model. */
  model?: string;
  /** System prompt prepended to every conversation. */
  systemPrompt?: string;
  /** Maximum number of agent loop iterations before stopping. */
  maxIterations?: number;
  /** Maximum tokens per LLM response. */
  maxTokens?: number;
  /** Sampling temperature. */
  temperature?: number;
  /** Compaction strategy for managing context length. */
  compaction?: CompactionStrategy;
  /** Session store for persistence across restarts. */
  session?: SessionStore;
  /** Permission handler for tool authorization. */
  onPermission?: PermissionHandler;
  /** Callback for agent lifecycle events. */
  onEvent?: (event: AgentEvent) => void;
  /** Working directory for file-system tools. */
  workingDirectory?: string;
  /** Provider-specific options passed through to every chat call. */
  providerOptions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent events
// ---------------------------------------------------------------------------

export interface TextEvent {
  type: "text";
  /** Incremental text delta. */
  content: string;
  /** Full accumulated text so far. */
  accumulated: string;
}

export interface ThinkingEvent {
  type: "thinking";
  content: string;
}

export interface ToolStartEvent {
  type: "tool_start";
  toolCallId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolProgressEvent {
  type: "tool_progress";
  toolCallId: string;
  percent?: number;
  message?: string;
}

export interface ToolEndEvent {
  type: "tool_end";
  toolCallId: string;
  result: string;
  isError: boolean;
}

export interface CompactEvent {
  type: "compact";
  tokensBefore: number;
  tokensAfter: number;
  strategy: string;
}

export interface UsageEvent {
  type: "usage";
  usage: TokenUsage;
}

export interface ErrorEvent {
  type: "error";
  error: Error;
}

export interface TurnEvent {
  type: "turn";
  turnNumber: number;
}

export interface DoneEvent {
  type: "done";
  /** Final assistant text content. */
  content: string;
  /** Reason the agent stopped. */
  reason: "end_turn" | "max_iterations" | "error" | "aborted";
  /** Total number of agent loop turns. */
  totalTurns: number;
  /** Aggregated token usage across all turns. */
  totalUsage: TokenUsage;
  /** Final message array (full conversation). */
  messages: Message[];
}

/** Union of all events emitted during an agent run. */
export type AgentEvent =
  | TextEvent
  | ThinkingEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolEndEvent
  | CompactEvent
  | UsageEvent
  | ErrorEvent
  | TurnEvent
  | DoneEvent;
