# claude-code-kit Component Documentation

Composable terminal UI components. This reference describes release `0.4.0`, including its lifecycle and history APIs.

## Installation

```bash
pnpm add @claude-code-kit/ink-renderer@0.4.0 @claude-code-kit/ui@0.4.0 react@19.2.4 react-reconciler@0.33.0
```

The checkout runtime is Node.js 22+, React 19.2.x, and react-reconciler 0.33.x. The command above installs published packages; use the checkout to try the new viewport/cancellation APIs. For TSX examples set `"type": "module"` and install `tsx`, or compile first.

## Quick Start

```tsx
import { render } from '@claude-code-kit/ink-renderer'
import { REPL, type Message } from '@claude-code-kit/ui'
import React, { useState } from 'react'

function App() {
  const [msgs, setMsgs] = useState<Message[]>([])

  const handleSubmit = async (text: string) => {
    setMsgs(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }])
    // call your LLM here...
  }

  return <REPL messages={msgs} onSubmit={handleSubmit} model="opus-4.6" />
}

await render(<App />)
```

---

## REPL

The main component. Composes MessageList, PromptInput, Spinner, Divider, and StatusLine into a complete chat interface with slash-command support.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSubmit` | `(message: string) => Promise<void> \| void` | *required* | Called when the user submits a message |
| `onExit` | `() => void` | `undefined` | Called on Ctrl+D. Falls back to `exit()` if not provided |
| `onCancel` | `() => void \| Promise<void>` | `undefined` | Called on Ctrl+C while loading or awaiting permission |
| `onError` | `(error: Error) => void \| Promise<void>` | `undefined` | Observes failed submit, command, or cancel callbacks; the original error is shown in red |
| `historyHeight` | `number` | Based on terminal rows | Visible history rows; reserves room for input/status/overlays |
| `messages` | `Message[]` | *required* | Array of messages to display |
| `isLoading` | `boolean` | `false` | Shows spinner and disables input when true |
| `streamingContent` | `string \| null` | `undefined` | Streaming assistant text shown with a block cursor |
| `commands` | `REPLCommand[]` | `[]` | Slash commands (`{ name, description, onExecute }`) |
| `model` | `string` | `undefined` | Model name shown in the status line |
| `statusSegments` | `StatusLineSegment[]` | `undefined` | Custom status line segments. Overrides the default model display |
| `prefix` | `string` | `'\u276F'` | Prompt prefix character |
| `placeholder` | `string` | `undefined` | Placeholder text shown when input is empty |
| `history` | `string[]` | `undefined` | Externally managed input history. If not provided, REPL tracks history internally |
| `renderMessage` | `(message: Message) => React.ReactNode` | `undefined` | Custom message renderer |
| `spinner` | `React.ReactNode` | `undefined` | Custom spinner component. Falls back to `<Spinner />` |

### REPLCommand

```ts
type REPLCommand = {
  name: string
  description: string
  onExecute: (args: string) => void
}
```

### Example

```tsx
<REPL
  messages={messages}
  onSubmit={handleSubmit}
  isLoading={loading}
  streamingContent={stream}
  model="opus-4.6"
  commands={[
    { name: 'clear', description: 'Clear screen', onExecute: () => clearMessages() },
  ]}
