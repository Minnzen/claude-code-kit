# @claude-code-kit/ui

30+ terminal UI components inspired by Claude Code — REPL, Select, PromptInput, Spinner, MessageList, keybindings, commands, and optional agent bridge UI.

Part of [claude-code-kit](https://github.com/Minnzen/claude-code-kit).

## Installation

```bash
pnpm add @claude-code-kit/ui@0.4.0 @claude-code-kit/ink-renderer@0.4.0 react@19.2.4 react-reconciler@0.33.0
```

Version `0.4.0` supports Node.js 22+, React 19.2.x, and react-reconciler 0.33.x. For TSX examples use an ESM app (`"type": "module"`) with `tsx`, or compile TypeScript first.

## Quick Start

```tsx
import React, { useState } from 'react'
import { render } from '@claude-code-kit/ink-renderer'
import { REPL, type Message } from '@claude-code-kit/ui'

function App() {
  const [msgs, setMsgs] = useState<Message[]>([])
  return <REPL messages={msgs} onSubmit={(text) => {
    setMsgs(previous => [...previous, { id: crypto.randomUUID(), role: 'user', content: text }])
  }} />
}

await render(<App />)
```

## Included

- Chat UI: `REPL`, `AgentREPL`, `MessageList`, `PromptInput`, `StreamingText`
- Pickers: `Select`, `MultiSelect`, `FuzzyPicker`
- Status UI: `Spinner`, `StatusLine`, `StatusIcon`, `ProgressBar`, `Divider`
- Rendering helpers: `Markdown`, `MarkdownTable`, `DiffView`, `SearchOverlay`
- Design system: `ThemeProvider`, `Dialog`, `Tabs`, `Pane`, `ThemedBox`, `ThemedText`
- App wiring: command registry, keybindings, `useAgent`, `AgentProvider`, `AuthFlowUI`

## API status

- Supported core surface: core UI components, design-system primitives, commands, keybindings
- Optional bridge: `AgentREPL`, `useAgent`, `AgentProvider`, `AuthFlowUI` require `@claude-code-kit/agent`; the `0.4.0` release's optional peer range is `^0.4.0`

## Lifecycle and history in 0.4.0

`useAgent().submit()`, `cancel()`, and `clearMessages()` return promises. Await cancellation/clear before replacement work. `AgentREPL` wires cancellation to the bridge; standalone `REPL` accepts `onCancel` for Ctrl+C during loading or a permission request.

The bridge inherits the existing Agent permission policy: allowed requests proceed, explicit denials remain denied, and only denials marked `approvalRequired: true` open a permission dialog. Default read-only approval remains automatic. Late asynchronous policy results cannot open a prompt after cancellation, a replacement submission, or unmount. `REPL.onError` accepts a synchronous or async observer; callback failures display an error and release the submission guard.

The dialog's `a` / `always_allow` authorizes a tool name for the current mounted session across subsequent runs on that Agent. UI grants remain in memory, reset on Agent change/unmount, and do not override the original policy's explicit denial or `alwaysDeny`.

`REPL.historyHeight` sets the bounded history viewport; its default follows terminal height. PageUp/PageDown and the wheel scroll, Ctrl+End returns to the tail, and Ctrl+F finds text/tool/code/diff/error content and scrolls to the matched message. `MessageList.viewportHeight` enables a bounded standalone viewport. `VirtualList` exposes a `VirtualListHandle` ref (`scrollTo`, `scrollToEnd`, `scrollBy`) and measures visible row heights; `itemKey` keeps measurement identity stable and `followOutput` controls tail following.

Import `useTheme` from this package and wrap the app in `ThemeProvider`. The renderer's old no-op theme hook is removed. Component behavior has local regression coverage; source tests and mounted renderer tests are separate from acceptance in a real user terminal.

## Docs

- Full project docs: [github.com/Minnzen/claude-code-kit](https://github.com/Minnzen/claude-code-kit)
- Components overview: [docs/components.md](https://github.com/Minnzen/claude-code-kit/blob/main/docs/components.md)

## License

MIT
