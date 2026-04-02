import React, { useMemo, useCallback, useContext } from 'react'
import { Box, Text, useInput, TerminalSizeContext } from '@claude-code-kit/ink-renderer'

export type PermissionAction = 'allow' | 'always_allow' | 'deny'

export type PermissionRequestProps = {
  toolName: string
  description: string
  /** Optional details (command, file path, diff, etc.) */
  details?: string
  /** Whether to show "Always Allow" option (default true) */
  showAlwaysAllow?: boolean
  /** Callback when user makes a decision */
  onDecision: (action: PermissionAction, feedback?: string) => void
  /** Optional custom content between description and buttons */
  children?: React.ReactNode
  /** Optional: render a DiffView or code preview */
  preview?: React.ReactNode
}

function PermissionHeader({ toolName, width }: { toolName: string; width: number }) {
  const label = ` ${toolName} `
  const labelLen = toolName.length + 2
  const leftLen = 3
  const rightLen = Math.max(0, width - leftLen - labelLen)
  return (
    <Text>
      <Text dimColor>{'─'.repeat(leftLen)}</Text>
      <Text bold color="cyan">{label}</Text>
      <Text dimColor>{'─'.repeat(rightLen)}</Text>
    </Text>
  )
}

function HorizontalRule({ width }: { width: number }) {
  return <Text dimColor>{'─'.repeat(width)}</Text>
}

export function BashPermissionContent({ command }: { command: string }): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text>Run command:</Text>
      <Box marginLeft={2}>
        <Text color="yellow">{command}</Text>
      </Box>
    </Box>
  )
}

export function FileEditPermissionContent({
  filename,
  diff,
}: {
  filename: string
  diff: string
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text>
        Edit file: <Text color="cyan" bold>{filename}</Text>
      </Text>
      {diff && (
        <Box marginTop={1} flexDirection="column">
          {diff.split('\n').map((line, i) => {
            let color: string | undefined
            if (line.startsWith('+')) color = 'green'
            else if (line.startsWith('-')) color = 'red'
            else if (line.startsWith('@')) color = 'cyan'
            return (
              <Text key={i} color={color} dimColor={!color && !line.startsWith('+')} >
                {line}
              </Text>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

type OptionDef = {
  value: PermissionAction
  label: string
}

export function PermissionRequest({
  toolName,
  description,
  details,
  showAlwaysAllow = true,
  onDecision,
  children,
  preview,
}: PermissionRequestProps): React.ReactNode {
  const terminalSize = useContext(TerminalSizeContext)
  const terminalWidth = Math.min((terminalSize?.columns ?? 80) - 2, 80)

  const options = useMemo<OptionDef[]>(() => {
    const opts: OptionDef[] = [
      { value: 'allow', label: 'Yes, allow this action' },
    ]
    if (showAlwaysAllow) {
      opts.push({ value: 'always_allow', label: `Yes, and always allow ${toolName}` })
    }
    opts.push({ value: 'deny', label: 'No, deny' })
    return opts
  }, [showAlwaysAllow, toolName])

  const [focusIndex, setFocusIndex] = React.useState(0)
  const focusRef = React.useRef(focusIndex)
  focusRef.current = focusIndex

  const decide = useCallback(
    (action: PermissionAction) => {
      onDecision(action)
    },
    [onDecision],
  )

  useInput((input, key) => {
    if (input === 'y') {
      decide('allow')
      return
    }
    if (input === 'a' && showAlwaysAllow) {
      decide('always_allow')
      return
    }
    if (input === 'n' || key.escape) {
      decide('deny')
      return
    }

    if (key.upArrow || input === 'k') {
      setFocusIndex((prev) => (prev - 1 + options.length) % options.length)
    } else if (key.downArrow || input === 'j') {
      setFocusIndex((prev) => (prev + 1) % options.length)
    } else if (key.return) {
      decide(options[focusRef.current]!.value)
    } else if (input >= '1' && input <= '9') {
      const idx = parseInt(input, 10) - 1
      if (idx < options.length) {
        setFocusIndex(idx)
        decide(options[idx]!.value)
      }
    }
  })

  return (
    <Box flexDirection="column">
      <PermissionHeader toolName={toolName} width={terminalWidth} />

      <Box marginTop={1} marginLeft={2} flexDirection="column">
        <Text>{description}</Text>
      </Box>

      {details && (
        <Box marginTop={1} marginLeft={4}>
          <Text color="yellow">{details}</Text>
        </Box>
      )}

      {children && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          {children}
        </Box>
      )}

      {preview && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          {preview}
        </Box>
      )}

      <Box marginTop={1}>
        <HorizontalRule width={terminalWidth} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        {options.map((opt, i) => {
          const isFocused = i === focusIndex
          return (
            <Box key={opt.value}>
              <Text color={isFocused ? 'cyan' : undefined}>
                {isFocused ? '❯' : ' '}{' '}
              </Text>
              <Text
                color={isFocused ? 'cyan' : undefined}
                bold={isFocused}
              >
                {i + 1}. {opt.label}
              </Text>
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Esc to deny</Text>
      </Box>
    </Box>
  )
}
