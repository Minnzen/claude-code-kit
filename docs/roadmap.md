# Development Roadmap

## Current Status

### Packages
| Package | Version | Status |
|---------|---------|--------|
| `@claude-code-kit/shared` | 0.3.2 | Published |
| `@claude-code-kit/ink-renderer` | 0.3.2 | Published |
| `@claude-code-kit/ui` | 0.3.2 | Published |
| `@claude-code-kit/agent` | 0.3.2 | Published |
| `@claude-code-kit/tools` | 0.3.2 | Published |

### Stats
- 518 tests passing across 21 test files
- 15-cell cross-env import smoke matrix green (3 loaders × 5 packages)
- 3 examples (hello-world, agent-cli, alt-screen-dashboard)
- Monorepo baseline green: build, typecheck, test, lint, smoke, npm pack dry-run

### Current Focus: Stability & Optimization

`v0.3.x` is feature-complete enough. Next iterations focus on hardening the
existing surface (regression coverage, cross-env compatibility, perf baselines)
before adding new capabilities. See `Now` section below.

---

## Stable Surface In v0.3.x

- Renderer and UI core: `@claude-code-kit/shared`, `@claude-code-kit/ink-renderer`, core `@claude-code-kit/ui`
- Agent core: loop, providers, permissions, sessions, compaction
- `builtinTools`: Bash, Read, Edit, Write, Glob, Grep, WebFetch, WebSearch, EnterWorktree, ExitWorktree

## Experimental Surface

- `MCPClient` and MCP-backed tool discovery
- Higher-level tool factories: `createLspTool`, `createSubagentTool`, `createTaskTool`, `notebookEditTool`
- Orchestration features beyond the default toolset are still expected to evolve during `0.x`

---

## Completed In v0.3.1 (2026-05-09)

### Bug Fixes
- **shared**: replace CJS `require()` with static ESM import for `semver`
  (fixes `Dynamic require of "semver" is not supported` under `tsx` and other
  native ESM loaders, #1)
- **ink-renderer**: `Object.hasOwn` fallback for ES2020 lib compatibility
- **ink-renderer**: resolve DTS build errors in `render-to-screen.ts` and `screen.ts`
- **ui**: stable React keys in `MessageList` / `DiffView` / `PermissionRequest` /
  `StatusLine` / `WelcomeScreen` / `PromptInput` to avoid list-rerender state corruption
- **agent**: tighten MCP transport constructor types

### Infrastructure
- migrate Biome to v2.4.10 across all packages
- CI now runs lint and tests in addition to build / typecheck

---

## Completed In v0.3.0 (2026-04-05)

### Phase 1: Agent Core
- Agent class (AsyncGenerator loop, stateful multi-turn, chat() API)
- AnthropicProvider, OpenAIProvider (with baseURL), MockProvider
- ToolRegistry, ContextManager, SlidingWindowCompactor
- Tiered permission handler (allowReadOnly default)

### Phase 2: Tools + Enhancement
- 10 ready-to-use built-ins (`builtinTools`)
- UI-Agent bridge (useAgent, AgentProvider, AgentREPL)
- SummarizationCompactor (async LLM-based), FileSessionStore (JSONL)
- Auth framework with 8 preset providers + interactive flow UI
- AuthFlowUI component for provider selection + credential input
- Advanced factories for LSP, subagent delegation, task orchestration, and notebook edits
- MCP client support (stdio + Streamable HTTP)

### Security hardening
- Path traversal protection in file tools
- SSRF protection in web-fetch (private IP blocking)
- Default permission changed to allowReadOnly
- Credential directory permissions (0o700)
- lodash-es dependency removed (inline replacements)

---

## Prioritized Todos

## Now — Stability & Optimization

The 0.3.1 patch fixed five bugs all clustered in **integration / build / list
reconciliation**, not in core logic. The stability work below is shaped to
prevent that class of regression instead of chasing surface-area growth.

- [ ] **Cross-environment import smoke matrix**
  Deliverable: CI job that imports each published package under
  `node 18 / 20 / 22` × `tsx` / direct ESM, catches regressions of the
  `Dynamic require of "semver"` flavor before they ship.
- [ ] **UI behavior tests for high-traffic components**
  Deliverable: focused behavior tests (not snapshots) for `MessageList`,
  `DiffView`, `PermissionRequest`, `StreamingText`, `PromptInput` — the
  exact components hit by the 0.3.1 stable-key bugs.
- [ ] **Provider streaming tests**
  Deliverable: mocked SSE harness for `AnthropicProvider` and
  `OpenAIProvider` covering `text` / `tool_use` / `thinking` / `usage` /
  `done` chunk sequences. Currently zero coverage on the most critical path.
- [ ] **`FileSession` round-trip test**
  Deliverable: write JSONL → reload → assert message and tool-call equality;
  covers the persistence path we ship but do not test.
- [ ] **Bundle size + render perf baselines**
  Deliverable: recorded baseline numbers for tarball size per package and
  `MessageList` render time at 100 / 1k / 5k items, enforced as CI budgets
  (no optimization yet — measurement first).
- [ ] **Stable API contract pass**
  Deliverable: per-export `stable` / `experimental` / `internal` tagging in
  `EXPORTS.md`, mirrored as `@experimental` JSDoc tags in source. Defines
  what is committed for `v1.0.0`.
- [ ] **Release checklist + history**
  Deliverable: `RELEASE.md` with the repeatable publish flow plus visible
  git tags for prior releases.

## Next — Adoption Surface

(Deferred until the stability work above lands.)

- [ ] Documentation site
  Deliverable: a deployable site with install guide, quickstarts, package matrix, stable vs experimental boundary, and example gallery
- [ ] `npx create-cck-app` scaffolding
  Deliverable: one polished starter flow that can generate a working UI-only app and an agent-enabled app
- [ ] Product starters instead of raw demos
  Deliverable: convert current examples into opinionated starter templates users can actually fork, not just internal showcases

## Later

- [ ] Multi-agent coordinator
- [ ] MessageBus / BusAgentRunner (Slack, Telegram, webhooks)
- [ ] Structured output / response format
- [ ] Retry logic with exponential backoff

## Guiding Rule

- Do not add more low-level capability until the current surface is hardened
  (regression coverage, cross-env compat, measurable perf budgets) and the
  API contract is documented.
