# agent-cli-example

Minimal example showing `@claude-code-kit/agent` and `@claude-code-kit/ui` working together.

## What it demonstrates

- Creating an `Agent` with a `MockProvider` (no API key needed)
- Defining a custom tool (`get_time`) with Zod schema validation
- Using `AgentREPL` to render a full interactive CLI with streaming, tool use display, and slash commands
- The complete agent loop: user input -> LLM response -> tool execution -> final response

## Run

```bash
pnpm install
pnpm --filter agent-cli-example start
```

## Swap in a real provider

Replace `MockProvider` with `AnthropicProvider` or `OpenAIProvider` to connect to a real LLM:

```ts
import { AnthropicProvider } from '@claude-code-kit/agent'

const provider = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! })
const agent = new Agent({ provider, model: 'claude-sonnet-4-20250514', tools: [getTimeTool] })
```
