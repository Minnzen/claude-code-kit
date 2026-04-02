import React, { useState } from 'react'
import { Box, Text } from '@claude-code-kit/ink-renderer'
import { Spinner } from './Spinner'

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolName: string; input: string; result?: string; status?: 'running' | 'success' | 'error' }
  | { type: 'thinking'; text: string; collapsed?: boolean }
  | { type: 'diff'; filename: string; diff: string }
  | { type: 'code'; language?: string; code: string }
  | { type: 'error'; message: string; details?: string }

export type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | MessageContent[]
  timestamp?: number
}

export type MessageListProps = {
  messages: Message[]
  streamingContent?: string | null
  renderMessage?: (message: Message) => React.ReactNode
}

const ROLE_CONFIG = {
  user: { icon: '\u276F', label: 'You', color: 'cyan' as const },
  assistant: { icon: '\u25CF', label: 'Claude', color: '#DA7756' as const },
  system: { icon: '\u273B', label: 'System', color: undefined },
} as const

const GUTTER = '\u23BF' // ⎿

function TextBlock({ text, dim }: { text: string; dim?: boolean }): React.ReactNode {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Box key={i} marginLeft={2}>
          <Text dimColor={dim}>{line}</Text>
        </Box>
      ))}
    </>
  )
}

function ToolUseBlock({ content }: { content: Extract<MessageContent, { type: 'tool_use' }> }): React.ReactNode {
  const statusColor = content.status === 'error' ? 'red' : content.status === 'success' ? 'green' : undefined

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text dimColor>{GUTTER} </Text>
        <Text bold>{content.toolName}</Text>
      </Box>
      {content.input.split('\n').map((line, i) => (
        <Box key={i} marginLeft={4}>
          <Text dimColor>{line}</Text>
        </Box>
      ))}
      {content.status === 'running' && (
        <Box marginLeft={4}>
          <Spinner label={content.toolName} showElapsed />
        </Box>
      )}
      {content.result != null && (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text dimColor>{GUTTER} </Text>
            <Text color={statusColor}>result ({content.status ?? 'done'})</Text>
          </Box>
          {content.result.split('\n').map((line, i) => (
            <Box key={i} marginLeft={6}>
              <Text color={statusColor} dimColor={!statusColor}>{line}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function ThinkingBlock({ content }: { content: Extract<MessageContent, { type: 'thinking' }> }): React.ReactNode {
  const [collapsed, setCollapsed] = useState(content.collapsed ?? true)

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <Box onClick={() => setCollapsed((c) => !c)}>
        <Text color="#DA7756">{'\u273B'} </Text>
        <Text dimColor>
          Thinking...{collapsed ? ' (click to expand)' : ''}
        </Text>
      </Box>
      {!collapsed && content.text.split('\n').map((line, i) => (
        <Box key={i} marginLeft={4}>
          <Text dimColor>{line}</Text>
        </Box>
      ))}
    </Box>
  )
}

function DiffBlock({ content }: { content: Extract<MessageContent, { type: 'diff' }> }): React.ReactNode {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text dimColor>{GUTTER} </Text>
        <Text bold>{content.filename}</Text>
      </Box>
      {content.diff.split('\n').map((line, i) => {
        let color: string | undefined
        if (line.startsWith('+')) color = 'green'
        else if (line.startsWith('-')) color = 'red'
        else if (line.startsWith('@')) color = 'cyan'
        return (
          <Box key={i} marginLeft={4}>
            <Text color={color} dimColor={!color}>{line}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

function CodeBlock({ content }: { content: Extract<MessageContent, { type: 'code' }> }): React.ReactNode {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text dimColor>```{content.language ?? ''}</Text>
      {content.code.split('\n').map((line, i) => (
        <Box key={i} marginLeft={2}>
          <Text>{line}</Text>
        </Box>
      ))}
      <Text dimColor>```</Text>
    </Box>
  )
}

function ErrorBlock({ content }: { content: Extract<MessageContent, { type: 'error' }> }): React.ReactNode {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color="red">{'\u2716'} Error: </Text>
        <Text color="red">{content.message}</Text>
      </Box>
      {content.details?.split('\n').map((line, i) => (
        <Box key={i} marginLeft={4}>
          <Text color="red" dimColor>{line}</Text>
        </Box>
      ))}
    </Box>
  )
}

function ContentBlock({ block }: { block: MessageContent }): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <TextBlock text={block.text} />
    case 'tool_use':
      return <ToolUseBlock content={block} />
    case 'thinking':
      return <ThinkingBlock content={block} />
    case 'diff':
      return <DiffBlock content={block} />
    case 'code':
      return <CodeBlock content={block} />
    case 'error':
      return <ErrorBlock content={block} />
    default:
      return null
  }
}

function MessageItem({
  message,
  renderMessage,
}: {
  message: Message
  renderMessage?: (message: Message) => React.ReactNode
}): React.ReactNode {
  if (renderMessage) {
    return renderMessage(message)
  }

  const config = ROLE_CONFIG[message.role]
  const isSystem = message.role === 'system'

  if (typeof message.content === 'string') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={config.color} dimColor={isSystem}>{config.icon}</Text>
          <Text color={config.color} dimColor={isSystem} bold={!isSystem}> {config.label}</Text>
        </Box>
        {message.content.split('\n').map((line, i) => (
          <Box key={i} marginLeft={2}>
            <Text dimColor={isSystem}>{line}</Text>
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={config.color} dimColor={isSystem}>{config.icon}</Text>
        <Text color={config.color} dimColor={isSystem} bold={!isSystem}> {config.label}</Text>
      </Box>
      {message.content.map((block, i) => (
        <ContentBlock key={i} block={block} />
      ))}
    </Box>
  )
}

export function MessageList({
  messages,
  streamingContent,
  renderMessage,
}: MessageListProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      {messages.map((message, i) => (
        <Box key={message.id} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
          <MessageItem message={message} renderMessage={renderMessage} />
        </Box>
      ))}

      {streamingContent != null && streamingContent.length > 0 && (
        <Box flexDirection="column" marginTop={messages.length > 0 ? 1 : 0}>
          <Box>
            <Text color="#DA7756">{'\u25CF'}</Text>
            <Text color="#DA7756" bold> Claude</Text>
          </Box>
          {streamingContent.split('\n').map((line, i) => (
            <Box key={i} marginLeft={2}>
              <Text>
                {line}
                {i === streamingContent.split('\n').length - 1 && (
                  <Text color="#DA7756">{'\u2588'}</Text>
                )}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
