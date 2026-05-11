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

- Stable in `v0.3.x`: `Agent`, providers, permissions, sessions, compaction, `ToolRegistry`
- Experimental in `v0.3.x`: `MCPClient` and MCP-backed dynamic tool discovery

## Quick start

```typescript
import { Agent, AnthropicProvider } from '@claude-code-kit/agent'
import { z } from 'zod'

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a helpful assistant.',
  tools: [{
    name: 'get_weather',
    description: 'Get weather for a city',
    inputSchema: z.object({ city: z.string() }),
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
const ollama = new OpenAIProvider({ baseURL: 'http://localhost:11434/v1' })

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

## Context compaction

The agent ships four compaction strategies, all implementing the same
`CompactionStrategy` interface. Pass one to `AgentConfig.compactionStrategy`
(or use `LayeredCompaction` to combine several). The defaults and naming
mirror Claude Code's own compaction subsystem
([`src/services/compact/microCompact.ts`](https://github.com/anthropics/claude-code))
so behavior stays predictable for users coming from there.

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
- Defaults to a whitelist of 8 tool names (exported as
  `DEFAULT_COMPACTABLE_TOOLS`): `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`,
  `WebFetch`, `WebSearch`. Pass `compactableTools: 'all'` to clear every tool's
  output, or pass an explicit array to narrow the set.
- Idempotent: results that have already been cleared are returned by reference.

When using `MicroCompaction`, it is recommended to instruct the model in your
system prompt to record any important information from tool results in its
own response, since the original output may later be cleared. Claude Code
ships this exact instruction:

> When working with tool results, write down any important information you
> might need later in your response, as the original tool result may be
> cleared later.

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
  model: 'claude-sonnet-4-20250514',
  compactionStrategy: new LayeredCompaction([
    new MicroCompaction(),                              // free, lossless for decisions
    new SummarizationCompaction(provider),              // one LLM call, lossy
    new SlidingWindowCompaction(),                      // free, very lossy fallback
  ]),
})
```

`LayeredCompaction` re-estimates tokens after each layer and short-circuits
once the budget is met, so the more expensive layers only run when the
cheaper ones cannot recover enough room.

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
