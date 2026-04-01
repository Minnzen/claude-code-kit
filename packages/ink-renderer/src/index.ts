// Render API (async — preserves microtask boundary from original)
export { default as render, renderSync, createRoot } from './root'
export type { RenderOptions, Instance, Root } from './root'

// Core components
export { default as Box } from './components/Box'
export { default as Text } from './components/Text'
export type { Props as TextProps } from './components/Text'
export { default as Spacer } from './components/Spacer'
export { default as Newline } from './components/Newline'
export { default as Link } from './components/Link'
export { default as Button } from './components/Button'
export { default as ScrollBox } from './components/ScrollBox'
export type { ScrollBoxHandle } from './components/ScrollBox'
export { AlternateScreen } from './components/AlternateScreen'
export { RawAnsi } from './components/RawAnsi'
export { NoSelect } from './components/NoSelect'
export { default as ErrorOverview } from './components/ErrorOverview'
export { Ansi } from './Ansi'

// Theme hook stub (returns [themeName, setThemeName])
export function useTheme(): [string, (name: string) => void] { return ['default', () => {}] }

// Hooks
export { default as useInput } from './hooks/use-input'
export { default as useApp } from './hooks/use-app'
export { default as useStdin } from './hooks/use-stdin'
export { useTerminalFocus } from './hooks/use-terminal-focus'
export { useTerminalViewport } from './hooks/use-terminal-viewport'
export { useInterval, useAnimationTimer } from './hooks/use-interval'
export { useAnimationFrame } from './hooks/use-animation-frame'
export { useTerminalTitle } from './hooks/use-terminal-title'
export { useTabStatus } from './hooks/use-tab-status'
export type { TabStatusKind } from './hooks/use-tab-status'
export { useDeclaredCursor } from './hooks/use-declared-cursor'
export { useSearchHighlight } from './hooks/use-search-highlight'
export { useSelection, useHasSelection } from './hooks/use-selection'

// Contexts
export { default as AppContext } from './components/AppContext'
export { default as StdinContext } from './components/StdinContext'
export { TerminalSizeContext } from './components/TerminalSizeContext'

// DOM & layout
export type { DOMElement, DOMNode } from './dom'
export { default as measureElement } from './measure-element'
export { stringWidth } from './stringWidth'
export { wrapAnsi } from './wrapAnsi'

// Color utilities
export { colorize, applyTextStyles, applyColor } from './colorize'
export type { ColorType } from './colorize'

// Events
export type { InputEvent } from './events/input-event'
export type { ClickEvent } from './events/click-event'
export type { FocusEvent } from './events/focus-event'
export type { KeyboardEvent } from './events/keyboard-event'

// Layout utilities
export { clamp } from './layout/geometry'

// Types
export type { Styles, Color, TextStyles } from './styles'
export type { BorderTextOptions } from './render-border'
export type { MatchPosition } from './render-to-screen'
export type { Key } from './events/input-event'
export type { ParsedKey } from './parse-keypress'
export type { Frame, FrameEvent } from './frame'
