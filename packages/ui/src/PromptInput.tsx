import React, { useState, useCallback } from 'react'
import { Text, Box, useInput, type Key } from '@claude-code-kit/ink-renderer'
import {
  wordFwd,
  wordBwd,
  lineOffset as computeLineOffset,
  cursorLineIndex,
  filterCommands,
} from './utils/promptInputLogic'

type Command = { name: string; description: string }
type VimMode = 'NORMAL' | 'INSERT'

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
  vimMode?: boolean
  multiline?: boolean
}

export function PromptInput({
  value, onChange, onSubmit, placeholder = '', prefix = '❯', prefixColor = 'cyan',
  disabled = false, commands = [], onCommandSelect, history = [],
  vimMode = false, multiline = false,
}: PromptInputProps): React.ReactNode {
  const [cursor, setCursor] = useState(0)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [vim, setVim] = useState<VimMode>('INSERT')
  const [pendingD, setPendingD] = useState(false)
  const isVimNormal = vimMode && vim === 'NORMAL'

  const suggestions = commands.length > 0 ? filterCommands(commands, value) : []
  const hasSuggestions = showSuggestions && suggestions.length > 0

  const lines = multiline ? value.split('\n') : [value]
  const cursorLine = multiline ? cursorLineIndex(lines, cursor) : 0

  const lineOffset = (line: number): number => computeLineOffset(lines, line)

  const updateValue = useCallback((nv: string, nc?: number) => {
    onChange(nv); setCursor(nc ?? nv.length)
    setHistoryIndex(-1); setShowSuggestions(nv.startsWith('/')); setSuggestionIndex(0)
  }, [onChange])

  const insertNewline = () => {
    updateValue(value.slice(0, cursor) + '\n' + value.slice(cursor), cursor + 1)
  }

  const moveLine = (dir: -1 | 1) => {
    const target = cursorLine + dir
    if (multiline && target >= 0 && target < lines.length) {
      const col = cursor - lineOffset(cursorLine)
      setCursor(lineOffset(target) + Math.min(col, lines[target]!.length))
      return true
    }
    return false
  }

  const historyUp = () => {
    if (history.length > 0 && historyIndex + 1 < history.length) {
      const ni = historyIndex + 1; setHistoryIndex(ni)
      const hv = history[ni]!; onChange(hv); setCursor(hv.length)
    }
  }
  const historyDown = () => {
    if (historyIndex > 0) {
      const ni = historyIndex - 1; setHistoryIndex(ni)
      const hv = history[ni]!; onChange(hv); setCursor(hv.length)
    } else if (historyIndex === 0) { setHistoryIndex(-1); onChange(''); setCursor(0) }
  }

  useInput((input: string, key: Key) => {
    if (disabled) return

    if (isVimNormal) {
      if (input !== 'd') setPendingD(false)

      if (input === 'i') { setVim('INSERT'); return }
      if (input === 'a') { setVim('INSERT'); setCursor(c => Math.min(value.length, c + 1)); return }
      if (input === 'h' || key.leftArrow) { setCursor(c => Math.max(0, c - 1)); return }
      if (input === 'l' || key.rightArrow) { setCursor(c => Math.min(Math.max(0, value.length - 1), c + 1)); return }
      if (input === '0' || key.home) {
        setCursor(multiline ? lineOffset(cursorLine) : 0)
        return
      }
      if (input === '$' || key.end) {
        if (multiline) {
          const endOfLine = lineOffset(cursorLine) + lines[cursorLine]!.length
          setCursor(Math.max(lineOffset(cursorLine), endOfLine - 1))
        } else {
          setCursor(Math.max(0, value.length - 1))
        }
        return
      }
      if (input === 'w') { setCursor(wordFwd(value, cursor)); return }
      if (input === 'b') { setCursor(wordBwd(value, cursor)); return }
      if (input === 'x') {
        if (cursor < value.length) {
          const nv = value.slice(0, cursor) + value.slice(cursor + 1)
          updateValue(nv, Math.min(cursor, Math.max(0, nv.length - 1)))
        }
        return
      }
      if (input === 'd') {
        if (!pendingD) {
          setPendingD(true)
          return
        }
        setPendingD(false)
        if (multiline && lines.length > 1) {
          const pos = lineOffset(cursorLine)
          const end = pos + lines[cursorLine]!.length
          const from = cursorLine === 0 ? pos : pos - 1
          const to = cursorLine === 0 ? Math.min(end + 1, value.length) : end
          const nv = value.slice(0, from) + value.slice(to)
          updateValue(nv, Math.min(from, Math.max(0, nv.length - 1)))
        } else {
          updateValue('', 0)
        }
        return
      }
      if (key.upArrow || (input === 'k' && !key.ctrl)) { if (!moveLine(-1)) historyUp(); return }
      if (key.downArrow || (input === 'j' && !key.ctrl)) { if (!moveLine(1)) historyDown(); return }
      if (key.return && value.length > 0) { onSubmit(value); return }
      return
    }

    if (key.return) {
      if (hasSuggestions) {
        const cmd = suggestions[suggestionIndex]!; const cv = `/${cmd.name}`
        onCommandSelect?.(cmd.name); onChange(cv); setCursor(cv.length); setShowSuggestions(false); return
      }
      if (multiline && key.shift) { insertNewline(); return }
      if (value.length > 0) onSubmit(value); return
    }
    if (key.escape) {
      if (hasSuggestions) { setShowSuggestions(false); return }
      if (vimMode) { setVim('NORMAL'); return }
      return
    }
    if (multiline && key.ctrl && input === 'j') { insertNewline(); return }
    if (key.tab) {
      if (hasSuggestions) { updateValue(`/${suggestions[suggestionIndex]!.name} `) }; return
    }
    if (key.upArrow) {
      if (hasSuggestions) { setSuggestionIndex(i => (i > 0 ? i - 1 : suggestions.length - 1)); return }
      if (!moveLine(-1)) historyUp(); return
    }
    if (key.downArrow) {
      if (hasSuggestions) { setSuggestionIndex(i => (i < suggestions.length - 1 ? i + 1 : 0)); return }
      if (!moveLine(1)) historyDown(); return
    }
    if (key.leftArrow) { setCursor(c => Math.max(0, c - 1)); return }
    if (key.rightArrow) { setCursor(c => Math.min(value.length, c + 1)); return }
    if (key.home || (key.ctrl && input === 'a')) { setCursor(0); return }
    if (key.end || (key.ctrl && input === 'e')) { setCursor(value.length); return }
    if (key.ctrl && input === 'w') {
      if (cursor > 0) {
        let i = cursor - 1; while (i > 0 && value[i-1] === ' ') i--; while (i > 0 && value[i-1] !== ' ') i--
        updateValue(value.slice(0, i) + value.slice(cursor), i)
      }; return
    }
    if (key.ctrl && input === 'u') { updateValue(value.slice(cursor), 0); return }
    if (key.backspace) {
      if (cursor > 0) updateValue(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1); return
    }
    if (key.delete) {
      if (cursor < value.length) updateValue(value.slice(0, cursor) + value.slice(cursor + 1), cursor); return
    }
    if (key.ctrl || key.meta) return
    if (input.length > 0) updateValue(value.slice(0, cursor) + input + value.slice(cursor), cursor + input.length)
  }, { isActive: !disabled })

  const renderCursor = (text: string, cur: number): React.ReactNode => {
    if (text.length === 0 && placeholder && cursor === 0) {
      return <Text><Text inverse> </Text><Text dimColor>{placeholder}</Text></Text>
    }
    const before = text.slice(0, cur)
    const at = cur < text.length ? text[cur]! : ' '
    const after = cur < text.length ? text.slice(cur + 1) : ''
    return <Text>{before}<Text inverse>{at}</Text>{after}</Text>
  }

  const vimTag = vimMode ? <Text dimColor>{` -- ${vim} --`}</Text> : null

  const renderContent = (): React.ReactNode => {
    if (!multiline || lines.length <= 1) {
      return <Box><Text color={prefixColor}>{prefix} </Text>{renderCursor(value, cursor)}{vimTag}</Box>
    }
    let off = 0
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => {
          const ls = off; off += line.length + 1; const active = i === cursorLine
          return (
            <Box key={i}>
              <Text color={prefixColor}>{i === 0 ? `${prefix} ` : '∙ '}</Text>
              {active ? renderCursor(line, cursor - ls) : <Text>{line}</Text>}
              {i === lines.length - 1 && vimTag}
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {renderContent()}
      {hasSuggestions && (
        <Box flexDirection="column" marginLeft={2}>
          {suggestions.map((cmd, i) => {
            const isFocused = i === suggestionIndex
            return (
              <Box key={cmd.name}>
                <Text color={isFocused ? 'cyan' : undefined}>
                  {isFocused ? '❯' : ' '}{' '}
                </Text>
                <Text color={isFocused ? 'cyan' : undefined} bold={isFocused}>
                  {`/${cmd.name}`}
                </Text>
                <Text dimColor>{`  ${cmd.description}`}</Text>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
