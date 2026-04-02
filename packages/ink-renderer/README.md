# @claude-code-kit/ink-renderer

Terminal rendering engine for claude-code-kit — React reconciler, Yoga Flexbox layout, keyboard/mouse events, ANSI output.

Part of [claude-code-kit](https://github.com/Minnzen/claude-code-kit).

## Installation

```bash
pnpm add @claude-code-kit/ink-renderer react
```

## Quick Start

```tsx
import React from 'react'
import { render, Box, Text } from '@claude-code-kit/ink-renderer'

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">Hello from claude-code-kit</Text>
      <Text>Build terminal UIs like React apps.</Text>
    </Box>
  )
}

await render(<App />)
```

## Included

- Rendering API: `render`, `renderSync`, `createRoot`
- Primitives: `Box`, `Text`, `Spacer`, `Newline`, `Link`, `Button`, `ScrollBox`
- Hooks: `useInput`, `useApp`, `useStdin`, `useInterval`, `useAnimationFrame`
- Terminal helpers: `AlternateScreen`, `RawAnsi`, `Ansi`, `ErrorOverview`

## Docs

- Full project docs: [github.com/Minnzen/claude-code-kit](https://github.com/Minnzen/claude-code-kit)
- Components overview: [docs/components.md](https://github.com/Minnzen/claude-code-kit/blob/main/docs/components.md)

## License

MIT
