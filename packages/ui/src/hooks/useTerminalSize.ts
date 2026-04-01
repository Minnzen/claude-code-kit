import { useContext } from 'react'
import { TerminalSizeContext } from '@claude-code-kit/ink-renderer'

export type TerminalSize = {
  columns: number
  rows: number
}

export function useTerminalSize(): TerminalSize {
  const size = useContext(TerminalSizeContext)

  if (!size) {
    throw new Error('useTerminalSize must be used within an Ink App component')
  }

  return size
}
