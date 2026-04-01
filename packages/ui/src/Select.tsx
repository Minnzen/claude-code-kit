import React, { useState, useRef, useMemo, useCallback } from 'react'
import { Box, Text, useInput } from '@claude-code-kit/ink-renderer'

export type SelectOption<T = string> = {
  value: T
  label: string
  description?: string
  disabled?: boolean
}

export type SelectProps<T = string> = {
  options: SelectOption<T>[]
  defaultValue?: T
  onChange: (value: T) => void
  onCancel?: () => void
  title?: string
  maxVisible?: number
}

export type MultiSelectProps<T = string> = Omit<SelectProps<T>, 'onChange'> & {
  selectedValues?: T[]
  onToggle: (value: T) => void
  onConfirm: (values: T[]) => void
}

function useListNavigation<T>(opts: {
  options: SelectOption<T>[]
  maxVisible?: number
  onCancel?: () => void
  onSelect: (index: number) => void
  extraHandler?: (input: string, key: { return: boolean }, focusIndex: number) => boolean
}) {
  const { options, maxVisible, onCancel, onSelect, extraHandler } = opts
  const [focusIndex, setFocusIndex] = useState(0)
  const focusRef = useRef(focusIndex)
  focusRef.current = focusIndex

  const total = options.length
  const max = maxVisible ?? total

  const scrollOffset = useMemo(() => {
    if (total <= max) return 0
    const half = Math.floor(max / 2)
    if (focusIndex <= half) return 0
    if (focusIndex >= total - max + half) return total - max
    return focusIndex - half
  }, [focusIndex, total, max])

  const visibleOptions = useMemo(
    () => options.slice(scrollOffset, scrollOffset + max),
    [options, scrollOffset, max],
  )

  const moveFocus = useCallback(
    (dir: 1 | -1) => {
      setFocusIndex((prev) => {
        let next = prev
        for (let i = 0; i < total; i++) {
          next = (next + dir + total) % total
          if (!options[next]!.disabled) return next
        }
        return prev
      })
    },
    [options, total],
  )

  useInput((input, key) => {
    if (extraHandler?.(input, key, focusRef.current)) return

    if (key.upArrow || input === 'k') {
      moveFocus(-1)
    } else if (key.downArrow || input === 'j') {
      moveFocus(1)
    } else if (key.return) {
      if (!options[focusRef.current]?.disabled) {
        onSelect(focusRef.current)
      }
    } else if (key.escape) {
      onCancel?.()
    } else if (input >= '1' && input <= '9') {
      const idx = parseInt(input, 10) - 1
      if (idx < total && !options[idx]!.disabled) {
        setFocusIndex(idx)
        onSelect(idx)
      }
    }
  })

  return { focusIndex, scrollOffset, visibleOptions, max, total }
}

function ScrollHint({ count, direction }: { count: number; direction: 'up' | 'down' }) {
  return <Text dimColor>  {direction === 'up' ? '↑' : '↓'} {count} more</Text>
}

export function Select<T = string>({
  options,
  defaultValue,
  onChange,
  onCancel,
  title,
  maxVisible,
}: SelectProps<T>) {
  const handleSelect = useCallback(
    (index: number) => onChange(options[index]!.value),
    [onChange, options],
  )

  const { focusIndex, scrollOffset, visibleOptions, max, total } =
    useListNavigation({ options, maxVisible, onCancel, onSelect: handleSelect })

  return (
    <Box flexDirection="column">
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}

      {scrollOffset > 0 && <ScrollHint count={scrollOffset} direction="up" />}

      {visibleOptions.map((opt, i) => {
        const realIndex = scrollOffset + i
        const isFocused = realIndex === focusIndex
        const isSelected = opt.value === defaultValue
        const isDisabled = opt.disabled === true

        return (
          <Box key={realIndex}>
            <Text color={isFocused ? 'cyan' : undefined}>
              {isFocused ? '❯' : ' '}{' '}
            </Text>
            <Text
              color={isDisabled ? 'gray' : isFocused ? 'cyan' : undefined}
              bold={isFocused}
              dimColor={isDisabled}
            >
              {realIndex + 1}. {opt.label}
            </Text>
            {isSelected && <Text color="green"> ✓</Text>}
            {opt.description && <Text dimColor>{'   '}{opt.description}</Text>}
          </Box>
        )
      })}

      {scrollOffset + max < total && (
        <ScrollHint count={total - scrollOffset - max} direction="down" />
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Esc to exit</Text>
      </Box>
    </Box>
  )
}

export function MultiSelect<T = string>({
  options,
  selectedValues = [],
  onToggle,
  onConfirm,
  onCancel,
  title,
  maxVisible,
}: MultiSelectProps<T>) {
  const [selected, setSelected] = useState<Set<T>>(() => new Set(selectedValues))

  const handleConfirm = useCallback(
    () => onConfirm(Array.from(selected)),
    [onConfirm, selected],
  )

  const handleSpace = useCallback(
    (input: string, _key: { return: boolean }, focusIndex: number): boolean => {
      if (input !== ' ') return false
      const opt = options[focusIndex]
      if (!opt || opt.disabled) return true
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(opt.value)) next.delete(opt.value)
        else next.add(opt.value)
        return next
      })
      onToggle(opt.value)
      return true
    },
    [options, onToggle],
  )

  const { focusIndex, scrollOffset, visibleOptions, max, total } =
    useListNavigation({
      options,
      maxVisible,
      onCancel,
      onSelect: handleConfirm,
      extraHandler: handleSpace,
    })

  return (
    <Box flexDirection="column">
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}

      {scrollOffset > 0 && <ScrollHint count={scrollOffset} direction="up" />}

      {visibleOptions.map((opt, i) => {
        const realIndex = scrollOffset + i
        const isFocused = realIndex === focusIndex
        const isChecked = selected.has(opt.value)
        const isDisabled = opt.disabled === true

        return (
          <Box key={realIndex}>
            <Text color={isFocused ? 'cyan' : undefined}>
              {isFocused ? '❯' : ' '}{' '}
            </Text>
            <Text
              color={isDisabled ? 'gray' : isFocused ? 'cyan' : undefined}
              bold={isFocused}
              dimColor={isDisabled}
            >
              {isChecked ? '[x]' : '[ ]'} {realIndex + 1}. {opt.label}
            </Text>
            {opt.description && <Text dimColor>{'   '}{opt.description}</Text>}
          </Box>
        )
      })}

      {scrollOffset + max < total && (
        <ScrollHint count={total - scrollOffset - max} direction="down" />
      )}

      <Box marginTop={1}>
        <Text dimColor>Space to toggle · Enter to confirm · Esc to exit</Text>
      </Box>
    </Box>
  )
}
