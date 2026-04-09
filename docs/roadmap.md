# Development Roadmap

## Current Status

### Packages
| Package | Version | Status |
|---------|---------|--------|
| `@claude-code-kit/shared` | 0.3.0 | Published |
| `@claude-code-kit/ink-renderer` | 0.3.0 | Published |
| `@claude-code-kit/ui` | 0.3.0 | Published |
| `@claude-code-kit/agent` | 0.3.0 | Published |
| `@claude-code-kit/tools` | 0.3.0 | Published |

### Stats
- 498 tests passing across 20 test files
- 3 examples (hello-world, agent-cli, alt-screen-dashboard)
- Monorepo baseline green: build, typecheck, test, lint, npm pack dry-run

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

## Completed In v0.3.0

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

## v0.3.0 Released (2026-04-05)

All 5 packages published to npm.

## Prioritized Todos

## Now

- [ ] Documentation site
  Deliverable: a deployable site with install guide, quickstarts, package matrix, stable vs experimental boundary, and example gallery
- [ ] `npx create-cck-app` scaffolding
  Deliverable: one polished starter flow that can generate a working UI-only app and an agent-enabled app
- [ ] Product starters instead of raw demos
  Deliverable: convert current examples into opinionated starter templates users can actually fork, not just internal showcases
- [ ] Stable API contract pass
  Deliverable: document which exports are committed for `v1.0.0`, which stay experimental, and remove or relabel misleading surfaces

## Next

- [ ] Release hygiene
  Deliverable: visible release history (tags + changelog discipline) and a repeatable publish checklist
- [ ] UI component test expansion
  Deliverable: focused behavior tests for the most reused public components, not snapshot sprawl
- [ ] Performance benchmarks
  Deliverable: a small benchmark suite for renderer throughput, search rendering, and large message lists

## Later

- [ ] Multi-agent coordinator
- [ ] MessageBus / BusAgentRunner (Slack, Telegram, webhooks)
- [ ] Structured output / response format
- [ ] Retry logic with exponential backoff

## Guiding Rule

- Do not add more low-level capability until docs, starter, and API-contract work make the current surface easier to adopt.
