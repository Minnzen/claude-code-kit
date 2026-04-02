import React, { useEffect, useState } from 'react'
import { Box, Text, Ansi, type Color } from '@claude-code-kit/ink-renderer'

export type StatusLineSegment = {
  content: string
  color?: Color
  flex?: boolean
}

export type StatusLineProps = {
  segments?: StatusLineSegment[]
  text?: string
  paddingX?: number
  /** @deprecated Use separator instead. Gap between segments in columns. */
  gap?: number
  /** Separator string between segments (default: ' · ') */
  separator?: string
  borderStyle?: 'none' | 'single' | 'round'
  borderColor?: Color
}

function hasAnsi(s: string): boolean {
  return /\x1b\[/.test(s)
}

export function StatusLine({
  segments,
  text,
  paddingX = 1,
  separator = ' \u00B7 ',
  borderStyle = 'none',
  borderColor,
}: StatusLineProps): React.ReactNode {
  const border = borderStyle === 'none' ? undefined : borderStyle

  return (
    <Box
      flexDirection="row"
      paddingX={paddingX}
      borderStyle={border}
      borderColor={borderColor}
    >
      {text !== undefined ? (
        hasAnsi(text) ? <Ansi>{text}</Ansi> : <Text dimColor>{text}</Text>
      ) : (
        segments?.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Text dimColor>{separator}</Text>}
            <Box flexGrow={seg.flex ? 1 : 0}>
              {hasAnsi(seg.content) ? (
                <Ansi>{seg.content}</Ansi>
              ) : (
                <Text dimColor color={seg.color}>{seg.content}</Text>
              )}
            </Box>
          </React.Fragment>
        ))
      )}
    </Box>
  )
}

export function useStatusLine(
  updater: () => StatusLineSegment[] | string,
  deps: unknown[],
  intervalMs?: number,
): StatusLineSegment[] | string {
  const [value, setValue] = useState<StatusLineSegment[] | string>(() => updater())

  useEffect(() => {
    setValue(updater())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!intervalMs) return
    const id = setInterval(() => setValue(updater()), intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs])

  return value
}
