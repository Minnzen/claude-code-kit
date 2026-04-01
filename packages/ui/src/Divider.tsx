import React, { useContext } from 'react'
import { Text, Ansi, TerminalSizeContext, stringWidth, type Color } from '@claude-code-kit/ink-renderer'

type DividerProps = {
  width?: number
  color?: Color
  char?: string
  padding?: number
  title?: string
}

export function Divider({ width, color, char = '─', padding = 0, title }: DividerProps): React.ReactNode {
  const terminalSize = useContext(TerminalSizeContext)
  const terminalWidth = terminalSize?.columns ?? 80
  const effectiveWidth = Math.max(0, (width ?? (terminalWidth - 2)) - padding)

  if (title) {
    const titleWidth = stringWidth(title) + 2
    const sideWidth = Math.max(0, effectiveWidth - titleWidth)
    const leftWidth = Math.floor(sideWidth / 2)
    const rightWidth = sideWidth - leftWidth
    return (
      <Text color={color} dimColor={!color}>
        {char.repeat(leftWidth)}{' '}
        <Text dimColor>
          <Ansi>{title}</Ansi>
        </Text>{' '}
        {char.repeat(rightWidth)}
      </Text>
    )
  }

  return (
    <Text color={color} dimColor={!color}>
      {char.repeat(effectiveWidth)}
    </Text>
  )
}
