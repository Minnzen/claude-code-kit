# @claude-code-kit/ui

30+ terminal UI components inspired by Claude Code — REPL, Select, PromptInput, Spinner, MessageList, keybindings, commands, and optional agent bridge UI.

Part of [claude-code-kit](https://github.com/Minnzen/claude-code-kit).

## Installation

```bash
pnpm add @claude-code-kit/ui react
```

## Quick Start

```tsx
import React, { useState } from 'react'
import { render } from '@claude-code-kit/ink-renderer'
import { REPL, type Message } from '@claude-code-kit/ui'

function App() {
  const [msgs, setMsgs] = useState<Message[]>([])
  return <REPL messages={msgs} onSubmit={async (text) => { /* your logic */ }} />
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

- Stable in `v0.3.x`: core UI components, design-system primitives, commands, keybindings
- Optional bridge: `AgentREPL`, `useAgent`, `AgentProvider`, `AuthFlowUI` require `@claude-code-kit/agent`

## Docs

- Full project docs: [github.com/Minnzen/claude-code-kit](https://github.com/Minnzen/claude-code-kit)
- Components overview: [docs/components.md](https://github.com/Minnzen/claude-code-kit/blob/main/docs/components.md)

## License

MIT
