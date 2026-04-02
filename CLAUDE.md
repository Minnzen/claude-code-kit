# CLAUDE.md

## Project Overview

claude-code-kit is a modular terminal UI toolkit + agent framework. Inspired by Claude Code's architecture but designed as composable building blocks.

## Repository Structure

```
packages/
  shared/         — Yoga layout engine (pure TS), utilities
  ink-renderer/   — Terminal rendering engine (React reconciler + TTY)
  ui/             — 30+ UI components (REPL, Select, PromptInput, etc.)
  types/            — Pure interfaces for agent layer (zero runtime)
  agent/            — Headless agent framework (Agent class, providers, tools)
  tools/            — Built-in tool collection (Bash, Read, Edit, Glob, Grep, WebFetch)
examples/
  hello-world/    — Interactive demo with component showcase
  alt-screen-dashboard/ — System monitoring dashboard
docs/
  components.md   — Core component API docs
  design-system.md — Design system component docs
  roadmap.md      — Development roadmap and batch plan
  agent-architecture-research.md — Agent layer design research
```

## Critical Lessons (DO NOT repeat these mistakes)

1. **Do NOT extract Claude Code's compiled output as "source code"** — Claude Code's npm bundle includes React Compiler output (`const $ = _c(81)`, `t0`, `$[0]`). These are unreadable, unmaintainable. We tried extracting 278 files — 70% were dead code with 27 stub files returning empty values. All UI components were rewritten from scratch instead.

2. **Do NOT use stubs** — Earlier approach used `_stubs/` directories with no-op functions to make extracted code compile. Components compiled but did nothing at runtime. Every component must work without any stub.

3. **Components must work without Providers** — Select component originally required KeybindingProvider to handle arrow keys. It was broken without it. All components now use `useInput` directly as baseline, with optional Provider enhancement.

4. **useInterval/useAnimationTimer depend on ClockContext** — ink-renderer's hooks need a ClockProvider. UI components (Spinner, StreamingText) must use standard `setInterval` instead.

5. **Claude Code source is at** `/Users/minnzen/Documents/trail/claude-code-source/src/` — useful for reference but never copy compiled output directly.

## Architecture Principles

1. **Decoupled layers** — UI and Agent are independent packages. Agent runs headless (no React). UI works without Agent.
2. **Composable** — Every component works standalone. REPL is a thin composition layer (164 lines), not a monolith.
3. **State externalized** — Components receive state via props. No internal global store. Consumer chooses state management.
4. **Provider agnostic** — Agent supports any LLM via adapter pattern. OpenAI message format as canonical.
5. **Zero stubs** — All UI components are clean rewrites. No stub dependencies.

## Key Design Decisions

### UI Layer (completed)
- ink-renderer extracted from Claude Code source (React reconciler + custom Yoga TS port)
- All UI components (REPL, Select, PromptInput, Spinner, etc.) rewritten from scratch
- Components use `useInput` directly, not keybinding system (keybindings are optional enhancement)
- ThemeProvider with 4 themes, 33 color tokens

### Agent Layer (Phase 1 completed)
- AsyncGenerator-based agent loop (best pattern from Claude Code)
- `@claude-code-kit/types` package for pure interfaces (prevents cascading breaking changes)
- Provider adapters: AnthropicProvider, OpenAIProvider (with baseURL for Ollama/vLLM)
- Tool interface: Zod schema + execute function, no UI rendering
- Permission: tiered model (alwaysAllow list + sessionApprove + per-call callback)
- ToolContext includes FileSystem abstraction (supports Docker/SSH/sandbox)
- MockProvider as first-class citizen for testing
- Agent is stateful, supports multi-turn conversations
- See `docs/agent-architecture-research.md` for full design rationale

## Development Commands

```bash
pnpm build          # Build all packages
pnpm typecheck      # Type check all packages
pnpm lint           # Lint all packages (Biome)
pnpm test           # Run tests (vitest)
pnpm release:check  # Full pre-release validation
```

## Code Style

- Comments: explain WHY, not WHAT. Delete "what" comments.
- No Chinese in code/comments (except CJK rendering examples in ink-renderer)
- No emojis in code or docs
- Self-documenting naming preferred over comments
- TypeScript strict mode

## Package Dependencies (NEVER violate)

```
shared          — depends on nothing
ink-renderer    — depends on shared
types           — depends on nothing (pure interfaces)
agent           — depends on types, shared (NEVER ui or ink-renderer)
tools           — depends on agent (for ToolDefinition types)
ui              — depends on ink-renderer, shared; optionally agent (for bridge hooks)
```

## Current Phase

Completed: Agent Phase 1 + Phase 2
- Phase 1: types + agent packages
- Phase 2: tools package, UI-Agent bridge (useAgent/AgentProvider/AgentREPL), FileSession, SummarizationCompactor, 16 tests passing
Next: npm v0.2.0 publish, agent CLI example, Phase 3 (multi-agent, MCP)
See: `docs/roadmap.md` for detailed plan

## Agent Usage Pattern

```typescript
// Headless (no UI)
import { Agent, OpenAIProvider } from '@claude-code-kit/agent'
const agent = new Agent({
  provider: new OpenAIProvider({ apiKey, baseURL: 'http://localhost:11434/v1' }),
  tools: [myTool],
})
const result = await agent.chat('Hello')

// With UI
import { REPL } from '@claude-code-kit/ui'
import { Agent, AnthropicProvider } from '@claude-code-kit/agent'
// Connect via props — agent yields events, UI renders them
```

## npm Publishing

Scope: `@claude-code-kit/*`
Current version: 0.1.0
Publish order: shared → types → ink-renderer → agent → tools → ui (dependency order)
Use `pnpm publish --access public --no-git-checks` per package

## Git Conventions

- Branch: `main`
- Commit format: `type: description` (feat, fix, chore, docs, refactor)
- No Co-Authored-By signatures
