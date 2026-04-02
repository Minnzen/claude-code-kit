// ---------------------------------------------------------------------------
// @claude-code-kit/types — Pure TypeScript interfaces, zero runtime code.
// ---------------------------------------------------------------------------

export type {
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ToolCall,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
} from "./message";

export type {
  FileSystem,
  ToolContext,
  ToolProgress,
  ToolResult,
  ValidationResult,
  ToolDefinition,
} from "./tool";

export type {
  ProviderCapabilities,
  ToolAPIDefinition,
  ChatParams,
  StopReason,
  TokenUsage,
  TextDeltaChunk,
  ToolUseStartChunk,
  ToolUseDeltaChunk,
  ToolUseEndChunk,
  ThinkingDeltaChunk,
  UsageChunk,
  DoneChunk,
  ErrorChunk,
  StreamChunk,
  LLMProvider,
} from "./provider";

export type {
  AgentConfig,
  TextEvent,
  ThinkingEvent,
  ToolStartEvent,
  ToolProgressEvent,
  ToolEndEvent,
  CompactEvent,
  UsageEvent,
  ErrorEvent,
  TurnEvent,
  DoneEvent,
  AgentEvent,
} from "./agent";

export type {
  PermissionRequest,
  PermissionDecision,
  PermissionHandler,
  PermissionConfig,
} from "./permission";

export type { CompactionResult, CompactionStrategy, TokenCounter } from "./context";

export type { SessionData, SessionStore } from "./session";
