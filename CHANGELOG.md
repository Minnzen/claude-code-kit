# Changelog

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
