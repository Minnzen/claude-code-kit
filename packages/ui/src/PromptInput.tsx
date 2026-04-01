import React, { useState, useCallback } from 'react'
import { Text, Box, useInput, type Key } from '@claude-code-kit/ink-renderer'

type Command = { name: string; description: string }

type PromptInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
  prefix?: string
  prefixColor?: string
  disabled?: boolean
  commands?: Command[]
  onCommandSelect?: (name: string) => void
  history?: string[]
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  prefix = '❯',
  prefixColor = 'cyan',
  disabled = false,
  commands = [],
  onCommandSelect,
  history = [],
}: PromptInputProps): React.ReactNode {
  const [cursor, setCursor] = useState(0)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions =
    value.startsWith('/') && commands.length > 0
      ? commands.filter((cmd) => `/${cmd.name}`.startsWith(value))
      : []

  const hasSuggestions = showSuggestions && suggestions.length > 0

  const updateValue = useCallback(
    (newValue: string, newCursor?: number) => {
      onChange(newValue)
      setCursor(newCursor ?? newValue.length)
      setHistoryIndex(-1)
      setShowSuggestions(newValue.startsWith('/'))
      setSuggestionIndex(0)
    },
    [onChange],
  )

  useInput(
    (input: string, key: Key) => {
      if (disabled) return

      if (key.return) {
        if (hasSuggestions) {
          const cmd = suggestions[suggestionIndex]!
          const cmdValue = `/${cmd.name}`
          onCommandSelect?.(cmd.name)
          onChange(cmdValue)
          setCursor(cmdValue.length)
          setShowSuggestions(false)
          return
        }
        if (value.length > 0) {
          onSubmit(value)
        }
        return
      }

      if (key.escape) {
        if (hasSuggestions) {
          setShowSuggestions(false)
        }
        return
      }

      if (key.tab) {
        if (hasSuggestions) {
          const cmd = suggestions[suggestionIndex]!
          const cmdValue = `/${cmd.name} `
          updateValue(cmdValue)
        }
        return
      }

      if (key.upArrow) {
        if (hasSuggestions) {
          setSuggestionIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1))
          return
        }
        if (history.length > 0) {
          const nextIndex = historyIndex + 1
          if (nextIndex < history.length) {
            setHistoryIndex(nextIndex)
            const histValue = history[nextIndex]!
            onChange(histValue)
            setCursor(histValue.length)
          }
        }
        return
      }

      if (key.downArrow) {
        if (hasSuggestions) {
          setSuggestionIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0))
          return
        }
        if (historyIndex > 0) {
          const nextIndex = historyIndex - 1
          setHistoryIndex(nextIndex)
          const histValue = history[nextIndex]!
          onChange(histValue)
          setCursor(histValue.length)
        } else if (historyIndex === 0) {
          setHistoryIndex(-1)
          onChange('')
          setCursor(0)
        }
        return
      }

      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1))
        return
      }

      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1))
        return
      }

      if (key.home || (key.ctrl && input === 'a')) {
        setCursor(0)
        return
      }

      if (key.end || (key.ctrl && input === 'e')) {
        setCursor(value.length)
        return
      }

      if (key.ctrl && input === 'w') {
        if (cursor > 0) {
          let i = cursor - 1
          while (i > 0 && value[i - 1] === ' ') i--
          while (i > 0 && value[i - 1] !== ' ') i--
          const newValue = value.slice(0, i) + value.slice(cursor)
          updateValue(newValue, i)
        }
        return
      }

      if (key.ctrl && input === 'u') {
        const newValue = value.slice(cursor)
        updateValue(newValue, 0)
        return
      }

      if (key.backspace) {
        if (cursor > 0) {
          const newValue = value.slice(0, cursor - 1) + value.slice(cursor)
          updateValue(newValue, cursor - 1)
        }
        return
      }

      if (key.delete) {
        if (cursor < value.length) {
          const newValue = value.slice(0, cursor) + value.slice(cursor + 1)
          updateValue(newValue, cursor)
        }
        return
      }

      if (key.ctrl || key.meta) return

      if (input.length > 0) {
        const newValue = value.slice(0, cursor) + input + value.slice(cursor)
        updateValue(newValue, cursor + input.length)
      }
    },
    { isActive: !disabled },
  )

  const renderTextWithCursor = (): React.ReactNode => {
    if (value.length === 0 && placeholder) {
      return (
        <Text>
          <Text inverse> </Text>
          <Text dimColor>{placeholder}</Text>
        </Text>
      )
    }

    const before = value.slice(0, cursor)
    const atCursor = cursor < value.length ? value[cursor]! : ' '
    const after = cursor < value.length ? value.slice(cursor + 1) : ''

    return (
      <Text>
        {before}
        <Text inverse>{atCursor}</Text>
        {after}
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={prefixColor}>{prefix} </Text>
        {renderTextWithCursor()}
      </Box>
      {hasSuggestions && (
        <Box flexDirection="column" marginLeft={2}>
          {suggestions.map((cmd, i) => (
            <Box key={cmd.name}>
              <Text
                inverse={i === suggestionIndex}
                color={i === suggestionIndex ? 'cyan' : undefined}
              >
                {`  /${cmd.name}`}
              </Text>
              <Text dimColor>{`  ${cmd.description}`}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
