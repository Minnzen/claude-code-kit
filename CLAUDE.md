# CLAUDE.md

## Project Overview

claude-code-kit is a modular terminal UI toolkit + agent framework. 5 packages, 327 tests, 3 examples. Inspired by Claude Code's architecture but all UI components are clean rewrites.

## Repository Structure

```
packages/
  shared/         — Yoga layout engine (pure TS), utilities
  ink-renderer/   — Terminal rendering engine (React reconciler + TTY)
  ui/             — 30+ UI components (REPL, Select, PromptInput, AgentREPL, AuthFlow, etc.)
  agent/          — Headless agent framework (Agent class, providers, auth, permission, session)
  tools/          — Built-in tools (Bash, Read, Edit, Write, Glob, Grep, WebFetch)
examples/
  hello-world/         — Interactive demo with component showcase
  agent-cli/           — Mini coding assistant with auth flow + tools + permission
  alt-screen-dashboard/ — System monitoring dashboard
docs/
  components.md     — Core component API docs
  design-system.md  — Design system component docs
  roadmap.md        — Development roadmap
```

## Critical Lessons (DO NOT repeat these mistakes)

1. **Do NOT extract Claude Code's compiled output** — React Compiler output (`_c(81)`, `t0`, `$[0]`) is unreadable. We tried 278 files, 70% were dead code. All UI components were rewritten from scratch.

2. **Do NOT use stubs** — `_stubs/` directories with no-op functions made code compile but do nothing. Every component must work without any stub.

3. **Components must work without Providers** — All components use `useInput` directly. KeybindingProvider is optional enhancement only.

4. **useInterval/useAnimationTimer depend on ClockContext** — UI components (Spinner, StreamingText) use standard `setInterval` instead.

5. **Security: default permission is allowReadOnly** — Non-read-only tools are denied by default. Never use allowAll as default.

6. **Security: file tools check path containment** — All file tools verify resolved path stays inside workingDirectory.

7. **Security: web-fetch blocks private IPs** — SSRF protection against localhost, private ranges, cloud metadata.

## Architecture Principles

1. **Decoupled layers** — UI and Agent are independent. Agent runs headless (no React). UI works without Agent.
2. **Composable** — Every component works standalone. REPL is a thin composition layer.
3. **State externalized** — Components receive state via props. No internal global store.
4. **Provider agnostic** — Agent supports any LLM via adapter pattern. OpenAI message format as canonical.
5. **Clean rewrites** — All UI components rewritten from scratch. No extracted compiled code.

## Key Design Decisions

### UI Layer
- ink-renderer extracted from Claude Code source (React reconciler + custom Yoga TS port)
- All UI components rewritten from scratch
- Components use `useInput` directly (keybindings optional)
- ThemeProvider with 4 themes, 33 color tokens
- AuthFlowUI for interactive provider selection + credential input

### Agent Layer
- AsyncGenerator-based agent loop
- Providers: AnthropicProvider, OpenAIProvider (with baseURL for Ollama/SiliconFlow/DeepSeek/Groq), MockProvider
- Auth: open registry with 8 preset providers, multi-method auth (api-key, base-url-key, none)
- Tools: Zod schema + execute function, no UI rendering
- Permission: tiered (allowReadOnly default, alwaysAllow list, sessionApprove, callback)
- Context: SlidingWindow + SummarizationCompactor (async, uses LLM)
- Session: InMemorySession + FileSession (JSONL)
- Security: path containment, SSRF protection, safe defaults

### Types
- Single source of truth: `packages/agent/src/types.ts`
- StreamChunk: discriminated union (text, tool_use_start/delta/end, thinking, usage, done, error)
- Message: OpenAI-style canonical format (system/user/assistant/tool roles)
- UI has its own display-oriented Message type (with id, timestamp, MessageContent[])

## Development Commands

```bash
pnpm build          # Build all packages
pnpm typecheck      # Type check all packages
pnpm lint           # Lint all packages (Biome)
pnpm test           # Run tests (vitest, 327 tests)
pnpm release:check  # Full pre-release validation
```

## Code Style

- Comments: explain WHY, not WHAT
- No Chinese in code/comments (except CJK rendering examples in ink-renderer)
- No emojis in code or docs
- Self-documenting naming preferred over comments
- TypeScript strict mode

## Package Dependencies (NEVER violate)

```
shared          — depends on nothing
ink-renderer    — depends on shared
agent           — depends on shared (NEVER ui or ink-renderer)
tools           — depends on agent (for ToolDefinition types)
ui              — depends on ink-renderer, shared; optionally agent (for bridge hooks)
```

## Current Status

- 5 packages, all build + typecheck clean
- 327 tests passing
- All 5 packages published on npm v0.2.0
- Linear project: https://linear.app/minnzen/project/claude-code-kit-964b8fbcd194

## Feature Parity Principle

When adding new features, prioritize capabilities that Claude Code already has. Use Claude Code as the reference implementation for agent features (MCP, multi-agent, context management, hooks, etc.) and UI patterns. Adapt to our framework architecture — don't copy code, copy concepts.

## Next Steps (see docs/roadmap.md + Linear)

1. MCP client integration (dynamic tool discovery)
2. Tool parallel execution
3. Documentation site (Bolt/Lovable)
4. More provider presets, structured output, retry logic

## Agent Usage Pattern

```typescript
// Headless (no UI)
import { Agent, OpenAIProvider } from '@claude-code-kit/agent'
const agent = new Agent({
  provider: new OpenAIProvider({ apiKey, baseURL: 'http://localhost:11434/v1' }),
  tools: [myTool],
  model: 'llama3.1',
})
const result = await agent.chat('Hello')

// With UI
import { render } from '@claude-code-kit/ink-renderer'
import { AgentREPL } from '@claude-code-kit/ui'
import { Agent, AnthropicProvider, createPermissionHandler } from '@claude-code-kit/agent'
import { bashTool, readTool, editTool } from '@claude-code-kit/tools'

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  tools: [bashTool, readTool, editTool],
  model: 'claude-sonnet-4-6',
  permissionHandler: createPermissionHandler({ autoApproveReadOnly: true }),
})
await render(<AgentREPL agent={agent} />)
```

## npm Publishing

Scope: `@claude-code-kit/*`
Publish order: shared → ink-renderer → agent → tools → ui (dependency order)
Use `pnpm publish --access public --no-git-checks` per package

## Git Conventions

- Branch: `main`
- Commit format: `type: description` (feat, fix, chore, docs, refactor)
- No Co-Authored-By signatures