/>
```

### Keyboard

| Key | Action |
|-----|--------|
| `Ctrl+D` | Exit |
| `Ctrl+C` | Call `onCancel` during loading or a permission request when supplied |
| `PageUp` / `PageDown` | Scroll history by a viewport |
| Mouse wheel | Scroll history by rows |
| `Ctrl+End` | Return to the history tail |
| `Ctrl+F` | Search text, tool input/results, code, diffs, and errors; move the viewport to the selected match |

Input history (`history`) and visible conversation history (`historyHeight`) are separate. The REPL remains responsible for input/status layout; a custom `renderMessage` remains responsible for its content. Callback failures settle the submission guard so input can be submitted again. A failing `onError` observer does not replace the original displayed error or produce another unhandled callback failure.

## AgentREPL and useAgent

`AgentREPL` wraps `REPL` with `AgentProvider`, streamed event display, permission decisions, cancellation, and a `/clear` command. It requires the optional `@claude-code-kit/agent` peer. Props are `agent` (required), `model`, `commands`, `welcome`, `placeholder`, `onError`, and `onExit`.

`useAgent({ agent, onError? })` returns `messages`, `isLoading`, `streamingContent`, `permissionRequest`, and these lifecycle methods:

| Method | Returns | Behavior |
|---|---|---|
| `submit(input)` | `Promise<void>` | Drives one run and resolves after its event loop finishes |
| `cancel()` | `Promise<void>` | Requests cancellation, settles pending permission, and waits for the UI run to finish |
| `clearMessages()` | `Promise<void>` | Cancels active work before clearing Agent and UI history |

Await cancellation or clear when later work depends on completion. The headless Agent's `clearMessages()` is synchronous and requires idle; use `await agent.cancel()` first when handling it directly. The bridge installs a UI permission handler while mounted and restores it on cleanup.

The bridge first evaluates the existing permission policy. An `allow` result is honored automatically; an explicit `deny` remains denied. It opens a dialog only for `{ decision: 'deny', approvalRequired: true }`, which means approval is missing and an interactive host may ask. The default read-only policy and factory fallback use that flag; `alwaysDeny` and custom denials without it cannot be overridden by the UI. Late policy results after cancellation, replacement submission, or unmount cannot open a prompt for another run.

`PermissionUIRequest.resolve()` accepts `'allow'`, `'always_allow'`, or `'deny'`. In `AgentREPL`, the dialog's plain `a` shortcut / `always_allow` approves that tool name for the current mounted session, so later runs on the same Agent do not repeat a missing-approval dialog. This UI approval lives only in memory and resets when the Agent changes or the bridge unmounts. Every request still evaluates the original policy first; explicit denials take precedence over session approval.

---

## Select

Single-selection list with keyboard navigation and scroll support.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `SelectOption<T>[]` | *required* | List of options to choose from |
| `defaultValue` | `T` | `undefined` | Currently selected value (shown with checkmark) |
| `onChange` | `(value: T) => void` | *required* | Called when an option is selected |
| `onCancel` | `() => void` | `undefined` | Called when Escape is pressed |
| `title` | `string` | `undefined` | Title displayed above the list |
| `maxVisible` | `number` | `options.length` | Max visible options before scrolling |

### SelectOption

```ts
type SelectOption<T = string> = {
  value: T
  label: string
  description?: string
  disabled?: boolean
}
```

### Example

```tsx
<Select
  title="Choose a model"
  options={[
    { value: 'opus', label: 'Opus', description: 'Most capable' },
    { value: 'sonnet', label: 'Sonnet', description: 'Balanced' },
    { value: 'haiku', label: 'Haiku', description: 'Fastest' },
  ]}
  onChange={(value) => setModel(value)}
  maxVisible={5}
/>
```

### Keyboard

| Key | Action |
|-----|--------|
| `Up` / `k` | Move focus up |
| `Down` / `j` | Move focus down |
| `Enter` | Confirm selection |
| `Escape` | Cancel |
| `1`-`9` | Jump to option by number |

---

## MultiSelect

Multi-selection list. Extends Select with toggle and confirm semantics.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `SelectOption<T>[]` | *required* | List of options |
| `selectedValues` | `T[]` | `[]` | Initially selected values |
| `onToggle` | `(value: T) => void` | *required* | Called when an option is toggled |
| `onConfirm` | `(values: T[]) => void` | *required* | Called with all selected values on Enter |
| `onCancel` | `() => void` | `undefined` | Called on Escape |
| `title` | `string` | `undefined` | Title above the list |
| `maxVisible` | `number` | `options.length` | Max visible options |

### Example

```tsx
<MultiSelect
  title="Select features"
  options={[
    { value: 'dark', label: 'Dark mode' },
    { value: 'i18n', label: 'Internationalization' },
    { value: 'a11y', label: 'Accessibility' },
  ]}
  onToggle={(v) => console.log('toggled', v)}
  onConfirm={(selected) => applyFeatures(selected)}
