// Core
export { Agent } from "./agent.js";
// Auth
export { AuthRegistry, createAuth, FileAuthStorage, MemoryAuthStorage } from "./auth/index.js";
export type { OAuthFlowResult } from "./auth/oauth.js";
export { openBrowser, startOAuthFlow } from "./auth/oauth.js";
export { PRESET_PROVIDERS } from "./auth/presets.js";
export type { ProviderInfo } from "./auth/registry.js";
export type {
  AuthFlowProviderOption,
  AuthFlowState,
  AuthFlowStep,
  AuthMethod,
  AuthMethodApiKey,
  AuthMethodBaseUrlKey,
  AuthMethodNone,
  AuthMethodOAuth,
  AuthOptions,
  AuthStorage,
  AuthType,
  ProviderRegistration,
} from "./auth/types.js";
// Compaction strategies
export { NoopCompaction } from "./compaction/interface.js";
export { SlidingWindowCompaction } from "./compaction/sliding-window.js";
export type { CompactionResult } from "./compaction/summarization.js";
export { SummarizationCompaction } from "./compaction/summarization.js";
// Context management
export { ContextManager, estimateTokens, estimateTotalTokens } from "./context-manager.js";
// MCP
export { MCPClient } from "./mcp-client.js";
// Permission
export { allowAll, allowReadOnly, createPermissionHandler, denyAll } from "./permission.js";
// Providers
export { AnthropicProvider } from "./providers/anthropic.js";
export { MockProvider } from "./providers/mock.js";
export { OpenAIProvider } from "./providers/openai.js";
export { FileSession, FileSessionStore } from "./session/file.js";
// Session
export { InMemorySession } from "./session/memory.js";
// Tool system
export { ToolRegistry } from "./tool-registry.js";

// Types (re-export everything)
export type {
  // Agent
  AgentConfig,
  AgentEvent,
  AssistantMessage,
  ChatOptions,
  CompactionStrategy,
  ContentPart,
  DoneEvent,
  ErrorEvent,
  ImageContentPart,
  // Provider
  LLMProvider,
  // MCP
  MCPConfig,
  MCPHttpServerConfig,
  MCPServerConfig,
  MCPStdioServerConfig,
  // Messages
  Message,
  PermissionConfig,
  // Permission
  PermissionHandler,
  PermissionRequest,
  PermissionResult,
  ProviderTool,
  // Session & Compaction
  Session,
  StreamChunk,
  SystemMessage,
  TextContentPart,
  TextEvent,
  ThinkingEvent,
  ToolCall,
  ToolCallEvent,
  ToolContext,
  // Tools
  ToolDefinition,
  ToolProgress,
  ToolResult,
  ToolResultEvent,
  ToolResultMessage,
  UsageEvent,
  UserMessage,
} from "./types.js";
