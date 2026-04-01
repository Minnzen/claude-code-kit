import React from 'react'
import { Box, Text } from '@claude-code-kit/ink-renderer'

export type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
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

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={config.color} dimColor={isSystem}>
          {config.icon}
        </Text>
        <Text color={config.color} dimColor={isSystem} bold={!isSystem}>
          {' '}
          {config.label}
        </Text>
      </Box>
      {message.content.split('\n').map((line, i) => (
        <Box key={i} marginLeft={2}>
          <Text dimColor={isSystem}>{line}</Text>
        </Box>
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
            <Text color="#DA7756" bold>
              {' '}
              Claude
            </Text>
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
