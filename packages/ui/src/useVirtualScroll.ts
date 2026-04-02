import React, { useState, useCallback, useMemo, type ReactNode } from 'react'
import { Box } from '@claude-code-kit/ink-renderer'

export type VirtualScrollOptions = {
  itemCount: number
  /** Lines per item (default: 3) */
  estimatedItemHeight?: number
  /** Extra items rendered above/below the viewport (default: 20) */
  overscan?: number
  /** Visible terminal rows */
  viewportHeight: number
}

export type VirtualScrollResult = {
  startIndex: number
  endIndex: number
  visibleItems: number
  totalHeight: number
  scrollOffset: number
  scrollTo: (index: number) => void
  scrollToEnd: () => void
  /** Adjust scroll by delta items (+1 = down, -1 = up) */
  onScroll: (delta: number) => void
  isAtTop: boolean
  isAtEnd: boolean
}

export type VirtualListProps<T> = {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  viewportHeight: number
  estimatedItemHeight?: number
  overscan?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function useVirtualScroll(options: VirtualScrollOptions): VirtualScrollResult {
  const {
    itemCount,
    estimatedItemHeight = 3,
    overscan = 20,
    viewportHeight,
  } = options

  const totalHeight = itemCount * estimatedItemHeight
  const maxOffset = Math.max(0, totalHeight - viewportHeight)

  const [scrollOffset, setScrollOffset] = useState(0)

  // Clamp offset when bounds change (e.g. items added/removed)
  const clampedOffset = clamp(scrollOffset, 0, maxOffset)

  // Visible range before overscan
  const rawStart = Math.floor(clampedOffset / estimatedItemHeight)
  const rawEnd = Math.ceil((clampedOffset + viewportHeight) / estimatedItemHeight)

  // Apply overscan and clamp to valid indices
  const startIndex = clamp(rawStart - overscan, 0, itemCount)
  const endIndex = clamp(rawEnd + overscan, 0, itemCount)
  const visibleItems = endIndex - startIndex

  const scrollTo = useCallback(
    (index: number) => {
      const targetOffset = clamp(index * estimatedItemHeight, 0, maxOffset)
      setScrollOffset(targetOffset)
    },
    [estimatedItemHeight, maxOffset],
  )

  const scrollToEnd = useCallback(() => {
    setScrollOffset(maxOffset)
  }, [maxOffset])

  const onScroll = useCallback(
    (delta: number) => {
      setScrollOffset((prev) => clamp(prev + delta * estimatedItemHeight, 0, maxOffset))
    },
    [estimatedItemHeight, maxOffset],
  )

  const isAtTop = clampedOffset <= 0
  const isAtEnd = clampedOffset >= maxOffset

  return useMemo(
    () => ({
      startIndex,
      endIndex,
      visibleItems,
      totalHeight,
      scrollOffset: clampedOffset,
      scrollTo,
      scrollToEnd,
      onScroll,
      isAtTop,
      isAtEnd,
    }),
    [
      startIndex,
      endIndex,
      visibleItems,
      totalHeight,
      clampedOffset,
      scrollTo,
      scrollToEnd,
      onScroll,
      isAtTop,
      isAtEnd,
    ],
  )
}

export function VirtualList<T>(props: VirtualListProps<T>): ReactNode {
  const { items, renderItem, viewportHeight, estimatedItemHeight = 3, overscan = 20 } = props

  const { startIndex, endIndex, totalHeight } = useVirtualScroll({
    itemCount: items.length,
    estimatedItemHeight,
    overscan,
    viewportHeight,
  })

  // Top spacer accounts for items scrolled past
  const topPad = startIndex * estimatedItemHeight
  // Bottom spacer fills the remaining space so layout height stays stable
  const renderedHeight = (endIndex - startIndex) * estimatedItemHeight
  const bottomPad = Math.max(0, totalHeight - topPad - renderedHeight)

  const visibleSlice: ReactNode[] = []
  for (let i = startIndex; i < endIndex && i < items.length; i++) {
    visibleSlice.push(renderItem(items[i] as T, i))
  }

  return React.createElement(
    Box,
    {
      flexDirection: 'column' as const,
      height: viewportHeight,
      overflow: 'hidden' as const,
    },
    topPad > 0
      ? React.createElement(Box, { height: topPad, key: '__virtual-top' })
      : null,
    ...visibleSlice,
    bottomPad > 0
      ? React.createElement(Box, { height: bottomPad, key: '__virtual-bottom' })
      : null,
  )
}
