# @claude-code-kit/agent

Headless agent framework for building LLM-powered tools and applications. Provides an AsyncGenerator-based query loop with tool execution, multi-provider support, context management, and tiered permissions.

## Features

- **Multi-provider**: Anthropic (Claude) and OpenAI-compatible APIs (GPT, Ollama, vLLM, Groq, Together)
- **Tool execution**: Zod-based tool definitions with automatic JSON Schema generation
- **Context management**: Token counting with configurable compaction strategies
- **Tiered permissions**: Allow/deny lists, session approvals, read-only auto-approve, custom callbacks
- **Streaming**: AsyncGenerator-based event stream for real-time UI updates
- **Stateful sessions**: Maintains conversation history across calls
- **Headless**: No UI dependencies -- works in Node.js scripts, CLI apps, web servers, anywhere

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

## License

MIT
