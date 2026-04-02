import React, { useMemo } from 'react'
import { Box, Text, type Color } from '@claude-code-kit/ink-renderer'

export type DiffLine = {
  type: 'added' | 'removed' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export type DiffViewProps = {
  filename: string
  lines: DiffLine[]
  /** Raw unified diff string — parsed automatically if provided */
  diff?: string
  /** Show line numbers (default: true) */
  showLineNumbers?: boolean
  /** Max visible lines before showing a scroll hint */
  maxHeight?: number
  color?: {
    added?: string
    removed?: string
    context?: string
    header?: string
  }
}

export function parseUnifiedDiff(diff: string): { filename: string; lines: DiffLine[] } {
  const rawLines = diff.split('\n')
  let filename = ''
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of rawLines) {
    // Extract filename from +++ header (prefer this over ---)
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim()
      filename = path.startsWith('b/') ? path.slice(2) : path
      continue
    }
    if (line.startsWith('--- ')) continue

    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10)
      newLine = parseInt(hunkMatch[2]!, 10)
      continue
    }

    // Skip other diff metadata
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('\\')) {
      continue
    }

    if (oldLine === 0 && newLine === 0) continue

    if (line.startsWith('+')) {
      lines.push({
        type: 'added',
        content: line.slice(1),
        newLineNumber: newLine,
      })
      newLine++
    } else if (line.startsWith('-')) {
      lines.push({
        type: 'removed',
        content: line.slice(1),
        oldLineNumber: oldLine,
      })
      oldLine++
    } else {
      // Context line (starts with space or is empty in the diff)
      lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      })
      oldLine++
      newLine++
    }
  }

  return { filename: filename || 'unknown', lines }
}

export function DiffView({
  filename,
  lines: propLines,
  diff,
  showLineNumbers = true,
  maxHeight,
  color: colorOverrides,
}: DiffViewProps): React.ReactNode {
  const parsed = useMemo(() => {
    if (diff) return parseUnifiedDiff(diff)
    return null
  }, [diff])

  const resolvedFilename = parsed?.filename ?? filename
  const resolvedLines = parsed?.lines ?? propLines

  const addedColor = (colorOverrides?.added ?? 'green') as Color
  const removedColor = (colorOverrides?.removed ?? 'red') as Color
  const headerColor = (colorOverrides?.header ?? 'cyan') as Color
  const contextColor = colorOverrides?.context as Color | undefined

  // Compute gutter width from max line number
  const maxLineNum = useMemo(() => {
    let max = 0
    for (const line of resolvedLines) {
      if (line.oldLineNumber !== undefined && line.oldLineNumber > max) max = line.oldLineNumber
      if (line.newLineNumber !== undefined && line.newLineNumber > max) max = line.newLineNumber
    }
    return max
  }, [resolvedLines])

  const gutterWidth = Math.max(2, String(maxLineNum).length)

  const visibleLines = maxHeight && resolvedLines.length > maxHeight
    ? resolvedLines.slice(0, maxHeight)
    : resolvedLines

  const truncated = maxHeight && resolvedLines.length > maxHeight
    ? resolvedLines.length - maxHeight
    : 0

  return (
    <Box flexDirection="column">
      <Text bold color={headerColor}>  {resolvedFilename}</Text>
      <Text dimColor>  {'─'.repeat(30)}</Text>

      {visibleLines.map((line, i) => (
        <DiffLineRow
          key={i}
          line={line}
          gutterWidth={gutterWidth}
          showLineNumbers={showLineNumbers}
          addedColor={addedColor}
          removedColor={removedColor}
          contextColor={contextColor}
        />
      ))}

      {truncated > 0 && (
        <Text dimColor>  ... {truncated} more lines</Text>
      )}
    </Box>
  )
}

function DiffLineRow({ line, gutterWidth, showLineNumbers, addedColor, removedColor, contextColor }: {
  line: DiffLine; gutterWidth: number; showLineNumbers: boolean
  addedColor: Color; removedColor: Color; contextColor: Color | undefined
}): React.ReactNode {
  const lineNum = line.type === 'removed'
    ? line.oldLineNumber
    : line.newLineNumber ?? line.oldLineNumber
  const prefix = line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '
  const gutterStr = showLineNumbers && lineNum !== undefined
    ? String(lineNum).padStart(gutterWidth)
    : ' '.repeat(gutterWidth)
  const contentColor = line.type === 'added' ? addedColor
    : line.type === 'removed' ? removedColor
    : contextColor
  const dim = line.type === 'context' && !contextColor

  return (
    <Text>
      <Text dimColor>{gutterStr}</Text>
      <Text dimColor> │ </Text>
      <Text dimColor={dim} color={contentColor}>{prefix}{line.content}</Text>
    </Text>
  )
}
