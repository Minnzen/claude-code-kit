import { Box, clamp, TerminalSizeContext, Text, useInput } from "@claude-code-kit/ink-renderer";
import type * as React from "react";
import { useCallback, useContext, useEffect, useState } from "react";
import { Byline } from "./Byline";
import { KeyboardShortcutHint } from "./KeyboardShortcutHint";
import { ListItem } from "./ListItem";
import { Pane } from "./Pane";

type PickerAction<T> = {
  action: string;
  handler: (item: T) => void;
};

type Props<T> = {
  title: string;
  placeholder?: string;
  initialQuery?: string;
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, isFocused: boolean) => React.ReactNode;
  renderPreview?: (item: T) => React.ReactNode;
  previewPosition?: "bottom" | "right";
  visibleCount?: number;
  direction?: "down" | "up";
  onQueryChange: (query: string) => void;
  onSelect: (item: T) => void;
  onTab?: PickerAction<T>;
  onShiftTab?: PickerAction<T>;
  onFocus?: (item: T | undefined) => void;
  onCancel: () => void;
  emptyMessage?: string | ((query: string) => string);
  matchLabel?: string;
  selectAction?: string;
  extraHints?: React.ReactNode;
};

const DEFAULT_VISIBLE = 8;
const CHROME_ROWS = 10;
const MIN_VISIBLE = 2;

export function FuzzyPicker<T>({
  title,
  placeholder = "Type to search...",
  initialQuery,
  items,
  getKey,
  renderItem,
  renderPreview,
  previewPosition = "bottom",
  visibleCount: requestedVisible = DEFAULT_VISIBLE,
  direction = "down",
  onQueryChange,
  onSelect,
  onTab,
  onShiftTab,
  onFocus,
  onCancel,
  emptyMessage = "No results",
  matchLabel,
  selectAction = "select",
  extraHints,
}: Props<T>): React.ReactNode {
  const terminalSize = useContext(TerminalSizeContext);
  const rows = terminalSize?.rows ?? 24;
  const columns = terminalSize?.columns ?? 80;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [query, setQuery] = useState(initialQuery ?? "");

  const visibleCount = Math.max(
    MIN_VISIBLE,
    Math.min(requestedVisible, rows - CHROME_ROWS - (matchLabel ? 1 : 0)),
  );

  const compact = columns < 120;

  const step = useCallback(
    (delta: 1 | -1) => {
      setFocusedIndex((i) => clamp(i + delta, 0, items.length - 1));
    },
    [items.length],
  );

  useInput(
    useCallback(
      (
        input: string,
        key: {
          upArrow?: boolean;
          downArrow?: boolean;
          return?: boolean;
          tab?: boolean;
          escape?: boolean;
          shift?: boolean;
          ctrl?: boolean;
          backspace?: boolean;
        },
      ) => {
        if (key.escape) {
          onCancel();
          return;
        }
        if (key.upArrow || (key.ctrl && input === "p")) {
          step(direction === "up" ? 1 : -1);
          return;
        }
        if (key.downArrow || (key.ctrl && input === "n")) {
          step(direction === "up" ? -1 : 1);
          return;
        }
        if (key.return) {
          const selected = items[focusedIndex];
          if (selected) onSelect(selected);
          return;
        }
        if (key.tab) {
          const selected = items[focusedIndex];
          if (!selected) return;
          const tabAction = key.shift ? (onShiftTab ?? onTab) : onTab;
          if (tabAction) {
            tabAction.handler(selected);
          } else {
            onSelect(selected);
          }
          return;
        }
        if (key.backspace) {
          setQuery((q) => q.slice(0, -1));
          return;
        }
        // Printable character
        if (input && !key.ctrl) {
          setQuery((q) => q + input);
        }
      },
      [onCancel, step, direction, items, focusedIndex, onSelect, onShiftTab, onTab],
    ),
  );

  useEffect(() => {
    onQueryChange(query);
    setFocusedIndex(0);
  }, [query, onQueryChange]);

  useEffect(() => {
    setFocusedIndex((i) => clamp(i, 0, items.length - 1));
  }, [items.length]);

  const focused = items[focusedIndex];
  useEffect(() => {
    onFocus?.(focused);
  }, [focused, onFocus]);

  const windowStart = clamp(focusedIndex - visibleCount + 1, 0, items.length - visibleCount);
  const visible = items.slice(windowStart, windowStart + visibleCount);
  const emptyText = typeof emptyMessage === "function" ? emptyMessage(query) : emptyMessage;

  const searchInput = (
    <Box borderStyle="round" paddingX={1}>
      <Text dimColor={!query}>{query || placeholder}</Text>
    </Box>
  );

  const listBlock = (
    <List
      visible={visible}
      windowStart={windowStart}
      visibleCount={visibleCount}
      total={items.length}
      focusedIndex={focusedIndex}
      direction={direction}
      getKey={getKey}
      renderItem={renderItem}
      emptyText={emptyText}
    />
  );

  const preview =
    renderPreview && focused ? (
      <Box flexDirection="column" flexGrow={1}>
        {renderPreview(focused)}
      </Box>
    ) : null;

  const listGroup =
    renderPreview && previewPosition === "right" ? (
      <Box flexDirection="row" gap={2} height={visibleCount + (matchLabel ? 1 : 0)}>
        <Box flexDirection="column" flexShrink={0}>
          {listBlock}
          {matchLabel && <Text dimColor>{matchLabel}</Text>}
        </Box>
        {preview ?? <Box flexGrow={1} />}
      </Box>
    ) : (
      <Box flexDirection="column">
        {listBlock}
        {matchLabel && <Text dimColor>{matchLabel}</Text>}
        {preview}
      </Box>
    );

  const inputAbove = direction !== "up";

  return (
    <Pane color="permission">
      <Box flexDirection="column" gap={1}>
        <Text bold color="permission">
          {title}
        </Text>
        {inputAbove && searchInput}
        {listGroup}
        {!inputAbove && searchInput}
        <Text dimColor>
          <Byline>
            <KeyboardShortcutHint shortcut="up/dn" action={compact ? "nav" : "navigate"} />
            <KeyboardShortcutHint shortcut="Enter" action={selectAction} />
            {onTab && <KeyboardShortcutHint shortcut="Tab" action={onTab.action} />}
            {onShiftTab && !compact && (
              <KeyboardShortcutHint shortcut="shift+tab" action={onShiftTab.action} />
            )}
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
            {extraHints}
          </Byline>
        </Text>
      </Box>
    </Pane>
  );
}

