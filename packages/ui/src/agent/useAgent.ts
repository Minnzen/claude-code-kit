import { useState, useCallback, useRef, useEffect } from 'react'
import type { Agent, AgentEvent, Message as AgentMessage, ToolCall } from '@claude-code-kit/agent'
import type { Message, MessageContent } from '../MessageList'

// ---------------------------------------------------------------------------
// Permission UI bridge type
// ---------------------------------------------------------------------------

export type PermissionUIRequest = {
  toolName: string
  description: string
  details?: string
  resolve: (decision: 'allow' | 'deny') => void
}

// ---------------------------------------------------------------------------
// Hook options & result
// ---------------------------------------------------------------------------

export type UseAgentOptions = {
  agent: Agent
  onError?: (error: Error) => void
}

export type UseAgentResult = {
  messages: Message[]
  isLoading: boolean
  streamingContent: string | null
  permissionRequest: PermissionUIRequest | null
  submit: (input: string) => void
  cancel: () => void
  clearMessages: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _msgId = 0
function nextId(): string {
  return `msg-${++_msgId}-${Date.now()}`
}

function toolCallToContent(tc: ToolCall): MessageContent {
  return {
    type: 'tool_use',
    toolName: tc.name,
    input: JSON.stringify(tc.input, null, 2),
    status: 'running',
  }
}

// ---------------------------------------------------------------------------
// useAgent
// ---------------------------------------------------------------------------

export function useAgent({ agent, onError }: UseAgentOptions): UseAgentResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<PermissionUIRequest | null>(null)

  // Guard against concurrent runs (Bug 3 fix)
  const isRunningRef = useRef(false)

  // Map tool-call id -> message id so we can update on tool_result
  const toolMsgMap = useRef<Map<string, string>>(new Map())

  // Wire the permission handler on the agent (Bug 1 fix)
  useEffect(() => {
    agent.setPermissionHandler(async (request) => {
      return new Promise<{ decision: 'allow' | 'deny'; reason?: string }>((resolve) => {
        setPermissionRequest({
          toolName: request.tool,
          description: `Tool "${request.tool}" wants to execute`,
          details: JSON.stringify(request.input, null, 2),
          resolve: (decision) => {
            setPermissionRequest(null)
            resolve({ decision })
          },
        })
      })
    })
  }, [agent])

  const cancel = useCallback(() => {
    agent.abort()
    isRunningRef.current = false
    setIsLoading(false)
    setStreamingContent(null)
    setPermissionRequest(null)
  }, [agent])

  const clearMessages = useCallback(() => {
    agent.clearMessages()
    setMessages([])
    setStreamingContent(null)
    setPermissionRequest(null)
  }, [agent])

  const submit = useCallback(
    (input: string) => {
      // Bug 3 fix: prevent concurrent runs
      if (isRunningRef.current) return
      const trimmed = input.trim()
      if (!trimmed) return

      // Add user message to UI state immediately
      const userMsg: Message = {
        id: nextId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      isRunningRef.current = true
      setIsLoading(true)
      setStreamingContent(null)

      // Drive the agent loop
      ;(async () => {
        let accumulated = ''

        try {
          for await (const event of agent.run(trimmed)) {
            switch (event.type) {
              case 'text': {
                accumulated += event.text
                setStreamingContent(accumulated)
                break
              }

              case 'tool_call': {
                const msgId = nextId()
                toolMsgMap.current.set(event.toolCall.id, msgId)
                const toolMsg: Message = {
                  id: msgId,
                  role: 'assistant',
                  content: [toolCallToContent(event.toolCall)],
                  timestamp: Date.now(),
                }
                setMessages((prev) => [...prev, toolMsg])
                break
              }

              case 'tool_result': {
                const targetId = toolMsgMap.current.get(event.toolCallId)
                if (targetId) {
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== targetId) return m
                      const contents = Array.isArray(m.content) ? m.content : []
                      return {
                        ...m,
                        content: contents.map((c) => {
                          if (c.type !== 'tool_use') return c
                          return {
                            ...c,
                            result: event.result.content,
                            status: event.result.isError ? 'error' as const : 'success' as const,
                          }
                        }),
                      }
                    }),
                  )
                  toolMsgMap.current.delete(event.toolCallId)
                }
                break
              }

              case 'error': {
                onError?.(event.error)
                break
              }

              case 'done': {
                // Flush any accumulated text as a final assistant message
                if (accumulated.length > 0) {
                  const assistantMsg: Message = {
                    id: nextId(),
                    role: 'assistant',
                    content: accumulated,
                    timestamp: Date.now(),
                  }
                  setMessages((prev) => [...prev, assistantMsg])
                }
                accumulated = ''
                setStreamingContent(null)
                break
              }
            }
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          onError?.(error)
        } finally {
          isRunningRef.current = false
          setIsLoading(false)
          setStreamingContent(null)
        }
      })()
    },
    [agent, onError],
  )

  return {
    messages,
    isLoading,
    streamingContent,
    permissionRequest,
    submit,
    cancel,
    clearMessages,
  }
}
