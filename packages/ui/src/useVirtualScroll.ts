import {
  Box,
  type DOMElement,
  measureElement,
  ScrollBox,
  type ScrollBoxHandle,
  TerminalSizeContext,
} from "@claude-code-kit/ink-renderer";
import React, {
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type VirtualScrollOptions = {
  itemCount: number;
  estimatedItemHeight?: number;
  itemHeights?: readonly number[];
  overscan?: number;
  viewportHeight: number;
  followOutput?: boolean;
};
export type VirtualScrollResult = {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  totalHeight: number;
  scrollOffset: number;
  offsets: readonly number[];
  scrollTo: (index: number) => void;
  scrollToEnd: () => void;
  onScroll: (delta: number) => void;
  isAtTop: boolean;
  isAtEnd: boolean;
};
export type VirtualListHandle = {
  scrollTo: (index: number) => void;
  scrollToEnd: () => void;
  scrollBy: (rows: number) => void;
};
export type VirtualListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  viewportHeight: number;
  estimatedItemHeight?: number;
  overscan?: number;
  followOutput?: boolean;
  itemKey?: (item: T, index: number) => string | number;
  ref?: Ref<VirtualListHandle>;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function useVirtualScroll({
  itemCount,
  estimatedItemHeight = 3,
  itemHeights,
  overscan = 20,
  viewportHeight,
  followOutput = false,
}: VirtualScrollOptions): VirtualScrollResult {
  const height = Math.max(1, estimatedItemHeight);
  const viewport = Math.max(1, viewportHeight);
  const offsets = useMemo(() => {
    const result = [0];
    for (let i = 0; i < itemCount; i++)
      result.push(result[i]! + Math.max(1, itemHeights?.[i] ?? height));
    return result;
  }, [itemCount, itemHeights, height]);
  const totalHeight = offsets[itemCount] ?? 0;
  const maxOffset = Math.max(0, totalHeight - viewport);
  const [position, setPosition] = useState<{
    offset: number;
    index: number | null;
    follow: boolean;
  }>({ offset: 0, index: null, follow: followOutput });
  const scrollOffset = position.follow
    ? maxOffset
    : clamp(
        position.index === null
          ? position.offset
          : (offsets[clamp(position.index, 0, Math.max(0, itemCount - 1))] ?? 0),
        0,
        maxOffset,
      );
  let first = 0;
  let last = itemCount;
  while (first < last) {
    const mid = Math.floor((first + last) / 2);
    if (offsets[mid + 1]! <= scrollOffset) first = mid + 1;
    else last = mid;
  }
  let end = first;
  while (end < itemCount && offsets[end]! < scrollOffset + viewport) end++;
  const padding = Math.max(0, overscan);
  const startIndex = Math.max(0, first - padding);
  const endIndex = Math.min(itemCount, end + padding);
  const scrollTo = useCallback(
    (index: number) =>
      setPosition({ offset: 0, index: clamp(index, 0, Math.max(0, itemCount - 1)), follow: false }),
    [itemCount],
  );
  const scrollToEnd = useCallback(
    () => setPosition({ offset: maxOffset, index: null, follow: true }),
    [maxOffset],
  );
  const onScroll = useCallback(
    (delta: number) =>
      setPosition((previous) => {
        const current = previous.follow
          ? maxOffset
          : previous.index === null
            ? previous.offset
            : (offsets[previous.index] ?? 0);
        const offset = clamp(current + delta * height, 0, maxOffset);
        return { offset, index: null, follow: delta > 0 && offset >= maxOffset };
      }),
    [height, maxOffset, offsets],
  );
  return {
    startIndex,
    endIndex,
    visibleItems: endIndex - startIndex,
    totalHeight,
    scrollOffset,
    offsets,
    scrollTo,
    scrollToEnd,
    onScroll,
    isAtTop: scrollOffset === 0,
    isAtEnd: scrollOffset === maxOffset,
  };
}

export function VirtualList<T>({
  items,
  renderItem,
  viewportHeight,
  estimatedItemHeight = 3,
  overscan = 20,
  followOutput,
  itemKey,
  ref,
}: VirtualListProps<T>): ReactNode {
  const terminal = useContext(TerminalSizeContext);
  const width = terminal?.columns ?? 80;
  const measurements = useRef(new Map<string | number, number>());
  const previousWidth = useRef(width);
  if (previousWidth.current !== width) {
    measurements.current.clear();
    previousWidth.current = width;
  }
  const [, setRevision] = useState(0);
  const nodes = useRef(new Map<string | number, DOMElement>());
  const scrollBox = useRef<ScrollBoxHandle>(null);
  const keys = useMemo(
    () => items.map((item, index) => itemKey?.(item, index) ?? index),
    [items, itemKey],
  );
  const itemHeights = keys.map(
    (key) => measurements.current.get(key) ?? Math.max(1, estimatedItemHeight),
  );
  const scroll = useVirtualScroll({
    itemCount: items.length,
    estimatedItemHeight,
    itemHeights,
    overscan,
    viewportHeight,
    followOutput,
  });
  useImperativeHandle(
    ref,
    () => ({
      scrollTo: scroll.scrollTo,
      scrollToEnd: scroll.scrollToEnd,
      scrollBy: (rows) => scroll.onScroll(rows / Math.max(1, estimatedItemHeight)),
    }),
    [scroll.scrollTo, scroll.scrollToEnd, scroll.onScroll, estimatedItemHeight],
  );
  useLayoutEffect(() => {
    const measure = () => {
      let changed = false;
      for (const [key, node] of nodes.current) {
        const height = Math.ceil(measureElement(node).height);
        if (height > 0 && measurements.current.get(key) !== height) {
          measurements.current.set(key, height);
          changed = true;
        }
      }
      if (changed) setRevision((value) => value + 1);
    };
    measure();
    // The renderer may defer a layout after streaming text or a terminal resize.
    const timer = setTimeout(measure, 20);
    scrollBox.current?.scrollTo(scroll.scrollOffset);
    return () => clearTimeout(timer);
  });
  const visible: ReactNode[] = [];
  for (let index = scroll.startIndex; index < scroll.endIndex; index++) {
    const key = keys[index]!;
    visible.push(
      React.createElement(
        Box,
        {
          key,
          flexDirection: "column",
          flexShrink: 0,
          ref: (node: DOMElement | null) => {
            if (node) nodes.current.set(key, node);
            else nodes.current.delete(key);
          },
        },
        renderItem(items[index]!, index),
      ),
    );
  }
  const top = scroll.offsets[scroll.startIndex] ?? 0;
  const bottom = Math.max(0, scroll.totalHeight - (scroll.offsets[scroll.endIndex] ?? 0));
  return React.createElement(
    ScrollBox,
    { ref: scrollBox, flexDirection: "column", height: Math.max(1, viewportHeight), flexShrink: 0 },
    top > 0 ? React.createElement(Box, { key: "__top", height: top, flexShrink: 0 }) : null,
    ...visible,
    bottom > 0
      ? React.createElement(Box, { key: "__bottom", height: bottom, flexShrink: 0 })
      : null,
  );
}
