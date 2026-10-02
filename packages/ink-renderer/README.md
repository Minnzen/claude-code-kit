# @claude-code-kit/ink-renderer

Terminal rendering engine for claude-code-kit — React reconciler, Yoga Flexbox layout, keyboard/mouse events, ANSI output.

Part of [claude-code-kit](https://github.com/Minnzen/claude-code-kit).

## Installation

```bash
pnpm add @claude-code-kit/ink-renderer@0.4.0 react@19.2.4 react-reconciler@0.33.0
```

Version `0.4.0` supports Node.js 22+, React 19.2.x, and react-reconciler 0.33.x. Use the React/reconciler pairing shown above.

Use an ESM app (`"type": "module"` in `package.json`) and a TSX runner, or compile TypeScript before running it. Package-root imports support both ESM and CommonJS. Import `ThemeProvider` and the stateful `useTheme` from `@claude-code-kit/ui`; the renderer's former no-op theme hook is removed in the checkout.

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
