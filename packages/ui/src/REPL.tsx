import React, { useState, useCallback, useRef } from 'react'
import { Box, Text, useInput, useApp, type Key } from '@claude-code-kit/ink-renderer'
import { MessageList, type Message } from './MessageList'
import { PromptInput } from './PromptInput'
import { Spinner } from './Spinner'
import { StatusLine, type StatusLineSegment } from './StatusLine'
import { Divider } from './Divider'

type REPLCommand = {
  name: string
  description: string
  onExecute: (args: string) => void
}

export type REPLProps = {
  // Core
  onSubmit: (message: string) => Promise<void> | void
  onExit?: () => void

  // State (consumer manages these)
  messages: Message[]
  isLoading?: boolean
  streamingContent?: string | null

  // Customization
  commands?: REPLCommand[]
  model?: string
  statusSegments?: StatusLineSegment[]

  // Prompt
  prefix?: string
  placeholder?: string
  history?: string[]

  // Rendering
  renderMessage?: (message: Message) => React.ReactNode
  spinner?: React.ReactNode
}

export function REPL({
  onSubmit,
  onExit,
  messages,
  isLoading = false,
  streamingContent,
  commands = [],
  model,
  statusSegments,
  prefix = '\u276F',
  placeholder,
  history: externalHistory,
  renderMessage,
  spinner,
}: REPLProps): React.ReactNode {
  const { exit } = useApp()
  const [inputValue, setInputValue] = useState('')
  const [internalHistory, setInternalHistory] = useState<string[]>([])
  const submittingRef = useRef(false)

  const history = externalHistory ?? internalHistory

  const promptCommands = commands.map((c) => ({
    name: c.name,
    description: c.description,
  }))

  const handleSubmit = useCallback(
    (value: string) => {
      if (submittingRef.current) return

      const trimmed = value.trim()
      if (!trimmed) return

      if (trimmed.startsWith('/')) {
        const spaceIndex = trimmed.indexOf(' ')
        const cmdName = spaceIndex >= 0 ? trimmed.slice(1, spaceIndex) : trimmed.slice(1)
        const cmdArgs = spaceIndex >= 0 ? trimmed.slice(spaceIndex + 1).trim() : ''

        const cmd = commands.find((c) => c.name === cmdName)
        if (cmd) {
          setInputValue('')
          cmd.onExecute(cmdArgs)
          return
        }
      }

      submittingRef.current = true
      setInputValue('')
      if (!externalHistory) {
        setInternalHistory((prev) => [trimmed, ...prev])
      }

      const result = onSubmit(trimmed)
      if (result && typeof result.then === 'function') {
        result.finally(() => {
          submittingRef.current = false
        })
      } else {
        submittingRef.current = false
      }
    },
    [commands, onSubmit, externalHistory],
  )

  useInput(
    (_input: string, key: Key) => {
      if (key.ctrl && _input === 'c' && isLoading) {
        return
      }
      if (key.ctrl && _input === 'd') {
        if (onExit) {
          onExit()
        } else {
          exit()
        }
      }
    },
    { isActive: true },
  )

  const resolvedSegments = statusSegments ?? buildDefaultSegments(model)

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          renderMessage={renderMessage}
        />

        {isLoading && !streamingContent && (
          <Box marginTop={messages.length > 0 ? 1 : 0}>
            {spinner ?? <Spinner />}
          </Box>
        )}
      </Box>

      <Divider />

      <PromptInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        prefix={prefix}
        placeholder={placeholder}
        disabled={isLoading}
        commands={promptCommands}
        history={history}
      />

      <Divider />

      {resolvedSegments.length > 0 && (
        <StatusLine segments={resolvedSegments} />
      )}
    </Box>
  )
}

function buildDefaultSegments(model?: string): StatusLineSegment[] {
  if (!model) return []
  return [{ content: model, color: 'green' }]
}