type ListProps<T> = Pick<Props<T>, "direction" | "getKey" | "renderItem"> & {
  visible: readonly T[];
  windowStart: number;
  visibleCount: number;
  total: number;
  focusedIndex: number;
  emptyText: string;
};

function List<T>({
  visible,
  windowStart,
  visibleCount,
  total,
  focusedIndex,
  direction,
  getKey,
  renderItem,
  emptyText,
}: ListProps<T>): React.ReactNode {
  if (visible.length === 0) {
    return (
      <Box height={visibleCount} flexShrink={0}>
        <Text dimColor>{emptyText}</Text>
      </Box>
    );
  }

  const rows = visible.map((item, i) => {
    const actualIndex = windowStart + i;
    const isFocused = actualIndex === focusedIndex;
    const atLowEdge = i === 0 && windowStart > 0;
    const atHighEdge = i === visible.length - 1 && windowStart + visibleCount < total;

    return (
      <ListItem
        key={getKey(item)}
        isFocused={isFocused}
        showScrollUp={direction === "up" ? atHighEdge : atLowEdge}
        showScrollDown={direction === "up" ? atLowEdge : atHighEdge}
        styled={false}
      >
        {renderItem(item, isFocused)}
      </ListItem>
    );
  });

  return (
    <Box
      height={visibleCount}
      flexShrink={0}
      flexDirection={direction === "up" ? "column-reverse" : "column"}
    >
      {rows}
    </Box>
  );
}
