# Development Roadmap

## Current Status

### Packages
| Package | Version | Status |
|---------|---------|--------|
| `@claude-code-kit/shared` | 0.1.0 | Published |
| `@claude-code-kit/ink-renderer` | 0.1.0 | Published |
| `@claude-code-kit/ui` | 0.1.0 | Published |
| `@claude-code-kit/types` | 0.1.0 | Built, unpublished |
| `@claude-code-kit/agent` | 0.1.0 | Built, unpublished |
| `@claude-code-kit/tools` | 0.1.0 | Built, unpublished |

### UI Completion: ~70%
- 30+ components: REPL, Select, PromptInput, MessageList, Spinner, DiffView, PermissionRequest, etc.
- Design system: ThemeProvider (4 themes, 33 tokens), Dialog, Tabs, FuzzyPicker
- Commands framework, keybindings system, virtual scroll

---

## Phase 1: Agent Core (v0.2.0) -- COMPLETED

- `@claude-code-kit/types` — Pure interfaces (Message, Tool, Provider, Agent, Permission)
- `@claude-code-kit/agent` — Agent class, AnthropicProvider, OpenAIProvider, MockProvider, ToolRegistry, ContextManager, Permission handler

---

## Phase 2: Tools + Enhancement (v0.3.0) -- COMPLETED

- `@claude-code-kit/tools` — 7 built-in tools (Bash, Read, Edit, Write, Glob, Grep, WebFetch)
- UI-Agent bridge — useAgent hook, AgentProvider, AgentREPL
- SummarizationCompactor, FileSessionStore (JSONL)
- Agent tests — 16 tests passing with MockProvider

---

## Phase 3: Multi-Agent + Ecosystem (v0.4.0)

- Multi-agent coordinator (SubagentManager, task delegation)
- MessageBus + BusAgentRunner (Slack, Telegram, webhooks)
- MCP client integration
- Structured output / response format

---

## Phase 4: Polish (v1.0.0)

- Documentation site
- `npx create-cck-app` scaffolding
- Plugin system
- Performance benchmarks
- Comprehensive test suite (>80% coverage)
- Stable API contract
