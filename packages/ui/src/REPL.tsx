import React, { useState, useCallback, useRef } from 'react'
import { Box, useInput, useApp, type Key } from '@claude-code-kit/ink-renderer'
import { MessageList, type Message } from './MessageList'
import { PromptInput } from './PromptInput'
import { Spinner } from './Spinner'
import { StatusLine, type StatusLineSegment } from './StatusLine'
import { Divider } from './Divider'
import { PermissionRequest, type PermissionAction } from './PermissionRequest'
import { SearchOverlay, computeMatches } from './SearchOverlay'

type REPLCommand = {
  name: string
  description: string
  onExecute: (args: string) => void
}

type PermissionRequestState = {
  toolName: string
  description: string
  details?: string
  preview?: React.ReactNode
  onDecision: (action: PermissionAction) => void
}

export type REPLProps = {
  onSubmit: (message: string) => Promise<void> | void
  onExit?: () => void

  messages: Message[]
  isLoading?: boolean
  streamingContent?: string | null

  welcome?: React.ReactNode

  permissionRequest?: PermissionRequestState

  commands?: REPLCommand[]
  model?: string
  statusSegments?: StatusLineSegment[]

  prefix?: string
  placeholder?: string
  history?: string[]

  renderMessage?: (message: Message) => React.ReactNode
  spinner?: React.ReactNode
}

export function REPL({
  onSubmit,
  onExit,
  messages,
  isLoading = false,
  streamingContent,
  welcome,
  permissionRequest,
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
  const [searchOpen, setSearchOpen] = useState(false)
  const submittingRef = useRef(false)

  const history = externalHistory ?? internalHistory

  const messageContents = messages.map((m) =>
    typeof m.content === 'string' ? m.content : m.content.map((b) => ('text' in b ? b.text : '')).join(' '),
  )

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
      if (key.ctrl && _input === 'f') {
        setSearchOpen(true)
      }
    },
    // Deactivate when search overlay is open so only SearchOverlay handles input.
    { isActive: !searchOpen },
  )

  const resolvedSegments = statusSegments ?? buildDefaultSegments(model)
  const showWelcome = welcome && messages.length === 0 && !isLoading
  const showPermission = !!permissionRequest

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {showWelcome && (
          <Box marginBottom={1}>{welcome}</Box>
        )}

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

      {searchOpen && (
        <SearchOverlay
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSearch={(q) => computeMatches(messageContents, q)}
          onNavigate={() => {}}
        />
      )}

      <Divider />

      {showPermission ? (
        <PermissionRequest
          toolName={permissionRequest.toolName}
          description={permissionRequest.description}
          details={permissionRequest.details}
          preview={permissionRequest.preview}
          onDecision={permissionRequest.onDecision}
        />
      ) : (
        <PromptInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          prefix={prefix}
          placeholder={placeholder}
          disabled={isLoading || searchOpen}
          commands={promptCommands}
          history={history}
        />
      )}

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
