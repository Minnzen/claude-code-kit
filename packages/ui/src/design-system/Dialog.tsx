import React, { useCallback } from 'react'
import { Box, Text, useInput } from '@claude-code-kit/ink-renderer'
import type { Theme } from './ThemeProvider'
import { Byline } from './Byline'
import { KeyboardShortcutHint } from './KeyboardShortcutHint'
import { Pane } from './Pane'

type DialogProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  onCancel: () => void
  color?: keyof Theme
  hideInputGuide?: boolean
  hideBorder?: boolean
}

/**
 * A dialog box with title, content, and keyboard hints.
 * Press Esc to cancel/close.
 */
export function Dialog({
  title,
  subtitle,
  children,
  onCancel,
  color = 'permission',
  hideInputGuide,
  hideBorder,
}: DialogProps): React.ReactNode {
  useInput(
    useCallback(
      (_input: string, key: { escape?: boolean }) => {
        if (key.escape) {
          onCancel()
        }
      },
      [onCancel],
    ),
  )

  const defaultInputGuide = (
    <Byline>
      <KeyboardShortcutHint shortcut="Enter" action="confirm" />
      <KeyboardShortcutHint shortcut="Esc" action="cancel" />
    </Byline>
  )

  const content = (
    <>
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold={true} color={color}>
            {title}
          </Text>
          {subtitle && <Text dimColor={true}>{subtitle}</Text>}
        </Box>
        {children}
      </Box>
      {!hideInputGuide && (
        <Box marginTop={1}>
          <Text dimColor={true} italic={true}>
            {defaultInputGuide}
          </Text>
        </Box>
      )}
    </>
  )

  if (hideBorder) {
    return content
  }

  return <Pane color={color}>{content}</Pane>
}
