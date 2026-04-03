# Development Roadmap

## Current Status

### Packages
| Package | Version | Status |
|---------|---------|--------|
| `@claude-code-kit/shared` | 0.1.0 | Published |
| `@claude-code-kit/ink-renderer` | 0.1.0 | Published |
| `@claude-code-kit/ui` | 0.1.0 | Published |
| `@claude-code-kit/agent` | 0.1.0 | Built, unpublished |
| `@claude-code-kit/tools` | 0.1.0 | Built, unpublished |

### Stats
- 181 tests passing across 10 test files
- 0 security vulnerabilities (pnpm audit clean)
- 3 examples (hello-world, agent-cli, alt-screen-dashboard)

---

## Completed

### Phase 1: Agent Core
- Agent class (AsyncGenerator loop, stateful multi-turn, chat() API)
- AnthropicProvider, OpenAIProvider (with baseURL), MockProvider
- ToolRegistry, ContextManager, SlidingWindowCompactor
- Tiered permission handler (allowReadOnly default)

### Phase 2: Tools + Enhancement
- 7 built-in tools (Bash, Read, Edit, Write, Glob, Grep, WebFetch)
- UI-Agent bridge (useAgent, AgentProvider, AgentREPL)
- SummarizationCompactor (async LLM-based), FileSessionStore (JSONL)
- Auth framework with 8 preset providers + interactive flow UI
- AuthFlowUI component for provider selection + credential input

### Security hardening
- Path traversal protection in file tools
- SSRF protection in web-fetch (private IP blocking)
- Default permission changed to allowReadOnly
- Credential directory permissions (0o700)
- lodash-es dependency removed (inline replacements)

---

## Next: v0.2.0 Release

- [ ] Publish agent + tools to npm
- [ ] Update README with npm install instructions for all packages
- [ ] Record new demo GIF showing agent features

## Phase 3: Multi-Agent + Ecosystem

- [ ] Multi-agent coordinator (SubagentManager, task delegation)
- [ ] MessageBus + BusAgentRunner (Slack, Telegram, webhooks)
- [ ] MCP client integration (dynamic tool discovery)
- [ ] Structured output / response format
- [ ] Retry logic with exponential backoff

## Phase 4: Polish (v1.0.0)

- [ ] Documentation site (Bolt/Lovable)
- [ ] `npx create-cck-app` scaffolding
- [ ] UI component tests
- [ ] Performance benchmarks
- [ ] Stable API contract
