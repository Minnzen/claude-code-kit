# Changelog

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
