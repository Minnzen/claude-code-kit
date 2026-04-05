[English](./README.md) | [中文](./README.zh-CN.md)

<div align="center">

# claude-code-kit

[![npm version](https://img.shields.io/npm/v/@claude-code-kit/ui.svg?style=flat-square&color=DA7756)](https://www.npmjs.com/package/@claude-code-kit/ui)
[![npm downloads](https://img.shields.io/npm/dm/@claude-code-kit/ui.svg?style=flat-square)](https://www.npmjs.com/package/@claude-code-kit/ui)
[![license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)

**A terminal UI toolkit and headless agent framework for building rich CLI applications.**
**Inspired by the architecture behind Claude Code.**

[Quick Start](#quick-start) -- [Packages](#packages) -- [Components](#components) -- [Agent](#agent) -- [Examples](#examples)

<img src="./demo.gif" alt="claude-code-kit demo" width="600" />

</div>

---

Build interactive REPLs, selection menus, streaming dashboards, and LLM-powered coding assistants using a familiar component model — React components, Flexbox layout via Yoga, and a headless agent loop with pluggable tool execution.

## Features

- **React component model** -- Build terminal UIs the same way you build web UIs. Components, hooks, state, effects.
- **Flexbox layout** -- Pure TypeScript Yoga layout engine. No native bindings required.
- **Zero-flicker rendering** -- Diffed terminal output. Only changed regions are rewritten.
- **Rich component library** -- REPL, Select, MultiSelect, PromptInput, Spinner, StreamingText, MessageList, and more.
- **Headless agent framework** -- AsyncGenerator-based agent loop, multi-provider (Anthropic, OpenAI, Ollama), tiered permissions.
- **Built-in tools** -- Bash, Read, Edit, Write, Glob, Grep — same set Claude Code ships.
- **UI-Agent bridge** -- `AgentREPL`, `useAgent`, and `AgentProvider` connect the agent loop to the terminal UI.
- **Command framework** -- Define and register slash commands with built-in fuzzy matching.
- **Streaming-first** -- Designed for real-time data: AI responses, tool output, log tails.
- **Cross-platform** -- Works on macOS, Linux, and Windows terminals with broad ANSI support.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| `@claude-code-kit/shared` | published | Yoga layout engine (pure TS port), text measurement, ANSI utilities |
| `@claude-code-kit/ink-renderer` | published | Terminal rendering engine -- React reconciler, layout, diffed output, input handling |
| `@claude-code-kit/ui` | published | UI component library -- REPL, Select, Spinner, PromptInput, AgentREPL, and 20+ more |
| `@claude-code-kit/agent` | published | Headless agent framework -- Agent class, providers, tool interface, permissions |
| `@claude-code-kit/tools` | published | Built-in tools -- Bash, Read, Edit, Write, Glob, Grep |

## Quick Start

### UI-only (terminal components)

Install from npm:

```bash
pnpm add @claude-code-kit/ui react
```

Build a REPL that calls your own backend:

```tsx
import { render, Box } from "@claude-code-kit/ink-renderer";
import { REPL, type Message } from "@claude-code-kit/ui";
import { useState, useCallback } from "react";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: text }]);
    setIsLoading(true);
    const response = await callYourApi(text);
    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: "assistant", content: response },
    ]);
    setIsLoading(false);
  }, []);

  return (
    <Box padding={1} flexDirection="column" flexGrow={1}>
      <REPL
        messages={messages}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        commands={[
          { name: "clear", description: "Clear history", onExecute: () => setMessages([]) },
        ]}
        placeholder="Ask anything..."
      />
    </Box>
  );
}

await render(<App />);
```

### Agent

Install agent and tools from npm:

```bash
pnpm add @claude-code-kit/agent @claude-code-kit/tools
```

Wire up a headless agent with tools:

```typescript
import { Agent, AnthropicProvider } from "@claude-code-kit/agent";
import { readTool, globTool, grepTool, bashTool } from "@claude-code-kit/tools";

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  model: "claude-sonnet-4-20250514",
  tools: [readTool, globTool, grepTool, bashTool],
  systemPrompt: "You are a concise coding assistant.",
});

const result = await agent.chat("What files are in the src directory?");
console.log(result);
```

Connect the agent to a terminal UI with `AgentREPL`:

```tsx
import { render } from "@claude-code-kit/ink-renderer";
import { AgentREPL } from "@claude-code-kit/ui";
import { Agent, AnthropicProvider, createPermissionHandler } from "@claude-code-kit/agent";
import { readTool, globTool, grepTool, bashTool, editTool, writeTool } from "@claude-code-kit/tools";

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }),
  model: "claude-sonnet-4-20250514",
  tools: [bashTool, readTool, editTool, writeTool, globTool, grepTool],
  permissionHandler: createPermissionHandler({ autoApproveReadOnly: true }),
});

await render(<AgentREPL agent={agent} placeholder="Ask me about your codebase..." />);
```

## Components

### Rendering primitives (`@claude-code-kit/ink-renderer`)

| Component | Description |
|-----------|-------------|
| `Box` | Flexbox container with padding, margin, borders |
| `Text` | Styled text with color, bold, dim, underline, strikethrough |
| `Spacer` | Flexible space that fills available room |
| `ScrollBox` | Scrollable content region with ref-based control |
| `Button` | Focusable button with click handling |
| `ErrorOverview` | Formatted error display with stack traces |

Full list (Newline, Link, AlternateScreen, RawAnsi, etc.) in [docs/components.md](./docs/components.md).

### UI components (`@claude-code-kit/ui`)

| Component | Description |
|-----------|-------------|
| `REPL` | Full read-eval-print loop with message history, streaming, slash commands |
| `AgentREPL` | REPL pre-wired to an Agent -- handles tool calls, permission prompts, streaming |
| `Select` | Single-item picker with keyboard navigation and descriptions |
| `MultiSelect` | Multi-item picker with toggle and confirm |
| `PromptInput` | Text input with history, multiline, and completion |
| `MessageList` | Scrollable message feed (user/assistant/system roles) |
| `StreamingText` | Progressive text reveal, character by character |
| `Spinner` | Animated loading indicator with verb rotation and elapsed time |
| `ProgressBar` | Visual progress with customizable fill and colors |
| `StatusLine` | Bottom status bar with flexible segments |
| `Divider` | Horizontal rule with optional title and color |
| `Markdown` | Terminal markdown rendering (bold, code, lists, headings) |
| `WelcomeScreen` | Branded launch screen with tips and subtitle |

### Hooks

| Hook | Description |
|------|-------------|
| `useInput` | Raw keyboard input handling |
| `useApp` | App lifecycle (exit, stdin) |
| `useKeybinding` | Declarative key binding registration |
| `useTerminalSize` | Reactive terminal dimensions |
| `useAgent` | Connect to an Agent instance, handle streaming and tool events |
| `useDoublePress` | Double-tap gesture detection |
| `useInterval` / `useAnimationTimer` | Timed updates |
| `useTerminalTitle` | Set terminal window title |

## Agent

`@claude-code-kit/agent` is a headless LLM agent framework. It has no dependency on React or the terminal renderer — you can run it in scripts, servers, or wire it to any UI.

### Providers

| Provider | Backend | Notes |
|----------|---------|-------|
| `AnthropicProvider` | Claude (claude-3-5-sonnet, claude-3-haiku, etc.) | Requires `@anthropic-ai/sdk` |
| `OpenAIProvider` | OpenAI, DeepSeek, Groq, SiliconFlow, Ollama | Accepts `baseURL` for local models |
| `MockProvider` | Scripted responses | First-class for testing and demos |

### Built-in tools (`@claude-code-kit/tools`)

| Tool | Permission tier | Description |
|------|----------------|-------------|
| `readTool` | auto-approve | Read file contents |
| `globTool` | auto-approve | Find files by glob pattern |
| `grepTool` | auto-approve | Search file contents with regex |
| `bashTool` | prompt user | Run shell commands |
| `editTool` | prompt user | Edit existing files |
| `writeTool` | prompt user | Write new files |

### Permissions

```typescript
import { createPermissionHandler } from "@claude-code-kit/agent";

// Auto-approve read-only tools; prompt for everything else
const handler = createPermissionHandler({ autoApproveReadOnly: true });

// Always allow specific tools
const handler = createPermissionHandler({ alwaysAllow: ["Glob", "Grep", "Read"] });
```

## Examples

### `examples/agent-cli`

A mini coding assistant in ~120 lines. The full-stack demo of the toolkit.

- Auto-detects API keys: Anthropic, OpenAI, DeepSeek, Groq, SiliconFlow, Ollama
- Falls back to a realistic mock when no key is present
- Read-only tools (Glob, Grep, Read) auto-approve; write tools prompt for permission
- `AgentREPL` handles the full UI including streaming, tool call display, and permission dialogs

```bash
pnpm --filter agent-cli-example start
```

### `examples/hello-world`

Interactive component showcase. Demonstrates Select, MultiSelect, Spinner, ProgressBar, Markdown, and other UI primitives. No agent required.

### `examples/alt-screen-dashboard`

System monitoring dashboard in the terminal alternate buffer. Polling metrics, live graphs.

## Provenance

The rendering engine (`@claude-code-kit/ink-renderer`) is extracted from Claude Code's terminal UI layer and adapted for standalone use. The Yoga layout engine (`@claude-code-kit/shared`) is a pure TypeScript port with no native bindings.

All UI components (`@claude-code-kit/ui`) and the agent framework (`@claude-code-kit/agent`, `@claude-code-kit/tools`) are original implementations written for this toolkit.

This is an independent community project. It is not affiliated with or endorsed by Anthropic.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

The project uses [Turborepo](https://turbo.build) for builds and [pnpm workspaces](https://pnpm.io/workspaces) for package management.

## License

MIT
