# Changelog

## 0.3.2 (2026-05-12)

### Breaking Changes
- **engines.node bumped from `>=18` to `>=20`** in all 5 packages. The
  prior `>=18` declaration was a false promise: one of our transitive deps
  (`supports-hyperlinks@4`) requires Node ≥ 20 and uses ES2024 regex `v`
  flags. Node 18 has been EOL since April 2025; the new cross-env smoke
  matrix exposed the existing-but-silent breakage.

### Bug Fixes
- **shared / ink-renderer / ui**: bundle ESM-only dependencies into the CJS
  output via tsup's `noExternal`. The full set is now:
  - `shared`: `@alcalzone/ansi-tokenize`, `get-east-asian-width`
  - `ink-renderer`: `@alcalzone/ansi-tokenize`, `auto-bind`, `chalk`,
    `cli-boxes`, `code-excerpt`, `get-east-asian-width`, `indent-string`,
    `strip-ansi`, `supports-hyperlinks`, `wrap-ansi`
  - `ui`: `chalk`, `figures`, `marked`, `strip-ansi`

  All listed packages ship as `"type": "module"` with no `require` export.
  Without bundling, our CJS dist emitted `require("...")` calls that
  crashed on Node 20.0–20.16 with `ERR_REQUIRE_ESM` /
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Same shape as the 0.3.1 semver fix
  (#1), but those packages are ESM-only so a static import is not enough.

  The smoke matrix now pins Node to `20.16.0` (instead of the floating
  `20` tag, which resolves to ≥20.17 where require-of-ESM is stable and
  silently masks this class of bug).
- **agent**: compaction errors no longer escape `Agent.run()` as raw
  rejections. Both proactive (`maybeCompact`, before each turn) and
  reactive (`forceCompact`, after `context-too-long`) compaction calls are
  now wrapped in try/catch and converted into the documented
  `error` + `done` event sequence. Previously a `SummarizationCompaction`
  whose provider call failed would crash the agent's async iterator
  instead of yielding a structured error.
- **agent**: `context-too-long` retry now bails when compaction makes no
  progress. Built-in compaction strategies are best-effort — they do not
  honor the `maxTokens` argument as a hard guarantee — so the previous
  `forceCompact` + `continue` loop could wedge the agent forever when the
  current strategy could not shrink the history below the model's limit.
  The agent now measures token counts before and after `forceCompact()`
  and surfaces a `Context too long and compaction made no progress` error
  if the count did not strictly decrease.

### Features
- **agent**: `MicroCompaction` — cheap, deterministic compaction that
  clears old tool-result content while preserving every other message and
  the assistant's `toolCalls` array (decision trail). Aligned with Claude
  Code's microcompact strategy verbatim: same
  `[Old tool result content cleared]` placeholder, same default
  `keepRecentN: 5`, same `Math.max(1, n)` floor, same 9-tool whitelist
  (`DEFAULT_COMPACTABLE_TOOLS`: `Read`, `Bash`, `PowerShell`, `Grep`,
  `Glob`, `WebSearch`, `WebFetch`, `Edit`, `Write`). Idempotent.
- **agent**: `LayeredCompaction` — runs an array of strategies in
  sequence, re-estimating tokens after each layer and short-circuiting
  once the budget is met. Recommended stack: `MicroCompaction` →
  `SummarizationCompaction` → `SlidingWindowCompaction`.
- **agent**: `SummarizationCompaction` now filters out cleared tool-result
  sentinels when building its transcript, so the recommended layered stack
  does not produce a summary that literally echoes
  `[Old tool result content cleared]`.
- **agent**: `CompactionStrategy.shouldCompact` is now an optional method
  on the interface, and `ContextManager.maybeCompact` honors it. Strategy
  options like `MicroCompaction.thresholdFraction` and
  `SummarizationCompaction.thresholdFraction` actually take effect now.
  `LayeredCompaction.shouldCompact` returns true when any layer would
  trigger.
- **agent**: README gains a "Context compaction" section with a strategy
  comparison table, recommended layered stack, and the Claude Code
  system-prompt instruction users should ship alongside `MicroCompaction`.

### Infrastructure
- **CI**: cross-environment import smoke matrix. Each published package is
  loaded under three loaders (ESM, CJS, tsx) on Node 20 / 22 / 24 and a
  curated set of named exports is asserted (including the new 0.3.2
  compaction surface: `MicroCompaction`, `LayeredCompaction`,
  `TOOL_RESULT_CLEARED_MESSAGE`, `DEFAULT_COMPACTABLE_TOOLS`). Runs
  locally as `pnpm smoke`. Catches the regression class that produced
  both 0.3.1 #1 and the 0.3.2 ESM-only CJS-require crashes.
- `pnpm release:check` now includes the smoke job.
- `tests/smoke/` workspace package added (own `package.json`,
  workspace-level peers including `react-reconciler`).

### Documentation
- `docs/roadmap.md`: bumped to 0.3.1 baseline, "Now" section refocused on
  stability + optimization (cross-env smoke matrix, UI behavior tests,
  provider streaming tests, FileSession round-trip, bundle/perf budgets,
  stable API contract pass, release checklist) ahead of adoption work
  (docs site, scaffolding, starters).

---

## 0.3.1 (2026-05-09)

### Bug Fixes
- **shared**: replace CJS `require()` with static ESM import for `semver`,
  fixes `Dynamic require of "semver" is not supported` crash under `tsx` and
  other native ESM loaders (#1, thanks @EduardF1)
- **ink-renderer**: use `Object.hasOwn` fallback for ES2020 lib compatibility
- **ink-renderer**: resolve DTS build errors in `render-to-screen.ts` and `screen.ts`
- **ui**: use stable React keys in `MessageList` / `DiffView` / `PermissionRequest` /
  `StatusLine` / `WelcomeScreen` / `PromptInput` to avoid list-rerender state corruption
- **agent**: tighten MCP transport constructor types and sync MCP client version to 0.3.0

### Infrastructure
- migrate Biome to v2.4.10 across all packages
- CI now runs lint and tests in addition to build / typecheck

---

## 0.3.0 (2026-04-04)

### Agent Core
- **MCP client integration** — Dynamic tool discovery from MCP servers (stdio + HTTP transport)
- **Parallel tool execution** — readOnly tools run in parallel; configurable `maxConcurrentTools`

### New Tools (7 -> 17)
- **WebSearch** — DuckDuckGo search with `allowed_domains` / `blocked_domains` filtering
- **TaskCreate / TaskUpdate / TaskGet / TaskList** — Multi-agent task management with owner, `blocks` / `blockedBy` dependency tracking
- **Agent (subagent)** — Spawn independent child agents with timeout and abort propagation
- **NotebookEdit** — Jupyter notebook cell editing (insert / replace / delete) with metadata preservation
- **LSP** — Language Server Protocol integration via factory pattern (`createLspTool`)
- **EnterWorktree / ExitWorktree** — Git worktree lifecycle management

### Tool Enhancements
- **Grep**: Full rewrite with 10 new params — `output_mode`, `-A` / `-B` / `-C` context, `head_limit`, `offset`, `multiline`, `type`, `-i`, `-n`
- **Bash**: Required `description` param, `run_in_background`, 120 s default timeout, `sandbox` flag
- **Read**: Default 2000-line limit, `pages` param for PDFs, image base64 support (PNG/JPG/GIF/WEBP/BMP)
- **Edit**: `replace_all` param for global find-and-replace
- **WebFetch**: `prompt` param, HTML-to-Markdown conversion, HTTP-to-HTTPS upgrade, 15-min response cache
- **WebSearch**: `allowed_domains` / `blocked_domains` filtering
- **NotebookEdit**: `cell_id` locator as alternative to `cell_number`
- **Glob**: Results sorted by modification time

### Breaking Changes
- All tool names changed to **PascalCase** (`bash` -> `Bash`, `read` -> `Read`, etc.)
- All params changed to **snake_case** (`path` -> `file_path`, `oldString` -> `old_string`, etc.)
- Grep default `output_mode` is now `files_with_matches` (was `content`)
- Task tool split from 1 tool into 4 independent tools (`createTaskTool` returns `TaskToolSet`)

### Infrastructure
- All tool descriptions rewritten to Claude Code style (10-50 line LLM behavior guides)
- Complete security marks (`isDestructive`, `requiresConfirmation`) on all write tools
- vitest config excludes worktrees and `node_modules`
- **498 tests** across 20 test files

---

## 0.2.0 (2026-04-01)

### New packages
- `@claude-code-kit/agent` v0.2.0 — Headless agent framework: Agent class, multi-provider (Anthropic, OpenAI, Ollama), AsyncGenerator-based agent loop
- `@claude-code-kit/tools` v0.2.0 — Built-in tools: Bash, Read, Edit, Write, Glob, Grep, WebFetch

### Features
- **Auth framework** — Provider registry with environment variable, stored credential, and custom auth methods; file-based and in-memory credential storage
- **Permission system** — Tiered permission handler with auto-approve for read-only tools, always-allow/deny lists, session-level approval
- **Compaction strategies** — Sliding-window and LLM-based summarization compaction with configurable model
- **Session persistence** — JSONL file-backed sessions with session store management
- **Mock provider** — First-class scripted provider for testing and demos
- **Context management** — Automatic context window management with reactive compaction on overflow

### Fixes
- Fixed hardcoded summarization model — now configurable via `summaryModel` option
- Pinned `zod` dependency to `>=3.20.0` (was `*`)
- Added `zod-to-json-schema` as optional peer dependency for Zod v3 fallback
- Eliminated `any` types across agent and tools packages

### Tests
- 181 tests covering agent loop, providers, tools, permissions, auth, sessions, compaction, and context management

---

## 0.1.0 (2026-04-01)

Initial release.

### Packages
- `@claude-code-kit/shared` v0.1.0 — Yoga layout engine, utilities
- `@claude-code-kit/ink-renderer` v0.1.0 — Terminal rendering engine
- `@claude-code-kit/ui` v0.1.0 — 25+ UI components

### Components
- REPL, Select, MultiSelect, PromptInput, MessageList, StreamingText
- Spinner, ProgressBar, StatusIcon, StatusLine, Divider
- Markdown, MarkdownTable, DiffView, PermissionRequest
- SearchOverlay, WelcomeScreen, VirtualList
- CommandRegistry, keybindings system
- ThemeProvider (4 themes, 33 tokens)
- Design system: Dialog, Tabs, FuzzyPicker, Pane, ListItem, etc.
