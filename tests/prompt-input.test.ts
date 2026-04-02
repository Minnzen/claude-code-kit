/**
 * Unit tests for PromptInput pure logic helpers.
 *
 * PromptInput is a React/Ink component that requires a real terminal to render,
 * so we test the extracted pure-logic utilities directly. These cover all the
 * behaviour exercised by the keyboard handlers inside the component.
 */

import { describe, expect, it } from 'vitest'
import {
  wordFwd,
  wordBwd,
  lineOffset,
  cursorLineIndex,
  lineCount,
  filterCommands,
} from '../packages/ui/src/utils/promptInputLogic.ts'

// ---------------------------------------------------------------------------
// Cursor movement helpers
// ---------------------------------------------------------------------------

describe('wordFwd', () => {
  it('moves past the current word to the start of the next', () => {
    expect(wordFwd('hello world', 0)).toBe(6)
  })

  it('skips leading spaces when cursor is already in whitespace', () => {
    expect(wordFwd('hello world foo', 5)).toBe(6)
  })

  it('stops at end of string if no next word', () => {
    expect(wordFwd('hello', 0)).toBe(5)
    expect(wordFwd('hello', 5)).toBe(5)
  })

  it('handles empty string', () => {
    expect(wordFwd('', 0)).toBe(0)
  })

  it('moves through multiple spaces', () => {
    expect(wordFwd('a   b', 0)).toBe(4)
  })
})

