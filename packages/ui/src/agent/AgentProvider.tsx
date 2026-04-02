import React, { createContext, useContext, useMemo } from 'react'
import type { Agent } from '@claude-code-kit/agent'
import { useAgent, type UseAgentResult, type UseAgentOptions } from './useAgent'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type AgentContextValue = UseAgentResult & {
  agent: Agent
  model: string
}

export const AgentContext = createContext<AgentContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type AgentProviderProps = {
  agent: Agent
  model?: string
  onError?: (error: Error) => void
  children: React.ReactNode
}

export function AgentProvider({
  agent,
  model = 'unknown',
  onError,
  children,
}: AgentProviderProps): React.ReactNode {
  const agentState = useAgent({ agent, onError })

  const value = useMemo<AgentContextValue>(
    () => ({
      ...agentState,
      agent,
      model,
    }),
    [agentState, agent, model],
  )

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext)
  if (!ctx) {
    throw new Error(
      'useAgentContext must be used within an <AgentProvider>. ' +
        'Wrap your component tree with <AgentProvider agent={agent}>.',
    )
  }
  return ctx
}