/>
```

### Keyboard

| Key | Action |
|-----|--------|
| `Up` / `k` | Move focus up |
| `Down` / `j` | Move focus down |
| `Space` | Toggle current option |
| `Enter` | Confirm selections |
| `Escape` | Cancel |
| `1`-`9` | Jump and select by number |

---

## PromptInput

Text input with cursor navigation, command suggestions, and history.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | *required* | Current input value (controlled) |
| `onChange` | `(value: string) => void` | *required* | Called on every keystroke |
| `onSubmit` | `(value: string) => void` | *required* | Called on Enter |
| `placeholder` | `string` | `''` | Placeholder when input is empty |
| `prefix` | `string` | `'>'` | Prompt prefix character |
| `prefixColor` | `string` | `'cyan'` | Color of the prefix |
| `disabled` | `boolean` | `false` | Disables input when true |
| `commands` | `{ name: string; description: string }[]` | `[]` | Commands for `/` autocomplete suggestions |
| `onCommandSelect` | `(name: string) => void` | `undefined` | Called when a command suggestion is selected |
| `history` | `string[]` | `[]` | Input history (most recent first) navigable with arrow keys |

### Example

```tsx
<PromptInput
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  prefix="$"
  prefixColor="green"
  placeholder="Type a message..."
  commands={[{ name: 'help', description: 'Show help' }]}
  history={['previous query', 'older query']}
/>
```

### Keyboard

| Key | Action |
|-----|--------|
| `Enter` | Submit input or accept suggestion |
| `Tab` | Complete current command suggestion |
| `Escape` | Dismiss suggestions |
| `Up` / `Down` | Navigate suggestions or history |
| `Left` / `Right` | Move cursor |
| `Home` / `Ctrl+A` | Move to start |
| `End` / `Ctrl+E` | Move to end |
| `Ctrl+W` | Delete word backward |
| `Ctrl+U` | Clear line before cursor |
| `Backspace` | Delete character before cursor |
| `Delete` | Delete character at cursor |

---

## MessageList

Renders a list of chat messages with role-based styling. Supports custom renderers and streaming content.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | `Message[]` | *required* | Array of messages to render |
| `streamingContent` | `string \| null` | `undefined` | Streaming text appended as an assistant message with a block cursor |
| `renderMessage` | `(message: Message) => React.ReactNode` | `undefined` | Custom message renderer |
| `viewportHeight` | `number` | `undefined` | Enables a bounded measured viewport; omission renders the full list |
| `ref` | `React.Ref<VirtualListHandle>` | `undefined` | Scroll to a message index, the tail, or by rows when using a viewport |

### Message

Display-oriented message type for the UI layer. Distinct from the protocol-level `Message` in `@claude-code-kit/agent` -- the `useAgent` hook converts between them automatically.

```ts
type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | MessageContent[]
  timestamp?: number
}
```

Default role styling:
- **user**: Cyan `>` prefix, label "You"
- **assistant**: Orange dot prefix, label "Claude"
- **system**: Dimmed asterisk prefix, label "System"

### Example

```tsx
<MessageList
  messages={[
    { id: '1', role: 'user', content: 'Hello!' },
    { id: '2', role: 'assistant', content: 'Hi there.' },
  ]}
  streamingContent="I'm still typing..."
/>
```

---

## VirtualList and useVirtualScroll

`VirtualList` renders a window of items inside `ScrollBox`, measures mounted row heights, and invalidates measurements when terminal width changes. Stable item identity avoids reusing a measurement for a different item.

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `T[]` | Required | Items in display order |
| `renderItem` | `(item: T, index: number) => ReactNode` | Required | Render one item |
| `viewportHeight` | `number` | Required | Visible terminal rows |
| `estimatedItemHeight` | `number` | `3` | Initial height estimate before measurement |
| `overscan` | `number` | `20` | Extra mounted items around the visible range |
| `itemKey` | `(item: T, index: number) => string \| number` | Index | Stable key for rendering and height measurement |
| `followOutput` | `boolean` | `false` | Begin at the tail and follow appended content until scrolling away |
| `ref` | `React.Ref<VirtualListHandle>` | Undefined | Imperative scrolling handle |

```tsx
import React, { useRef } from 'react'
import { Text, VirtualList, type VirtualListHandle } from '@claude-code-kit/ui'

