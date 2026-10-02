# Development Roadmap

## Current Status

### Packages
| Package | Latest published | Status |
|---------|------------------|--------|
| `@claude-code-kit/shared` | 0.4.0 | Published |
| `@claude-code-kit/ink-renderer` | 0.4.0 | Published |
| `@claude-code-kit/ui` | 0.4.0 | Published |
| `@claude-code-kit/agent` | 0.4.0 | Published |
| `@claude-code-kit/tools` | 0.4.0 | Published |

### Validation and runtime
- Release `0.4.0` validation on 2026-10-03: 719 tests across 34 files; `pnpm release:check` passed locally on Node 24.13.0; isolated packed-consumer checks passed on Node 22.0 / 24.13.
- [Remote CI](https://github.com/Minnzen/claude-code-kit/actions/runs/37066911311) passed on the release commit; all five npm packages are published as 0.4.0.
- CI passed build/check on Node 22.12 / 24 and all ESM / CJS / tsx smoke loaders, plus isolated tarball consumers at the Node 22.0 runtime floor.
- Runtime baseline: Node.js >=22, React 19.2.x, react-reconciler 0.33.x. Earlier Node and React versions are outside the current declared contract.
- 3 examples (hello-world, agent-cli, alt-screen-dashboard)
- Repository development requires Node.js >=22.12.0 for build/test tooling.
- Fresh registry-consumer checks passed on Node 22.0 / 24.13: full/UI-only installs, ESM/CJS/TSX imports, headless mock chat, and mounted terminal input/Ctrl+C/paste/submission/unmount. Live provider and real-terminal acceptance are separate.
- Validation command: `pnpm release:check` (build, typecheck, tests, lint, workspace import smoke, and isolated packed-consumer smoke).

### Current Focus: Stability & Optimization

The core surface is broad enough. Release `0.4.0` focuses on hardening the
existing surface (regression coverage, cross-env compatibility, perf baselines)
before adding new capabilities. See `Now` section below.

---

## Supported Core Surface

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

Release `0.4.0` closes integration, lifecycle, and security regressions before expanding the public surface. Local regression coverage, remote CI, npm publication, and registry-consumer checks are verified separately.

- [x] **Cross-environment import smoke matrix** (verified for 0.4.0)
  Build/check jobs on Node 22.12 / 24 plus a Node 22.0 packed-runtime job;
  each smoke run imports ESM / CJS / tsx and asserts named exports. Catches regressions of
  the `Dynamic require of "semver"` flavor before they ship.
- [x] **Mounted terminal lifecycle, permission, input, and history regressions**
  Actual renderer plus xterm fixtures cover Ctrl+C protocols, input/paste/resize, permission-policy inheritance and session grants, callback failures, search isolation, cleanup, and variable-height history at 100 / 1k / 5k items. These are local emulator checks, not physical-terminal acceptance.
- [ ] **Additional isolated component behavior coverage**
  Deliverable: focused behavior tests (not snapshots) for `MessageList`,
  `DiffView`, `PermissionRequest`, `StreamingText`, `PromptInput` — the
  exact components hit by the 0.3.1 stable-key bugs.
- [x] **Provider streaming and agent lifecycle regressions**
  SDK stream fixtures cover tool-call identity, parallel/interleaved calls, usage, error chunks, and cancellation. Live provider acceptance remains separate.
- [x] **`FileSession` persistence regressions**
  Save → append → reload, legacy JSONL line endings, missing/corrupt file distinction, safe IDs, and symlink boundaries.
- [x] **Complete context-compaction exchanges**
  Summary/sliding strategies retain user instructions with tool calls/results. Summaries include tool input and task constraints; cancellation and summary errors propagate.
- [x] **Tool and permission boundaries**
  Default deny, explicit approval, real-path containment, argv-based worktree execution, tool timeouts, and WebFetch destination checks have focused local coverage.
- [ ] **Bundle size + render perf baselines**
  Deliverable: recorded baseline numbers for tarball size per package and
  `MessageList` render time at 100 / 1k / 5k items, enforced as CI budgets
  (no optimization yet — measurement first).
- [x] **Public API contract documentation**
  `EXPORTS.md` records the supported import surface and evolving APIs. This is a `0.x` contract, not a `v1.0.0` compatibility guarantee.
- [x] **Manual release checklist**
  `RELEASE.md` separates validation, npm publishing, and GitHub tag/release actions.
- [ ] **Release delivery and history**
  Publish only with explicit authorization; record verified npm versions and tags after the release succeeds.
- [ ] **License and distribution review**
  Verify applicable licenses, redistribution permissions, and bundled dependency notices before release; see `RELEASE.md`.

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
