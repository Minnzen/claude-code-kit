import React from 'react'
import { render } from '@claude-code-kit/ink-renderer'
import { AgentREPL, WelcomeScreen } from '@claude-code-kit/ui'
import { Agent, MockProvider } from '@claude-code-kit/agent'
import type { StreamChunk, ToolDefinition } from '@claude-code-kit/agent'
import { z } from 'zod'

// 1. Define a custom tool
const getTimeTool: ToolDefinition = {
  name: 'get_time',
  description: 'Get the current date and time',
  inputSchema: z.object({}),
  async execute() {
    return { content: new Date().toISOString() }
  },
}

// 2. Create mock provider with scripted responses
const responses: StreamChunk[][] = [
  // Turn 1: simple greeting
  [
    { type: 'text', text: 'Hello! I can help you with various tasks. Try asking me "what time is it?"' },
    { type: 'done' },
  ],
  // Turn 2: model decides to call get_time tool
  [
    { type: 'tool_use_start', toolCall: { id: 'tc_1', name: 'get_time' } },
    { type: 'tool_use_delta', text: '{}' },
    { type: 'tool_use_end' },
    { type: 'done' },
  ],
  // Turn 3: model responds after receiving tool result
  [
    { type: 'text', text: 'The current time is **' },
    { type: 'text', text: new Date().toISOString() },
    { type: 'text', text: '**. Is there anything else I can help with?' },
    { type: 'done' },
  ],
  // Turn 4: fallback reply
  [
    { type: 'text', text: 'Thanks for trying the agent-cli example! The mock responses have been exhausted.' },
    { type: 'done' },
  ],
]

const provider = new MockProvider(responses)

// 3. Create the agent
const agent = new Agent({
  provider,
  model: 'mock-model',
  tools: [getTimeTool],
  systemPrompt: 'You are a helpful assistant. Use tools when appropriate.',
})

// 4. Render the REPL
function App() {
  return (
    <AgentREPL
      agent={agent}
      model="mock-provider"
      welcome={
        <WelcomeScreen
          appName="agent-cli-example"
          subtitle="Minimal agent CLI built with claude-code-kit"
          tips={[
            'Type a message to chat',
            'Ask "what time is it?" to see tool use',
            '/clear to reset, Ctrl+C to quit',
          ]}
        />
      }
      placeholder="Type a message..."
    />
  )
}

await render(<App />)
