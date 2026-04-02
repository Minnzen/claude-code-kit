import React, { useCallback, useMemo } from 'react'
import type { Agent } from '@claude-code-kit/agent'
import { AgentProvider } from './AgentProvider'
import { useAgentContext } from './AgentProvider'
import { REPL, type REPLProps } from '../REPL'
import type { PermissionAction } from '../PermissionRequest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type REPLCommand = {
  name: string
  description: string
  onExecute: (args: string) => void
}

export type AgentREPLProps = {
  agent: Agent
  model?: string
  commands?: REPLCommand[]
  welcome?: React.ReactNode
  placeholder?: string
  onError?: (error: Error) => void
  onExit?: () => void
}

// ---------------------------------------------------------------------------
// Inner component that consumes context
// ---------------------------------------------------------------------------

function AgentREPLInner({
  commands,
  welcome,
  placeholder,
  onExit,
}: Pick<AgentREPLProps, 'commands' | 'welcome' | 'placeholder' | 'onExit'>): React.ReactNode {
  const {
    messages,
    isLoading,
    streamingContent,
    permissionRequest,
    submit,
    model,
    clearMessages,
  } = useAgentContext()

  // Build permission request state for the REPL overlay
  const permissionState = useMemo(() => {
    if (!permissionRequest) return undefined
    return {
      toolName: permissionRequest.toolName,
      description: permissionRequest.description,
      details: permissionRequest.details,
      onDecision: (action: PermissionAction) => {
        permissionRequest.resolve(action === 'deny' ? 'deny' : 'allow')
      },
    }
  }, [permissionRequest])

  // Merge built-in commands with user-provided ones
  const allCommands = useMemo(() => {
    const builtIn: REPLCommand[] = [
      {
        name: 'clear',
        description: 'Clear conversation history',
        onExecute: () => clearMessages(),
      },
    ]
    return [...builtIn, ...(commands ?? [])]
  }, [commands, clearMessages])

  const handleSubmit = useCallback(
    async (input: string) => {
      submit(input)
    },
    [submit],
  )

  return (
    <REPL
      onSubmit={handleSubmit}
      onExit={onExit}
      messages={messages}
      isLoading={isLoading}
      streamingContent={streamingContent}
      permissionRequest={permissionState}
      commands={allCommands}
      model={model}
      welcome={welcome}
      placeholder={placeholder}
    />
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AgentREPL({
  agent,
  model,
  commands,
  welcome,
  placeholder,
  onError,
  onExit,
}: AgentREPLProps): React.ReactNode {
  return (
    <AgentProvider agent={agent} model={model} onError={onError}>
      <AgentREPLInner
        commands={commands}
        welcome={welcome}
        placeholder={placeholder}
        onExit={onExit}
      />
    </AgentProvider>
  )
}
