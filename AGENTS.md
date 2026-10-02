# AGENTS.md

## Project Overview

claude-code-kit is a modular terminal UI toolkit + agent framework. 5 packages and 3 examples. Inspired by Claude Code's architecture but all UI components are clean rewrites.

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

1. **Do NOT extract compiled output** — UI components must be independently implemented and maintainable.

2. **Do NOT use stubs** — `_stubs/` directories with no-op functions made code compile but do nothing. Every component must work without any stub.

3. **Components must work without Providers** — All components use `useInput` directly. KeybindingProvider is optional enhancement only.

4. **useInterval/useAnimationTimer depend on ClockContext** — UI components (Spinner, StreamingText) use standard `setInterval` instead.

5. **Security: default permission is allowReadOnly** — Non-read-only tools are denied by default. Never use allowAll as default.

6. **Security: file tools check path containment** — Check lexical and real paths, including symlink ancestors; paths must stay inside workingDirectory.

7. **Security: web-fetch blocks private IPs** — Validate addresses resolved by DNS and every redirect against localhost, private ranges, and cloud metadata.

## Architecture Principles

1. **Decoupled layers** — UI and Agent are independent. Agent runs headless (no React). UI works without Agent.
2. **Composable** — Every component works standalone. REPL is a thin composition layer.
3. **State externalized** — Components receive state via props. No internal global store.
4. **Provider agnostic** — Agent supports any LLM via adapter pattern. OpenAI message format as canonical.
5. **Clean rewrites** — All UI components rewritten from scratch. No extracted compiled code.

## Key Design Decisions

### UI Layer
- ink-renderer uses React reconciler and the shared pure TypeScript Yoga layout engine
- All UI components rewritten from scratch
- Components use `useInput` directly (keybindings optional)
- ThemeProvider with 4 themes, 33 color tokens
- `useTheme` is provided by `ui`; the renderer's former no-op theme export is removed
- AuthFlowUI for interactive provider selection + credential input

### Agent Layer
- AsyncGenerator-based agent loop
- Providers: AnthropicProvider, OpenAIProvider (with baseURL for Ollama/SiliconFlow/DeepSeek/Groq), MockProvider
- Auth: open registry with 8 preset providers, multi-method auth (api-key, base-url-key, none)
- Tools: Zod schema + execute function, no UI rendering
- Permission: tiered (allowReadOnly default, alwaysAllow list, sessionApprove, callback)
- Context: Noop default; Micro, Summarization, SlidingWindow, and Layered strategies are explicit opt-ins
- Session: InMemorySession + FileSession (JSONL); setMessages/clear update memory, save persists explicitly
- Lifecycle: one active Agent run; abort requests cancellation, cancel/waitForIdle await cleanup; clearMessages and configuration setters require idle
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
pnpm test           # Run current Vitest regression suite
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

- Checkout and verified npm version: 0.4.0. All five packages are published.
- Runtime baseline: Node.js >=22, React 19.2.x, react-reconciler 0.33.x.
- Repository development floor: Node.js >=22.12.0; package runtime floor: >=22.0.0.
- Release validation (2026-10-03): 0.4.0 passed 719 tests across 34 files plus release:check on Node 24.13.0; isolated packed-consumer checks passed on Node 22.0 / 24.13.
- Local validation is tracked separately from remote CI; the 0.4.0 release commit passed the Node 22.12 / 24 matrix and Node 22.0 packed-runtime job.
- Fresh npm-registry consumer checks passed on Node 22.0 / 24.13 for full and UI-only installs. These are not live provider or real-terminal acceptance.
- Public API contract: EXPORTS.md. Manual npm/GitHub release procedure: RELEASE.md.
- Linear project: https://linear.app/minnzen/project/claude-code-kit-964b8fbcd194

## Feature Parity Principle

Use Claude Code as a conceptual reference for agent and UI patterns, adapted to the decoupled architecture. Prioritize contracts, lifecycle safety, and adoption of the existing surface before expanding capabilities. Product positioning is a composable terminal toolkit with an optional headless agent, rather than full Claude Code feature parity.

## Next Steps (see docs/roadmap.md + Linear)

1. Verify licenses, redistribution permissions, and bundled dependency notices before a release
2. Keep public API docs and release evidence synchronized with the checkout
3. Documentation site and runnable starters after the stability gate
4. Performance baselines; structured output/retry/coordinator only when required

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
Use `pnpm publish --access public --no-git-checks` per package after explicit release authorization. A GitHub tag creates a GitHub release after checks; it does not publish npm packages. See RELEASE.md for remaining release work.

## Git Conventions

- Branch: `main`
- Commit format: `type: description` (feat, fix, chore, docs, refactor)
- No Co-Authored-By signatures
- No Amp trailers (Amp-Thread-ID, Co-authored-by: Amp) — use `--no-verify` and `-c trailer.ifexists=doNothing -c trailer.ifmissing=doNothing` when committing
