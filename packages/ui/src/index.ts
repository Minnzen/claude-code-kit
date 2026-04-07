export * from "@claude-code-kit/ink-renderer";
// Auth flow UI (requires @claude-code-kit/agent as optional peer dependency)
export { AuthFlowUI, type AuthFlowUIProps } from "./AuthFlow";
export {
  AgentContext,
  type AgentContextValue,
  AgentProvider,
  type AgentProviderProps,
  useAgentContext,
} from "./agent/AgentProvider";
export { AgentREPL, type AgentREPLProps } from "./agent/AgentREPL";
// Agent bridge (requires @claude-code-kit/agent as optional peer dependency)
export {
  type PermissionUIRequest,
  type UseAgentOptions,
  type UseAgentResult,
  useAgent,
} from "./agent/useAgent";
export {
  type Command,
  type CommandBase,
  type CommandOnDone,
  CommandRegistry,
  type CommandResult,
  clearCommand,
  createCommandRegistry,
  defineCommand,
  defineJSXCommand,
  defineLocalCommand,
  exitCommand,
  helpCommand,
  type JSXCommand,
  type LocalCommand,
} from "./commands";
export { type DiffLine, DiffView, type DiffViewProps, parseUnifiedDiff } from "./DiffView";
export { Divider } from "./Divider";
export { Byline } from "./design-system/Byline";
export { color } from "./design-system/color";
export { Dialog } from "./design-system/Dialog";
export { FuzzyPicker } from "./design-system/FuzzyPicker";
export { KeyboardShortcutHint } from "./design-system/KeyboardShortcutHint";
export { ListItem } from "./design-system/ListItem";
export { LoadingState } from "./design-system/LoadingState";
export { Pane } from "./design-system/Pane";
export { Ratchet } from "./design-system/Ratchet";
export { Tab, Tabs, useTabsWidth } from "./design-system/Tabs";
export { default as ThemedBox, type Props as ThemedBoxProps } from "./design-system/ThemedBox";
export {
  default as ThemedText,
  type Props as ThemedTextProps,
  TextHoverColorContext,
} from "./design-system/ThemedText";
export {
  getTheme,
  type Theme,
  type ThemeName,
  ThemeProvider,
  type ThemeSetting,
  usePreviewTheme,
  useTheme,
  useThemeSetting,
} from "./design-system/ThemeProvider";
export { useDoublePress } from "./hooks/useDoublePress";
export { type TerminalSize, useTerminalSize } from "./hooks/useTerminalSize";
export { DEFAULT_BINDINGS } from "./keybindings/defaultBindings";
export { KeybindingSetup } from "./keybindings/KeybindingProviderSetup";
export { useKeybinding, useKeybindings } from "./keybindings/useKeybinding";
export { Markdown, StreamingMarkdown } from "./Markdown";
export { MarkdownTable } from "./MarkdownTable";
export {
  type Message,
  type MessageContent,
  MessageList,
  type MessageListProps,
} from "./MessageList";
export {
  BashPermissionContent,
  FileEditPermissionContent,
  type PermissionAction,
  PermissionRequest,
  type PermissionRequestProps,
} from "./PermissionRequest";
export { ProgressBar } from "./ProgressBar";
export { PromptInput } from "./PromptInput";
export { REPL, type REPLProps } from "./REPL";
export {
  type SearchMatch,
  SearchOverlay,
  type SearchOverlayProps,
  type UseSearchResult,
  useSearch,
} from "./SearchOverlay";
export {
  MultiSelect,
  type MultiSelectProps,
  Select,
  type SelectOption,
  type SelectProps,
} from "./Select";
export { Spinner } from "./Spinner";
export { StatusIcon } from "./StatusIcon";
export {
  StatusLine,
  type StatusLineProps,
  type StatusLineSegment,
  useStatusLine,
} from "./StatusLine";
export { StreamingText, type StreamingTextProps } from "./StreamingText";
export {
  useVirtualScroll,
  VirtualList,
  type VirtualListProps,
  type VirtualScrollOptions,
  type VirtualScrollResult,
} from "./useVirtualScroll";
export { ClawdLogo, WelcomeScreen, type WelcomeScreenProps } from "./WelcomeScreen";
