# @claude-code-kit/ui

25+ terminal UI components inspired by Claude Code — REPL, Select, PromptInput, Spinner, MessageList, and more.

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

- Chat UI: `REPL`, `MessageList`, `PromptInput`, `StreamingText`
- Pickers: `Select`, `MultiSelect`, `FuzzyPicker`
- Status UI: `Spinner`, `StatusLine`, `StatusIcon`, `ProgressBar`, `Divider`
- Rendering helpers: `Markdown`, `MarkdownTable`
- Design system: `ThemeProvider`, `Dialog`, `Tabs`, `Pane`, `ThemedBox`, `ThemedText`

## Docs

- Full project docs: [github.com/Minnzen/claude-code-kit](https://github.com/Minnzen/claude-code-kit)
- Components overview: [docs/components.md](https://github.com/Minnzen/claude-code-kit/blob/main/docs/components.md)

## License

MIT
