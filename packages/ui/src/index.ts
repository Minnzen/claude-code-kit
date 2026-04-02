export * from '@claude-code-kit/ink-renderer'

export { DiffView, parseUnifiedDiff, type DiffLine, type DiffViewProps } from './DiffView'
export { Divider } from './Divider'
export { ProgressBar } from './ProgressBar'
export { StatusIcon } from './StatusIcon'
export { StatusLine, useStatusLine, type StatusLineSegment, type StatusLineProps } from './StatusLine'

export {
  type Command, type CommandBase, type LocalCommand, type JSXCommand,
  type CommandResult, type CommandOnDone,
  CommandRegistry, createCommandRegistry,
  defineCommand, defineLocalCommand, defineJSXCommand,
  exitCommand, helpCommand, clearCommand,
} from './commands'

export { useKeybinding, useKeybindings } from './keybindings/useKeybinding'
export { KeybindingSetup } from './keybindings/KeybindingProviderSetup'
export { DEFAULT_BINDINGS } from './keybindings/defaultBindings'

export { useDoublePress } from './hooks/useDoublePress'
export { useTerminalSize, type TerminalSize } from './hooks/useTerminalSize'

export { PromptInput } from './PromptInput'
export { Spinner } from './Spinner'
export { Markdown, StreamingMarkdown } from './Markdown'
export { MarkdownTable } from './MarkdownTable'

export { Select, MultiSelect, type SelectOption, type SelectProps, type MultiSelectProps } from './Select'

export { PermissionRequest, BashPermissionContent, FileEditPermissionContent, type PermissionAction, type PermissionRequestProps } from './PermissionRequest'

export { MessageList, type Message, type MessageContent, type MessageListProps } from './MessageList'
export { StreamingText, type StreamingTextProps } from './StreamingText'
export { REPL, type REPLProps } from './REPL'

export {
  ThemeProvider,
  getTheme,
  useTheme,
  useThemeSetting,
  usePreviewTheme,
  type Theme,
  type ThemeName,
  type ThemeSetting,
} from './design-system/ThemeProvider'
export { default as ThemedBox, type Props as ThemedBoxProps } from './design-system/ThemedBox'
export { default as ThemedText, TextHoverColorContext, type Props as ThemedTextProps } from './design-system/ThemedText'
export { Dialog } from './design-system/Dialog'
export { FuzzyPicker } from './design-system/FuzzyPicker'
export { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint'
export { ListItem } from './design-system/ListItem'
export { LoadingState } from './design-system/LoadingState'
export { Pane } from './design-system/Pane'
export { Ratchet } from './design-system/Ratchet'
export { Tabs, Tab, useTabsWidth } from './design-system/Tabs'
export { Byline } from './design-system/Byline'
export { color } from './design-system/color'

export { useVirtualScroll, VirtualList, type VirtualScrollOptions, type VirtualScrollResult, type VirtualListProps } from './useVirtualScroll'

export { SearchOverlay, useSearch, type SearchMatch, type SearchOverlayProps, type UseSearchResult } from './SearchOverlay'

export { WelcomeScreen, ClawdLogo, type WelcomeScreenProps } from './WelcomeScreen'

// Agent bridge (requires @claude-code-kit/agent as optional peer dependency)
export { useAgent, type UseAgentOptions, type UseAgentResult, type PermissionUIRequest } from './agent/useAgent'
export { AgentProvider, AgentContext, useAgentContext, type AgentContextValue, type AgentProviderProps } from './agent/AgentProvider'
export { AgentREPL, type AgentREPLProps } from './agent/AgentREPL'

// Auth flow UI (requires @claude-code-kit/agent as optional peer dependency)
export { AuthFlowUI, type AuthFlowUIProps } from './AuthFlow'
