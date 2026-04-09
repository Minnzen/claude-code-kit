[English](./README.md) | [中文](./README.zh-CN.md)

<div align="center">

# claude-code-kit

**Build Claude Code-quality terminal apps with React components and a headless agent framework.**

[![npm version](https://img.shields.io/npm/v/@claude-code-kit/ui.svg?style=flat-square&color=DA7756)](https://www.npmjs.com/package/@claude-code-kit/ui)
[![npm downloads](https://img.shields.io/npm/dm/@claude-code-kit/ui.svg?style=flat-square)](https://www.npmjs.com/package/@claude-code-kit/ui)
[![license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)

<img src="./demo.gif" alt="claude-code-kit demo" width="600" />

</div>

---

## Why this exists

[Ink](https://github.com/vadimdemedes/ink) is effectively unmaintained. Claude Code has the best terminal UI in the industry. We extracted its rendering engine, rewrote all the components from scratch, and built an open agent framework on top.

## Feature highlights

- **10 ready-to-use built-in tools** for file, shell, web, and worktree workflows
- **Advanced tool factories** for MCP-backed integrations, LSP, subagents, tasks, and notebooks
- **MCP client** for dynamic tool discovery from any MCP server (stdio + HTTP)
- **Parallel tool execution** -- read-only tools run concurrently
- **React component model** with Flexbox layout via a pure-TS Yoga engine
- **Provider-agnostic** -- Anthropic, OpenAI, Ollama, DeepSeek, Groq, or any OpenAI-compatible `baseURL`
- **498 tests** across 20 test files

## Current status

- `v0.3.0` packages are published
- `build`, `typecheck`, `test`, and `lint` all pass in the monorepo
- 3 maintained examples: `hello-world`, `agent-cli`, `alt-screen-dashboard`

## API status

### Stable in v0.3.x

- `@claude-code-kit/shared`, `@claude-code-kit/ink-renderer`, and the core `@claude-code-kit/ui` component set
- Agent loop, Anthropic/OpenAI/Mock providers, permissions, sessions, and compaction
- `builtinTools`: `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `EnterWorktree`, `ExitWorktree`

### Experimental / evolving

- `MCPClient` and MCP-backed tool discovery
- Higher-level tool factories: `createLspTool`, `createSubagentTool`, `createTaskTool`, `notebookEditTool`
- APIs outside `builtinTools` may still change during `0.x`

## Quick Start

### UI only

```bash
pnpm add @claude-code-kit/ui react
```

```tsx
import { render, Box } from "@claude-code-kit/ink-renderer";
import { REPL, type Message } from "@claude-code-kit/ui";
import { useState, useCallback } from "react";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const handleSubmit = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: text }]);
    const response = await callYourApi(text);
    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: "assistant", content: response },
    ]);
  }, []);

  return (
    <Box padding={1} flexDirection="column" flexGrow={1}>
      <REPL messages={messages} onSubmit={handleSubmit} placeholder="Ask anything..." />
    </Box>
  );
}

await render(<App />);
```

### Agent

```bash
pnpm add @claude-code-kit/agent @claude-code-kit/tools
```

```typescript
import { Agent, AnthropicProvider, createPermissionHandler } from "@claude-code-kit/agent";
import { bashTool, readTool, editTool, globTool, grepTool } from "@claude-code-kit/tools";

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  model: "claude-sonnet-4-20250514",
  tools: [bashTool, readTool, editTool, globTool, grepTool],
  permissionHandler: createPermissionHandler({ autoApproveReadOnly: true }),
});

const result = await agent.chat("What files are in src/?");
console.log(result);
```

Connect to a terminal UI in one line:

```tsx
import { render } from "@claude-code-kit/ink-renderer";
import { AgentREPL } from "@claude-code-kit/ui";

await render(<AgentREPL agent={agent} placeholder="Ask me about your codebase..." />);
```

## Packages

| Package | Description |
|---------|-------------|
| [`@claude-code-kit/shared`](./packages/shared) | Yoga layout engine (pure TS), text measurement, ANSI utilities |
| [`@claude-code-kit/ink-renderer`](./packages/ink-renderer) | Terminal rendering engine -- React reconciler, layout, diffed output |
| [`@claude-code-kit/ui`](./packages/ui) | 30+ components plus commands, keybindings, and optional agent bridge UI |
| [`@claude-code-kit/agent`](./packages/agent) | Headless agent -- providers, permissions, sessions, compaction, experimental MCP |
| [`@claude-code-kit/tools`](./packages/tools) | 10 ready-to-use built-ins plus advanced tool factories |

## Ready-to-use built-ins

| Tool | Type | Description |
|------|------|-------------|
| Bash | write | Shell execution with timeout, background, sandbox |
| Read | read | File reading with line limits, PDF pages, image base64 |
| Edit | write | String replacement with `replace_all` for global edits |
| Write | write | Create or overwrite files |
| Glob | read | File pattern matching, sorted by modification time |
| Grep | read | Regex search with context, head_limit, multiline, type filter |
| WebFetch | read | HTTP fetch with HTML-to-Markdown, HTTPS upgrade, caching |
| WebSearch | read | DuckDuckGo search with domain allow/block lists |
| EnterWorktree | write | Create and enter a git worktree |
| ExitWorktree | write | Clean up and exit a git worktree |

These are the tools included in `builtinTools` and the safest default surface to depend on in `v0.3.x`.

## Advanced tool factories

| Export | Output | Status | Description |
|--------|--------|--------|-------------|
| `createLspTool` | `LSP` tool | Experimental | Language Server Protocol queries against a caller-provided transport |
| `createSubagentTool` | `Agent` tool | Experimental | Delegates isolated work to a child agent with timeout and abort propagation |
| `createTaskTool` | `TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList` | Experimental | In-memory task orchestration toolset for multi-step work |
| `notebookEditTool` | `NotebookEdit` tool | Experimental | Jupyter notebook cell insert/replace/delete |

## Comparison

| | claude-code-kit | Ink | Aider | Goose |
|---|---|---|---|---|
| Terminal UI components | 30+ React components | 10+ (unmaintained) | -- | -- |
| Flexbox layout | Pure TS Yoga | Native Yoga binding | -- | -- |
| Headless agent | Yes (provider-agnostic) | -- | Yes (Python) | Yes (Python) |
| Built-in tools | 10 built-ins + factories | -- | ~10 | ~10 |
| MCP client | Yes | -- | -- | Yes |
| Parallel tool execution | Yes | -- | -- | -- |
| Language | TypeScript | TypeScript | Python | Python |
| UI + Agent in one package | Yes | -- | -- | -- |

## Examples

| Example | Description |
|---------|-------------|
| [`agent-cli`](./examples/agent-cli) | Mini coding assistant with auth, tools, and permission prompts |
| [`hello-world`](./examples/hello-world) | Interactive component showcase (Select, Spinner, Markdown, etc.) |
| [`alt-screen-dashboard`](./examples/alt-screen-dashboard) | System monitoring dashboard in alternate screen buffer |

```bash
pnpm --filter agent-cli-example start
```

## Development

```bash
pnpm install && pnpm release:check
```

## Provenance

The rendering engine (`@claude-code-kit/ink-renderer`) is extracted from Claude Code's terminal UI layer and adapted for standalone use. The Yoga layout engine (`@claude-code-kit/shared`) is a pure TypeScript port with no native bindings.

All UI components (`@claude-code-kit/ui`) and the agent framework (`@claude-code-kit/agent`, `@claude-code-kit/tools`) are original implementations written for this toolkit.

This is an independent community project. It is not affiliated with or endorsed by Anthropic.

## License

MIT
