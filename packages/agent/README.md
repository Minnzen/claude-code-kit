# @claude-code-kit/agent

Headless agent framework for building LLM-powered tools and applications. Provides an AsyncGenerator-based query loop with tool execution, multi-provider support, context management, and tiered permissions.

## Features

- **Multi-provider**: Anthropic (Claude) and OpenAI-compatible APIs (GPT, Ollama, vLLM, Groq, Together)
- **Tool execution**: Zod-based tool definitions with automatic JSON Schema generation
- **Context management**: Token counting with configurable compaction strategies
- **Tiered permissions**: Allow/deny lists, session approvals, read-only auto-approve, custom callbacks
- **Streaming**: AsyncGenerator-based event stream for real-time UI updates
- **Stateful sessions**: Maintains conversation history across calls
- **MCP client**: Optional Model Context Protocol client for dynamic tool discovery
- **Headless**: No UI dependencies -- works in Node.js scripts, CLI apps, web servers, anywhere

## API status

- Supported core surface: `Agent`, providers, permissions, sessions, compaction, `ToolRegistry`
- Experimental: `MCPClient` and MCP-backed dynamic tool discovery

## Installation and runtime

```bash
pnpm add @claude-code-kit/agent@0.4.0 @anthropic-ai/sdk@0.82.0 zod@4.3.6
```

Version `0.4.0` requires Node.js 22+. Provider SDKs are optional peers: install `openai` for OpenAI-compatible APIs or `@modelcontextprotocol/sdk` for MCP. Use an ESM app for top-level-await examples, or compile TypeScript first. Root exports support ESM and CommonJS.

## Quick start

```typescript
import { Agent, AnthropicProvider } from '@claude-code-kit/agent'
import { z } from 'zod'

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  model: process.env.ANTHROPIC_MODEL!,
  systemPrompt: 'You are a helpful assistant.',
  tools: [{
    name: 'get_weather',
    description: 'Get weather for a city',
    inputSchema: z.object({ city: z.string() }),
    isReadOnly: true,
    async execute({ city }) {
      return { content: `Weather in ${city}: 72F, sunny` }
    },
  }],
})

// Simple API
const response = await agent.chat('What is the weather in Tokyo?')

// Streaming API
for await (const event of agent.run('What is the weather in Tokyo?')) {
  switch (event.type) {
    case 'text': process.stdout.write(event.text); break
    case 'tool_call': console.log('Calling:', event.toolCall.name); break
    case 'tool_result': console.log('Result:', event.result.content); break
    case 'done': console.log('\nDone'); break
  }
}
```

## Providers

### Anthropic

```typescript
import { AnthropicProvider } from '@claude-code-kit/agent'
const provider = new AnthropicProvider({ apiKey: '...' })
```

### OpenAI (and compatible)

```typescript
import { OpenAIProvider } from '@claude-code-kit/agent'

// OpenAI
const openai = new OpenAIProvider({ apiKey: '...' })

// Ollama
const ollama = new OpenAIProvider({ apiKey: 'ollama', baseURL: 'http://localhost:11434/v1' })

// Groq
const groq = new OpenAIProvider({ apiKey: '...', baseURL: 'https://api.groq.com/openai/v1' })
```

### Mock (for testing)

```typescript
import { MockProvider } from '@claude-code-kit/agent'

const provider = new MockProvider([
  [{ type: 'text', text: 'Hello!' }, { type: 'done' }],
])
```

## Permissions

```typescript
import { Agent, createPermissionHandler } from '@claude-code-kit/agent'

const agent = new Agent({
  // ...
  permissionHandler: createPermissionHandler({
    alwaysAllow: ['get_weather', 'search'],
    alwaysDeny: ['delete_file'],
    autoApproveReadOnly: true,
    onPermission: async (req) => {
      const ok = await promptUser(`Allow ${req.tool}?`)
      return { decision: ok ? 'allow' : 'deny' }
    },
  }),
})
```

In `0.4.0`, `PermissionResult` has `{ decision: 'allow' | 'deny', reason?, approvalRequired? }`. Only an explicit `allow` executes a tool in the headless Agent. `approvalRequired: true` marks a denial caused by missing approval so an interactive host may ask. Default read-only denial and the permission-factory fallback set that flag; `alwaysDeny` and custom denials without it remain absolute. The UI bridge evaluates the existing policy first and cannot override those explicit denials. There is no additional `ask` decision.

## Context compaction

The agent ships four reducing compaction strategies, plus the default `NoopCompaction`, all implementing the same
`CompactionStrategy` interface. Pass one to `AgentConfig.compactionStrategy`
(or use `LayeredCompaction` to combine several). Context reduction is opt-in; no summary call runs with the default strategy.

