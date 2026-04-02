# @claude-code-kit/types

Pure TypeScript type definitions for the claude-code-kit agent framework. Zero runtime code.

## Install

```bash
pnpm add @claude-code-kit/types
```

## Usage

```typescript
import type {
  Message,
  ToolDefinition,
  LLMProvider,
  AgentConfig,
  AgentEvent,
  PermissionHandler,
} from "@claude-code-kit/types";
```

## Modules

| Module | Description |
|--------|-------------|
| `message` | Canonical message format (OpenAI-style): system, user, assistant, tool result |
| `tool` | Tool definitions with Zod schemas, execution context, and results |
| `provider` | LLM provider interface with streaming support |
| `agent` | Agent configuration and event types |
| `permission` | Permission system: requests, decisions, handlers |
| `context` | Compaction strategies and token counting |
| `session` | Session persistence interface |

## License

MIT