function History({ lines }: { lines: { id: string; text: string }[] }) {
  const ref = useRef<VirtualListHandle>(null)
  return <VirtualList
    ref={ref}
    items={lines}
    itemKey={line => line.id}
    viewportHeight={12}
    followOutput
    renderItem={line => <Text>{line.text}</Text>}
  />
}
```

`VirtualListHandle.scrollTo(index)` moves to an item, `scrollToEnd()` returns to the tail, and `scrollBy(rows)` moves by terminal rows. `useVirtualScroll` exposes range/token-independent height bookkeeping (`startIndex`, `endIndex`, `totalHeight`, `scrollOffset`, `offsets`) and `scrollTo`, `scrollToEnd`, and `onScroll`. It accepts optional `itemHeights` for callers managing measurements themselves; its `onScroll(delta)` moves by estimated-item units, while the list handle moves by rows.

Renderer-backed mounted tests exercise the viewport and input wiring. These are separate from acceptance in a real user's terminal, OS, or terminal emulator.

---

## StreamingText

Reveals text character-by-character with configurable speed.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | *required* | The full text to reveal |
| `speed` | `number` | `3` | Characters revealed per tick |
| `interval` | `number` | `20` | Milliseconds between ticks |
| `onComplete` | `() => void` | `undefined` | Called when all text is revealed |
| `color` | `string` | `undefined` | Text color |

### Example

```tsx
<StreamingText
  text="Hello, world!"
  speed={5}
  interval={30}
  onComplete={() => console.log('done')}
  color="green"
/>
```

---

## Spinner

Animated spinner with rotating verbs and elapsed time display.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | `undefined` | Static label shown after the verb |
| `verb` | `string` | `undefined` | Single verb to display (e.g. "Loading") |
| `verbs` | `string[]` | `['Thinking']` | Array of verbs that rotate every 4 seconds |
| `color` | `string` | `'#DA7756'` | Spinner frame color |
| `showElapsed` | `boolean` | `true` | Show elapsed time after 1 second |

### Example

```tsx
<Spinner />
<Spinner verb="Analyzing" label="your code" />
<Spinner verbs={['Thinking', 'Reasoning', 'Planning']} color="cyan" />
```

---

## ProgressBar

Unicode block-character progress bar with sub-character precision.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ratio` | `number` | *required* | Progress between 0 and 1 |
| `width` | `number` | *required* | Width in characters |
| `fillColor` | `Color` | `undefined` | Color of the filled portion |
| `emptyColor` | `Color` | `undefined` | Background color of the empty portion |

### Example

```tsx
<ProgressBar ratio={0.65} width={30} fillColor="green" />
```

---

## StatusIcon

Semantic status icon with appropriate color.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `'success' \| 'error' \| 'warning' \| 'info' \| 'pending' \| 'loading'` | *required* | Determines icon and color |
| `withSpace` | `boolean` | `false` | Append a trailing space after the icon |

Status icons:
- `success`: Green checkmark
- `error`: Red cross
- `warning`: Yellow warning
- `info`: Blue info
- `pending`: Dimmed circle
- `loading`: Dimmed ellipsis

### Example

```tsx
<StatusIcon status="success" withSpace />
<StatusIcon status="error" />
<StatusIcon status="loading" />
```

---

## StatusLine

Bottom-bar status line with segments, ANSI support, and optional borders.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `segments` | `StatusLineSegment[]` | `undefined` | Segments to display |
| `text` | `string` | `undefined` | Raw text alternative to segments (supports ANSI) |
| `paddingX` | `number` | `1` | Horizontal padding |
| `gap` | `number` | `1` | Gap between segments |
| `borderStyle` | `'none' \| 'single' \| 'round'` | `'none'` | Border style |
| `borderColor` | `Color` | `undefined` | Border color |

### StatusLineSegment

```ts
type StatusLineSegment = {
  content: string   // Can include ANSI escape codes
  color?: Color
  flex?: boolean    // If true, grows to fill available space
}
```

### useStatusLine Hook

```ts
function useStatusLine(
  updater: () => StatusLineSegment[] | string,
  deps: unknown[],
  intervalMs?: number,
): StatusLineSegment[] | string
```

Reactive hook that re-evaluates status content when deps change or on interval.

### Example

```tsx
<StatusLine
  segments={[
    { content: 'opus-4.6', color: 'green' },
    { content: '$0.42', color: 'yellow' },
    { content: '', flex: true },
    { content: 'Ctrl+C to exit', color: 'gray' },
  ]}
/>

<StatusLine text="Ready" borderStyle="round" borderColor="gray" />
```

---

## Divider

