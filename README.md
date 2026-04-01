# claude-code-kit

A terminal UI toolkit for building rich CLI applications with React. Inspired by the architecture behind Claude Code.

Build interactive REPLs, selection menus, streaming dashboards, and full-featured terminal interfaces using a familiar component model -- React components, Flexbox layout via Yoga, and hooks for input handling.

## Features

- **React component model** -- Build terminal UIs the same way you build web UIs. Components, hooks, state, effects.
- **Flexbox layout** -- Pure TypeScript Yoga layout engine. No native bindings required.
- **Zero-flicker rendering** -- Diffed terminal output. Only changed regions are rewritten.
- **Rich component library** -- REPL, Select, MultiSelect, PromptInput, Spinner, StreamingText, MessageList, and more.
- **Command framework** -- Define and register slash commands with built-in fuzzy matching.
- **Keybinding system** -- Declarative key bindings with user-overridable configuration.
- **Streaming-first** -- Designed for real-time data: AI responses, log tails, WebSocket feeds.
- **Cross-platform** -- Works on macOS, Linux, and Windows terminals with broad ANSI support.

## Packages

| Package | Description |
|---------|-------------|
| `@claude-code-kit/shared` | Yoga layout engine (pure TS port), text measurement, ANSI utilities |
| `@claude-code-kit/ink-renderer` | Terminal rendering engine -- React reconciler, layout, diffed output, input handling |
| `@claude-code-kit/ui` | UI component library -- REPL, Select, Spinner, PromptInput, and 20+ more |

## Quick Start

### From source (current)

```bash
git clone https://github.com/Minnzen/claude-code-kit.git
cd claude-code-kit
pnpm install
pnpm build

# Run the interactive demo
cd examples/hello-world
npx tsx index.tsx
```

### From npm (when published)

```bash
pnpm add @claude-code-kit/ink-renderer @claude-code-kit/ui react
```

### Hello World

```tsx
import { render, Box, Text } from "@claude-code-kit/ink-renderer";

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">Hello from claude-code-kit!</Text>
      <Text>Build terminal UIs like React apps.</Text>
    </Box>
  );
}

await render(<App />);
```

## Components

### Rendering primitives (`@claude-code-kit/ink-renderer`)

| Component | Description |
|-----------|-------------|
| `Box` | Flexbox container with padding, margin, borders |
| `Text` | Styled text with color, bold, dim, underline, strikethrough |
| `Spacer` | Flexible space that fills available room |
| `Newline` | Explicit line break |
| `Link` | Clickable terminal hyperlink |
| `Button` | Focusable button with click handling |
| `ScrollBox` | Scrollable content region with ref-based control |
| `AlternateScreen` | Switches to the terminal alternate buffer |
| `RawAnsi` | Renders pre-formatted ANSI escape sequences |
| `ErrorOverview` | Formatted error display with stack traces |

### UI components (`@claude-code-kit/ui`)

| Component | Description |
|-----------|-------------|
| `REPL` | Full read-eval-print loop with message history, streaming, slash commands |
| `Select` | Single-item picker with keyboard navigation and descriptions |
| `MultiSelect` | Multi-item picker with toggle and confirm |
| `PromptInput` | Text input with history, multiline, and completion |
| `MessageList` | Scrollable message feed (user/assistant/system roles) |
| `StreamingText` | Progressive text reveal, character by character |
| `Spinner` | Animated loading indicator with verb rotation and elapsed time |
| `ProgressBar` | Visual progress with customizable fill and colors |
| `StatusLine` | Bottom status bar with flexible segments |
| `StatusIcon` | Success/warning/error indicator icons |
| `Divider` | Horizontal rule with optional title and color |
| `Markdown` | Terminal markdown rendering (bold, code, lists, headings) |
| `MarkdownTable` | Formatted table rendering from markdown |

### Design system (`@claude-code-kit/ui`)

| Component | Description |
|-----------|-------------|
| `ThemeProvider` | Theme context for consistent styling |
| `ThemedBox` / `ThemedText` | Theme-aware layout and text |
| `Dialog` | Modal dialog overlay |
| `FuzzyPicker` | Fuzzy search picker |
| `Tabs` | Tab navigation |
| `Pane` | Panel container with title |
| `ListItem` | Styled list row |
| `LoadingState` | Loading placeholder |
| `KeyboardShortcutHint` | Inline shortcut display |

### Hooks

| Hook | Description |
|------|-------------|
| `useInput` | Raw keyboard input handling |
| `useApp` | App lifecycle (exit, stdin) |
| `useKeybinding` | Declarative key binding registration |
| `useTerminalSize` | Reactive terminal dimensions |
| `useDoublePress` | Double-tap gesture detection |
| `useInterval` / `useAnimationTimer` | Timed updates |
| `useAnimationFrame` | Frame-synced animations |
| `useTerminalTitle` | Set terminal window title |
| `useSelection` | Text selection state |
| `useSearchHighlight` | Search match highlighting |

## Usage Examples

### Interactive REPL

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

    // Call your AI API, run a command, etc.
    const response = await getResponse(text);

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

### Selection Menu

```tsx
import { render, Box, Text, Newline } from "@claude-code-kit/ink-renderer";
import { Select } from "@claude-code-kit/ui";

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Choose a framework:</Text>
      <Newline />
      <Select
        options={[
          { value: "next", label: "Next.js", description: "Full-stack React framework" },
          { value: "remix", label: "Remix", description: "Web standards focused" },
          { value: "astro", label: "Astro", description: "Content-driven websites" },
        ]}
        defaultValue="next"
        onChange={(value) => console.log("Selected:", value)}
      />
    </Box>
  );
}

await render(<App />);
```

### Spinner with Status

```tsx
import { render, Box, Text } from "@claude-code-kit/ink-renderer";
import { Spinner, StatusIcon } from "@claude-code-kit/ui";

function App() {
  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Spinner verb="Installing" label="dependencies" color="cyan" />
      <Spinner verbs={["Thinking", "Analyzing", "Reasoning"]} />
      <Box gap={1}>
        <StatusIcon status="success" />
        <Text color="green">Build completed</Text>
      </Box>
    </Box>
  );
}

await render(<App />);
```

## Inspired by Claude Code

This project draws architectural inspiration from [Claude Code](https://claude.ai/code), Anthropic's AI coding assistant. The rendering engine is derived from Claude Code's terminal UI layer, which itself builds on ideas from [Ink](https://github.com/vadimdemedes/ink).

Key differences from the original:

- **All UI components are clean rewrites** -- REPL, Select, PromptInput, Spinner, and every other component in `@claude-code-kit/ui` were built from scratch for this toolkit. They are not extracted from Claude Code.
- **The rendering engine (`@claude-code-kit/ink-renderer`) is extracted** from Claude Code's source and adapted for standalone use. It includes the React reconciler, Yoga layout integration, and terminal output diffing.
- **The Yoga layout engine (`@claude-code-kit/shared`) is a pure TypeScript port** -- no native bindings, no WASM. Works everywhere Node runs.

This is an independent community project. It is not affiliated with or endorsed by Anthropic.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the demo
cd examples/hello-world
npx tsx index.tsx
```

The project uses [Turborepo](https://turbo.build) for builds and [pnpm workspaces](https://pnpm.io/workspaces) for package management.

## License

MIT