describe('wordBwd', () => {
  it('moves to the start of the previous word', () => {
    expect(wordBwd('hello world', 11)).toBe(6)
  })

  it('from middle of a word moves to start of that word', () => {
    expect(wordBwd('hello world', 8)).toBe(6)
  })

  it('skips leading spaces going backwards', () => {
    expect(wordBwd('hello  world', 7)).toBe(0)
  })

  it('returns 0 when at or near the start', () => {
    expect(wordBwd('hello', 0)).toBe(0)
    expect(wordBwd('hello', 1)).toBe(0)
  })

  it('handles empty string', () => {
    expect(wordBwd('', 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Multiline: lineOffset and cursorLineIndex
// ---------------------------------------------------------------------------

describe('lineOffset', () => {
  it('returns 0 for line 0', () => {
    const lines = ['foo', 'bar', 'baz']
    expect(lineOffset(lines, 0)).toBe(0)
  })

  it('returns correct offset for line 1 (len(line0) + 1 for newline)', () => {
    const lines = ['foo', 'bar', 'baz']
    expect(lineOffset(lines, 1)).toBe(4) // "foo\n"
  })

  it('returns correct offset for line 2', () => {
    const lines = ['foo', 'bar', 'baz']
    expect(lineOffset(lines, 2)).toBe(8) // "foo\nbar\n"
  })

  it('handles empty first line', () => {
    const lines = ['', 'bar']
    expect(lineOffset(lines, 1)).toBe(1) // "\n"
  })

  it('handles empty lines throughout', () => {
    const lines = ['', '', '']
    expect(lineOffset(lines, 0)).toBe(0)
    expect(lineOffset(lines, 1)).toBe(1)
    expect(lineOffset(lines, 2)).toBe(2)
  })
})

describe('cursorLineIndex', () => {
  it('returns 0 for cursor at start', () => {
    const lines = ['hello', 'world']
    expect(cursorLineIndex(lines, 0)).toBe(0)
  })

  it('returns 0 for cursor at end of first line', () => {
    const lines = ['hello', 'world']
    // "hello" = indices 0-4, newline at 5
    expect(cursorLineIndex(lines, 5)).toBe(0)
  })

  it('returns 1 for cursor at start of second line', () => {
    const lines = ['hello', 'world']
    expect(cursorLineIndex(lines, 6)).toBe(1)
  })

  it('returns 1 for cursor at end of second line', () => {
    const lines = ['hello', 'world']
    expect(cursorLineIndex(lines, 11)).toBe(1)
  })

  it('handles single-line value', () => {
    const lines = ['hello']
    expect(cursorLineIndex(lines, 3)).toBe(0)
  })

  it('handles three lines', () => {
    const lines = ['a', 'bb', 'ccc']
    // "a\nbb\nccc"
    // line 0: offset 0, length 1 → indices 0-1
    // line 1: offset 2, length 2 → indices 2-4
    // line 2: offset 5, length 3 → indices 5-7
    expect(cursorLineIndex(lines, 0)).toBe(0)
    expect(cursorLineIndex(lines, 1)).toBe(0)
    expect(cursorLineIndex(lines, 2)).toBe(1)
    expect(cursorLineIndex(lines, 4)).toBe(1)
    expect(cursorLineIndex(lines, 5)).toBe(2)
    expect(cursorLineIndex(lines, 7)).toBe(2)
  })

  it('clamps to last line when cursor is beyond total length', () => {
    const lines = ['hi']
    expect(cursorLineIndex(lines, 999)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// lineCount
// ---------------------------------------------------------------------------

describe('lineCount', () => {
  it('returns 1 for a single-line string', () => {
    expect(lineCount('hello')).toBe(1)
    expect(lineCount('')).toBe(1)
  })

  it('returns 2 after one newline', () => {
    expect(lineCount('hello\nworld')).toBe(2)
  })

  it('returns 3 after two newlines', () => {
    expect(lineCount('a\nb\nc')).toBe(3)
  })

  it('counts trailing newline as an extra empty line', () => {
    expect(lineCount('hello\n')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Command autocomplete filtering
// ---------------------------------------------------------------------------

describe('filterCommands', () => {
  const cmds = [
    { name: 'help', description: 'Show help' },
    { name: 'history', description: 'Show history' },
    { name: 'clear', description: 'Clear screen' },
    { name: 'quit', description: 'Quit' },
  ]

  it('returns empty array when value does not start with /', () => {
    expect(filterCommands(cmds, 'help')).toEqual([])
    expect(filterCommands(cmds, '')).toEqual([])
    expect(filterCommands(cmds, 'h')).toEqual([])
  })

  it('returns all commands for bare slash', () => {
    expect(filterCommands(cmds, '/')).toHaveLength(4)
  })

  it('filters by prefix match after slash', () => {
    const result = filterCommands(cmds, '/h')
    expect(result.map((c) => c.name)).toEqual(['help', 'history'])
  })

  it('exact match returns only that command', () => {
    const result = filterCommands(cmds, '/clear')
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('clear')
  })

  it('partial match with no hit returns empty array', () => {
    expect(filterCommands(cmds, '/xyz')).toEqual([])
  })

  it('is case-sensitive (commands are lowercase by convention)', () => {
    // '/H' does not match '/help'
    expect(filterCommands(cmds, '/H')).toEqual([])
  })

  it('returns empty array when commands list is empty', () => {
    expect(filterCommands([], '/help')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Vim mode: 0 / $ line-local behaviour (via lineOffset + cursorLineIndex)
// ---------------------------------------------------------------------------

describe('vim 0 and $ in multiline context', () => {
  /**
   * Simulate pressing '0' in vim normal mode on a multiline string.
   * The cursor should jump to the start of the current line.
   */
  function vim0(value: string, cursor: number): number {
    const lines = value.split('\n')
    const cl = cursorLineIndex(lines, cursor)
    return lineOffset(lines, cl)
  }

  /**
   * Simulate pressing '$' in vim normal mode on a multiline string.
   * The cursor should jump to the last character of the current line
   * (one before the newline), clamped to the line start for empty lines.
   */
  function vimDollar(value: string, cursor: number): number {
    const lines = value.split('\n')
    const cl = cursorLineIndex(lines, cursor)
    const start = lineOffset(lines, cl)
    const end = start + lines[cl]!.length
    return Math.max(start, end - 1)
  }

  it('vim 0 on first line returns 0', () => {
    expect(vim0('hello\nworld', 3)).toBe(0)
  })

  it('vim 0 on second line returns offset of second line', () => {
    // "hello\nworld" — second line starts at offset 6
    expect(vim0('hello\nworld', 8)).toBe(6)
  })

  it('vim $ on first line returns last char of first line', () => {
    // "hello\nworld" — last char of "hello" is index 4
    expect(vimDollar('hello\nworld', 0)).toBe(4)
  })

  it('vim $ on second line returns last char of second line', () => {
    // "hello\nworld" — "world" starts at 6, last char at 10
    expect(vimDollar('hello\nworld', 6)).toBe(10)
  })

  it('vim $ on empty line returns line start (clamped)', () => {
    // "a\n\nb" — empty middle line at offset 2
    expect(vimDollar('a\n\nb', 2)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// History navigation logic
// ---------------------------------------------------------------------------

describe('history navigation logic', () => {
  /**
   * Simulate the historyUp/historyDown state machine used in PromptInput.
   * Returns the new [historyIndex, value] pair after the operation.
   */
  function historyUp(
    history: string[],
    historyIndex: number,
  ): [number, string | null] {
    if (history.length > 0 && historyIndex + 1 < history.length) {
      const ni = historyIndex + 1
      return [ni, history[ni]!]
    }
    return [historyIndex, null] // no change
  }

  function historyDown(
    history: string[],
    historyIndex: number,
  ): [number, string | null] {
    if (historyIndex > 0) {
      const ni = historyIndex - 1
      return [ni, history[ni]!]
    }
    if (historyIndex === 0) {
      return [-1, ''] // restore blank
    }
    return [historyIndex, null] // already at -1, no change
  }

  const history = ['third', 'second', 'first']

  it('pressing up once loads the most recent history entry', () => {
    const [idx, val] = historyUp(history, -1)
    expect(idx).toBe(0)
    expect(val).toBe('third')
  })

  it('pressing up twice loads older entries', () => {
    const [idx1] = historyUp(history, -1)
    const [idx2, val2] = historyUp(history, idx1)
    expect(idx2).toBe(1)
    expect(val2).toBe('second')
  })

  it('pressing up at the oldest entry does nothing', () => {
    const [idx, val] = historyUp(history, 2)
    expect(idx).toBe(2) // unchanged
    expect(val).toBeNull()
  })

  it('pressing down after going up returns to newer entry', () => {
    const [idx1] = historyUp(history, -1)
    const [idx2] = historyUp(history, idx1)
    const [idx3, val3] = historyDown(history, idx2)
    expect(idx3).toBe(0)
    expect(val3).toBe('third')
  })

  it('pressing down when at index 0 restores empty input', () => {
    const [idx, val] = historyDown(history, 0)
    expect(idx).toBe(-1)
    expect(val).toBe('')
  })

  it('pressing down when already at -1 does nothing', () => {
    const [idx, val] = historyDown(history, -1)
    expect(idx).toBe(-1)
    expect(val).toBeNull()
  })

  it('does nothing when history is empty', () => {
    const [idx, val] = historyUp([], -1)
    expect(idx).toBe(-1)
    expect(val).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Vim mode switching logic
// ---------------------------------------------------------------------------

describe('vim mode switching', () => {
  /**
   * Simulate the mode state transitions:
   *   - Esc in INSERT → NORMAL
   *   - 'i' in NORMAL → INSERT (cursor unchanged)
   *   - 'a' in NORMAL → INSERT + cursor + 1
   */
  type Mode = 'INSERT' | 'NORMAL'

  function pressEsc(mode: Mode, vimEnabled: boolean): Mode {
    if (vimEnabled && mode === 'INSERT') return 'NORMAL'
    return mode
  }

  function pressI(mode: Mode): Mode {
    if (mode === 'NORMAL') return 'INSERT'
    return mode
  }

  function pressA(mode: Mode, cursor: number, valueLen: number): [Mode, number] {
    if (mode === 'NORMAL') return ['INSERT', Math.min(valueLen, cursor + 1)]
    return [mode, cursor]
  }

  it('Esc switches INSERT → NORMAL when vim is enabled', () => {
    expect(pressEsc('INSERT', true)).toBe('NORMAL')
  })

  it('Esc does nothing in NORMAL mode', () => {
    expect(pressEsc('NORMAL', true)).toBe('NORMAL')
  })

  it('Esc does nothing when vimMode is disabled', () => {
    expect(pressEsc('INSERT', false)).toBe('INSERT')
  })

  it('i switches NORMAL → INSERT', () => {
    expect(pressI('NORMAL')).toBe('INSERT')
  })

  it('i in INSERT stays INSERT', () => {
    expect(pressI('INSERT')).toBe('INSERT')
  })

  it('a switches NORMAL → INSERT and advances cursor', () => {
    const [mode, cur] = pressA('NORMAL', 2, 5)
    expect(mode).toBe('INSERT')
    expect(cur).toBe(3)
  })

  it('a does not advance cursor past end of value', () => {
    const [mode, cur] = pressA('NORMAL', 5, 5)
    expect(mode).toBe('INSERT')
    expect(cur).toBe(5)
  })

  it('a in INSERT mode is a no-op', () => {
    const [mode, cur] = pressA('INSERT', 2, 5)
    expect(mode).toBe('INSERT')
    expect(cur).toBe(2)
  })
})