Horizontal line divider with optional title. Auto-sizes to terminal width.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | terminal width - 2 | Width in characters |
| `color` | `Color` | `undefined` | Line color. Uses dim styling if not set |
| `char` | `string` | `'─'` | Character used for the line |
| `padding` | `number` | `0` | Characters subtracted from width |
| `title` | `string` | `undefined` | Title shown centered in the divider (supports ANSI) |

### Example

```tsx
<Divider />
<Divider color="green" />
<Divider title="Section" />
<Divider char="=" padding={4} />
```

---

## Markdown

Renders markdown content with syntax highlighting, table support, and token caching.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `string` | *required* | Markdown content to render |
| `dimColor` | `boolean` | `undefined` | Render all text as dim |

### Example

```tsx
<Markdown>{'# Hello\n\nThis is **bold** and `code`.'}</Markdown>
<Markdown dimColor>{'System message content'}</Markdown>
```

---

## StreamingMarkdown

Optimized markdown renderer for streaming content. Only re-parses the unstable tail block as new content arrives -- stable prefix blocks are memoized.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `string` | *required* | Streaming markdown content |

### Example

```tsx
<StreamingMarkdown>{partialContent}</StreamingMarkdown>
```

---

## MarkdownTable

Renders markdown tables with column wrapping, alignment, and automatic vertical-format fallback for narrow terminals. Used internally by `Markdown`.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `Tokens.Table` | *required* | Parsed marked table token |
| `highlight` | `CliHighlight \| null` | *required* | Syntax highlighter instance |
| `forceWidth` | `number` | `undefined` | Override terminal width (useful for testing) |

### Example

```tsx
// Typically used internally by <Markdown>, not directly
import { marked } from 'marked'
const tokens = marked.lexer('| a | b |\n|---|---|\n| 1 | 2 |')
const tableToken = tokens.find(t => t.type === 'table')
<MarkdownTable token={tableToken} highlight={null} />
```

---

## Commands Framework

A registry-based system for defining and managing slash commands.

### Command Types

```ts
type CommandBase = {
  name: string
  description: string
  aliases?: string[]
  isHidden?: boolean
  isEnabled?: () => boolean
  argumentHint?: string
}

type LocalCommand = CommandBase & {
  type: 'local'
  execute: (args: string) => Promise<CommandResult> | CommandResult
}

type JSXCommand = CommandBase & {
  type: 'jsx'
  render: (onDone: CommandOnDone, args: string) => React.ReactNode
}

type Command = LocalCommand | JSXCommand
```

**CommandResult** can be:
- `{ type: 'text', value: string }` -- display text output
- `{ type: 'skip' }` -- no output (e.g. side-effect only)

### CommandRegistry

```ts
class CommandRegistry {
  register(...commands: Command[]): void
  get(name: string): Command | undefined
  getAll(): Command[]
  getVisible(): Command[]
  parse(input: string): { command: Command; args: string } | null
  getSuggestions(partial: string): Command[]
}

function createCommandRegistry(commands: Command[]): CommandRegistry
```

| Method | Description |
|--------|-------------|
| `register` | Add commands (aliases are registered automatically) |
| `get` | Look up a command by name or alias |
| `getAll` | All registered commands (deduplicated) |
| `getVisible` | Non-hidden, enabled commands |
| `parse` | Parse a `/command args` string into command + args |
| `getSuggestions` | Autocomplete matches for a partial `/` input |

### Built-in Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/exit` | `/quit`, `/q` | Exit the application |
| `/help` | `/?` | Show available commands |
| `/clear` | -- | Clear the screen |

### Example

```tsx
import { createCommandRegistry, exitCommand, helpCommand, clearCommand } from '@claude-code-kit/ui'

const registry = createCommandRegistry([
  exitCommand,
  clearCommand,
])
// helpCommand needs registry reference for listing
registry.register(helpCommand(registry))

// Custom command
registry.register({
  name: 'model',
  description: 'Switch model',
  aliases: ['m'],
  argumentHint: '<model-name>',
  type: 'local',
  execute: (args) => {
    setModel(args)
    return { type: 'text', value: `Switched to ${args}` }
  },
})

// Parse user input
const result = registry.parse('/model opus')
// => { command: { name: 'model', ... }, args: 'opus' }

// Autocomplete
registry.getSuggestions('/mo')
// => [{ name: 'model', ... }]
```
