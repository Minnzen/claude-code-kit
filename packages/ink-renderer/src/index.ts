// Render API (async — preserves microtask boundary from original)

export { Ansi } from "./Ansi";
export { AlternateScreen } from "./components/AlternateScreen";

// Core components
export { default as Box } from "./components/Box";
export { default as Button } from "./components/Button";
export { default as ErrorOverview } from "./components/ErrorOverview";
export { default as Link } from "./components/Link";
export { default as Newline } from "./components/Newline";
export { NoSelect } from "./components/NoSelect";
export { RawAnsi } from "./components/RawAnsi";
export type { ScrollBoxHandle } from "./components/ScrollBox";
export { default as ScrollBox } from "./components/ScrollBox";
export { default as Spacer } from "./components/Spacer";
export type { Props as TextProps } from "./components/Text";
export { default as Text } from "./components/Text";
export type { Instance, RenderOptions, Root } from "./root";
export { createRoot, default as render, renderSync } from "./root";

// Theme hook stub (returns [themeName, setThemeName])
export function useTheme(): [string, (name: string) => void] {
  return ["default", () => {}];
}

export type { ColorType } from "./colorize";
// Color utilities
export { applyColor, applyTextStyles, colorize } from "./colorize";
// Contexts
export { default as AppContext } from "./components/AppContext";
export { default as StdinContext } from "./components/StdinContext";
export { TerminalSizeContext } from "./components/TerminalSizeContext";
// DOM & layout
export type { DOMElement, DOMNode } from "./dom";
export type { ClickEvent } from "./events/click-event";
export type { FocusEvent } from "./events/focus-event";
// Events
export type { InputEvent, Key } from "./events/input-event";
export type { KeyboardEvent } from "./events/keyboard-event";
export type { Frame, FrameEvent } from "./frame";
export { useAnimationFrame } from "./hooks/use-animation-frame";
export { default as useApp } from "./hooks/use-app";
export { useDeclaredCursor } from "./hooks/use-declared-cursor";
// Hooks
export { default as useInput } from "./hooks/use-input";
export { useAnimationTimer, useInterval } from "./hooks/use-interval";
export { useSearchHighlight } from "./hooks/use-search-highlight";
export { useHasSelection, useSelection } from "./hooks/use-selection";
export { default as useStdin } from "./hooks/use-stdin";
export type { TabStatusKind } from "./hooks/use-tab-status";
export { useTabStatus } from "./hooks/use-tab-status";
export { useTerminalFocus } from "./hooks/use-terminal-focus";
export { useTerminalTitle } from "./hooks/use-terminal-title";
export { useTerminalViewport } from "./hooks/use-terminal-viewport";
// Layout utilities
export { clamp } from "./layout/geometry";
export { default as measureElement } from "./measure-element";
export type { ParsedKey } from "./parse-keypress";
export type { BorderTextOptions } from "./render-border";
export type { MatchPosition } from "./render-to-screen";
export { stringWidth } from "./stringWidth";
// Types
export type { Color, Styles, TextStyles } from "./styles";
export { wrapAnsi } from "./wrapAnsi";
