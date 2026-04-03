# claude-code-kit Component Documentation

Production-grade terminal UI components. Every component works independently with zero configuration.

## Installation

```bash
pnpm add @claude-code-kit/ink-renderer @claude-code-kit/ui react
```

## Quick Start

```tsx
import { render } from '@claude-code-kit/ink-renderer'
import { REPL, type Message } from '@claude-code-kit/ui'

const messages: Message[] = []

function App() {
  const [msgs, setMsgs] = useState<Message[]>([])

  const handleSubmit = async (text: string) => {
    setMsgs(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }])
    // call your LLM here...
  }

  return <REPL messages={msgs} onSubmit={handleSubmit} model="opus-4.6" />
}

render(<App />)
```

---

## REPL

The main component. Composes MessageList, PromptInput, Spinner, Divider, and StatusLine into a complete chat interface with slash-command support.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSubmit` | `(message: string) => Promise<void> \| void` | *required* | Called when the user submits a message |
| `onExit` | `() => void` | `undefined` | Called on Ctrl+D. Falls back to `exit()` if not provided |
| `messages` | `Message[]` | *required* | Array of messages to display |
| `isLoading` | `boolean` | `false` | Shows spinner and disables input when true |
| `streamingContent` | `string \| null` | `undefined` | Streaming assistant text shown with a block cursor |
| `commands` | `REPLCommand[]` | `[]` | Slash commands (`{ name, description, onExecute }`) |
| `model` | `string` | `undefined` | Model name shown in the status line |
| `statusSegments` | `StatusLineSegment[]` | `undefined` | Custom status line segments. Overrides the default model display |
| `prefix` | `string` | `'>'` | Prompt prefix character |
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
| `Ctrl+C` | Cancel (during loading) |

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
