/**
 * Type definitions for @claude-code-kit/agent.
 * This is the single source of truth for all agent-related types.
 */

import type { z } from "zod";

// ---------------------------------------------------------------------------
// Content parts & Messages
// ---------------------------------------------------------------------------

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image";
  data: string;
  mediaType: string;
}

export type ContentPart = TextContentPart | ImageContentPart;

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  content: string | ContentPart[];
  isError?: boolean;
}

/**
 * Protocol-level message used in the agent loop and LLM provider communication.
 *
 * This type represents the canonical message format for agent conversations,
 * tool calls, and tool results. It is distinct from the display-oriented
 * `Message` type in `@claude-code-kit/ui`, which adds fields like `id` and
 * `timestamp` for rendering. The `useAgent` bridge handles conversion between
 * the two formats automatically.
 */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export interface ToolContext {
  workingDirectory: string;
  abortSignal: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
  env?: Record<string, string>;
}

export interface ToolProgress {
  percent?: number;
  message?: string;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
  isReadOnly?: boolean;
  isDestructive?: boolean;
  requiresConfirmation?: boolean;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_use_start"; toolCall: { id: string; name: string } }
  | { type: "tool_use_delta"; text: string }
  | { type: "tool_use_end" }
  | { type: "thinking"; text: string }
  | { type: "usage"; usage: { inputTokens: number; outputTokens: number } }
  | { type: "done"; stopReason?: string }
  | { type: "error"; error: Error };

export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatOptions {
  model: string;
  messages: Message[];
  tools?: ProviderTool[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  chat(options: ChatOptions): AsyncGenerator<StreamChunk>;
  countTokens?(messages: Message[]): Promise<number>;
}

// ---------------------------------------------------------------------------
// Agent events (yielded from Agent.run())
// ---------------------------------------------------------------------------

export interface TextEvent {
  type: "text";
  text: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  toolCall: ToolCall;
}

export interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  result: ToolResult;
}

export interface ThinkingEvent {
  type: "thinking";
  text: string;
}

export interface UsageEvent {
  type: "usage";
  inputTokens: number;
  outputTokens: number;
}

export interface ErrorEvent {
  type: "error";
  error: Error;
}

export interface DoneEvent {
  type: "done";
  messages: Message[];
}

export type AgentEvent =
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | ThinkingEvent
  | UsageEvent
  | ErrorEvent
  | DoneEvent;

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

export interface PermissionRequest {
  tool: string;
  input: Record<string, unknown>;
  isReadOnly?: boolean;
}

export interface PermissionResult {
  decision: "allow" | "deny";
  reason?: string;
}

export type PermissionHandler = (request: PermissionRequest) => Promise<PermissionResult>;

export interface PermissionConfig {
  alwaysAllow?: string[];
  alwaysDeny?: string[];
  sessionApproved?: Set<string>;
  autoApproveReadOnly?: boolean;
  onPermission?: PermissionHandler;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface Session {
  getMessages(): Message[];
  setMessages(messages: Message[]): void;
  clear(): void;
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

export interface CompactionStrategy {
  compact(messages: Message[], maxTokens: number): Message[] | Promise<Message[]>;
}

// ---------------------------------------------------------------------------
// Agent config
// ---------------------------------------------------------------------------

export interface AgentConfig {
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  contextLimit?: number;
  compactionStrategy?: CompactionStrategy;
  session?: Session;
  permissionHandler?: PermissionHandler;
  workingDirectory?: string;
  maxTurns?: number;
  /** Max number of tools to execute concurrently (default: 5). */
  maxConcurrentTools?: number;
}