| Strategy | Cost | Information loss | When to use |
|---|---|---|---|
| `MicroCompaction` | zero LLM calls, deterministic | lowest — only old tool-result *bodies* are dropped, decisions in `assistant.toolCalls` survive | recommended first layer |
| `SummarizationCompaction` | one LLM call per compaction | medium — older messages collapsed into a summary, details lost | long conversations |
| `SlidingWindowCompaction` | zero LLM calls | high — middle messages dropped wholesale | last-resort fallback |
| `LayeredCompaction` | sum of its layers (short-circuits) | depends on layers | the recommended way to combine the above |

### MicroCompaction

Mirrors Claude Code's microcompact strategy:

- Replaces old tool-result `content` with the verbatim placeholder
  `[Old tool result content cleared]` (exported as `TOOL_RESULT_CLEARED_MESSAGE`).
- Default `keepRecentN: 5` — the last five compactable tool results survive.
  The constructor floors this at 1, so `keepRecentN: 0` is treated as 1.
- Defaults to a whitelist of 9 tool names (exported as
  `DEFAULT_COMPACTABLE_TOOLS`), mirroring Claude Code's `COMPACTABLE_TOOLS`
  set verbatim: `Read`, `Bash`, `PowerShell`, `Grep`, `Glob`, `WebSearch`,
  `WebFetch`, `Edit`, `Write`. Pass `compactableTools: 'all'` to clear every
  tool's output, or pass an explicit array to narrow the set. Note: our
  `tools` package does not currently ship a `PowerShell` tool — the name is
  carried over for parity, and is harmless if unused.
- Idempotent: results that have already been cleared are returned by reference.

When using `MicroCompaction`, instruct the model to preserve important findings in its own response, since old tool output can later be cleared.

### Recommended layered stack

```typescript
import {
  Agent,
  AnthropicProvider,
  LayeredCompaction,
  MicroCompaction,
  SlidingWindowCompaction,
  SummarizationCompaction,
} from '@claude-code-kit/agent'

const provider = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })

const agent = new Agent({
  provider,
  model: process.env.ANTHROPIC_MODEL!,
  compactionStrategy: new LayeredCompaction([
    new MicroCompaction(),                              // free, lossless for decisions
    new SummarizationCompaction(provider, { summaryModel: process.env.ANTHROPIC_MODEL! }),
    new SlidingWindowCompaction(),                      // free, very lossy fallback
  ]),
})
```

`LayeredCompaction` re-estimates tokens after each layer and short-circuits
once the budget is met, so the more expensive layers only run when the
cheaper ones cannot recover enough room.

Summary and sliding strategies retain complete user turns, including assistant tool calls and every corresponding result. `keepRecentN` is a minimum message count extended to the start of a turn. Summaries include tool name/input and task constraints. The newest turn and system messages survive even when they exceed the target; token budgets are best effort. Reactive compaction stops with an error when it cannot reduce context rather than retrying indefinitely. Optional cancellation signals flow to summaries and layered strategies; summary errors or empty output propagate.

## Lifecycle in 0.4.0

An `Agent` permits one active run. Continue consuming or close its async iterator to release that run. `abort()` signals immediately; `await agent.cancel()` signals and waits for cleanup; `waitForIdle()` only waits. `clearMessages()` and provider/tool/permission changes require idle. `chat()` rejects provider failures; the streaming API emits an `error` event rather than successful completion.

```typescript
await agent.cancel()
agent.clearMessages()
```

## File sessions

`FileSession.setMessages()` and `clear()` only update memory. Call `save()` or `FileSessionStore.save()` explicitly to persist the history. `append()` persists one new message and does not save other unsaved in-memory changes; load existing history first when this instance needs it in memory.

`FileSessionStore.load()` returns null only when the file is absent. JSON corruption and filesystem errors propagate. IDs must start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens. Session files must be regular files; file symlinks and directory redirection after opening are rejected.

```typescript
import { FileSessionStore } from '@claude-code-kit/agent'

const store = new FileSessionStore('./sessions')
const session = await store.load('my-session') ?? store.create('my-session')
const agentWithSession = new Agent({ provider, model: process.env.ANTHROPIC_MODEL!, session })
await agentWithSession.chat('Continue the task')
await store.save('my-session', session)
```

### Known divergence from Claude Code

Claude Code also ships a *time-based* microcompact trigger that fires when
the gap since the last assistant message exceeds the prompt-cache TTL
(default 60 minutes). Implementing it requires per-message timestamps, which
are not yet part of our `Message` type. If you need this trigger today,
combine `MicroCompaction` with your own scheduler.

## MCP

`MCPClient` is available when you want to connect to stdio or Streamable HTTP MCP servers. Treat it as an evolving API during `0.x`; the stable default remains explicit local tools passed via `tools`.

## License

MIT
