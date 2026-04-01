// Re-export everything from ink-renderer for convenience
export * from '@claude-code-kit/ink-renderer'

// Core UI components
export { Divider } from './Divider'
export { ProgressBar } from './ProgressBar'
export { StatusIcon } from './StatusIcon'
export { StatusLine, useStatusLine, type StatusLineSegment, type StatusLineProps } from './StatusLine'

// Commands framework
export {
  type Command, type CommandBase, type LocalCommand, type JSXCommand,
  type CommandResult, type CommandOnDone,
  CommandRegistry, createCommandRegistry,
  defineCommand, defineLocalCommand, defineJSXCommand,
  exitCommand, helpCommand, clearCommand,
} from './commands'

// Keybindings (optional enhancement layer)
export { useKeybinding, useKeybindings } from './keybindings/useKeybinding'
export { KeybindingSetup } from './keybindings/KeybindingProviderSetup'
export { DEFAULT_BINDINGS } from './keybindings/defaultBindings'

// Completed rewrites
export { PromptInput } from './PromptInput'
export { Spinner } from './Spinner'

// Select components
export { Select, MultiSelect, type SelectOption, type SelectProps, type MultiSelectProps } from './Select'

// Message & REPL components
export { MessageList, type Message, type MessageListProps } from './MessageList'
export { StreamingText, type StreamingTextProps } from './StreamingText'
export { REPL, type REPLProps } from './REPL'
