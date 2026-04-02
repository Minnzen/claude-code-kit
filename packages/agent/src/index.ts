// Core
export { Agent } from "./agent.js";

// Tool system
export { ToolRegistry } from "./tool-registry.js";
export { zodToInputSchema, toolToProviderFormat } from "./tool-formatter.js";

// Context management
export { ContextManager, estimateTokens, estimateTotalTokens } from "./context-manager.js";

// Compaction strategies
export { NoopCompaction } from "./compaction/interface.js";
export { SlidingWindowCompaction } from "./compaction/sliding-window.js";
export { SummarizationCompaction } from "./compaction/summarization.js";
export type { CompactionResult } from "./compaction/summarization.js";

// Session
export { InMemorySession } from "./session/memory.js";
export { FileSession, FileSessionStore } from "./session/file.js";

// Permission
export { createPermissionHandler, allowAll, denyAll } from "./permission.js";

// Providers
export { AnthropicProvider } from "./providers/anthropic.js";
export { OpenAIProvider } from "./providers/openai.js";
export { MockProvider } from "./providers/mock.js";

// Auth
export { createAuth, AuthRegistry, FileAuthStorage, MemoryAuthStorage } from "./auth/index.js";
export { PRESET_PROVIDERS } from "./auth/presets.js";
export type {
  ProviderRegistration,
  AuthType,
  AuthMethod,
  AuthMethodApiKey,
  AuthMethodOAuth,
  AuthMethodBaseUrlKey,
  AuthMethodNone,
  AuthStorage,
  AuthOptions,
  AuthFlowStep,
  AuthFlowState,
  AuthFlowProviderOption,
} from "./auth/types.js";
export type { ProviderInfo } from "./auth/registry.js";

// Types (re-export everything)
export type {
  // Messages
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ToolCall,
  // Tools
  ToolDefinition,
  ToolContext,
  ToolProgress,
  ToolResult,
  // Provider
  LLMProvider,
  StreamChunk,
  ProviderTool,
  ChatOptions,
  // Agent
  AgentConfig,
  AgentEvent,
  TextEvent,
  ToolCallEvent,
  ToolResultEvent,
  ThinkingEvent,
  UsageEvent,
  ErrorEvent,
  DoneEvent,
  // Permission
  PermissionHandler,
  PermissionConfig,
  PermissionRequest,
  PermissionResult,
  // Session & Compaction
  Session,
  CompactionStrategy,
} from "./types.js";
