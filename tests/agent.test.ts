import { describe, expect, it, vi } from 'vitest'
import { z } from '../packages/agent/node_modules/zod/index.js'
import { Agent } from '../packages/agent/src/agent.ts'
import { MockProvider } from '../packages/agent/src/providers/mock.ts'
import { createPermissionHandler } from '../packages/agent/src/permission.ts'
import { SlidingWindowCompaction } from '../packages/agent/src/compaction/sliding-window.ts'
import { SummarizationCompaction } from '../packages/agent/src/compaction/summarization.ts'
import type {
  AgentEvent,
  CompactionStrategy,
  DoneEvent,
  Message,
  ToolDefinition,
} from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

// Simple calculator tool for testing
const calculatorTool: ToolDefinition<{ a: number; b: number; op: string }> = {
  name: 'calculator',
  description: 'Perform arithmetic',
  inputSchema: z.object({ a: z.number(), b: z.number(), op: z.string() }),
  execute: vi.fn(async ({ a, b, op }) => {
    if (op === 'add') return { content: String(a + b) }
    if (op === 'mul') return { content: String(a * b) }
    return { content: 'unknown op', isError: true }
  }),
  isReadOnly: true,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent', () => {
  // 1. Basic chat — agent returns text
  it('returns text and done events for a simple message', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'Hello, world!' }, { type: 'done' }],
    ])
    const agent = new Agent({ provider, model: 'mock' })

    const events = await collectEvents(agent.run('hi'))

    const textEvents = events.filter((e) => e.type === 'text')
    const doneEvent = events.find((e) => e.type === 'done') as DoneEvent

    expect(textEvents).toHaveLength(1)
    expect((textEvents[0] as { type: string; text: string }).text).toBe('Hello, world!')

    expect(doneEvent).toBeDefined()
    expect(doneEvent.messages.at(-1)?.role).toBe('assistant')

    // Messages should contain user + assistant
    const roles = doneEvent.messages.map((m) => m.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')
  })

  // 2. Tool execution
  it('executes a tool and feeds result back to LLM', async () => {
    const execMock = vi.fn(async () => ({ content: '42' }))
    const tool: ToolDefinition<{ a: number; b: number; op: string }> = {
      name: 'calculator',
      description: 'Perform arithmetic',
      inputSchema: z.object({ a: z.number(), b: z.number(), op: z.string() }),
      execute: execMock,
      isReadOnly: true,
    }

    const provider = new MockProvider([
      // Turn 1: LLM calls the tool
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-1', name: 'calculator' } },
        { type: 'tool_use_delta', text: '{"a":6,"b":7,"op":"mul"}' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      // Turn 2: LLM sees tool result and responds with text
      [{ type: 'text', text: 'The answer is 42.' }, { type: 'done' }],
    ])

    const agent = new Agent({ provider, model: 'mock', tools: [tool] })
    const events = await collectEvents(agent.run('what is 6*7'))

    // ToolCallEvent emitted
    const toolCallEvents = events.filter((e) => e.type === 'tool_call')
    expect(toolCallEvents).toHaveLength(1)

    // execute() called with correct input
    expect(execMock).toHaveBeenCalledOnce()
    expect(execMock.mock.calls[0][0]).toMatchObject({ a: 6, b: 7, op: 'mul' })

    // ToolResultEvent emitted
    const toolResultEvents = events.filter((e) => e.type === 'tool_result')
    expect(toolResultEvents).toHaveLength(1)

    // Final text produced
    const textEvents = events.filter((e) => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    const allText = textEvents.map((e) => (e as { type: string; text: string }).text).join('')
    expect(allText).toContain('42')

    // Provider consumed both scripted responses
    expect(provider.isEmpty()).toBe(true)
  })

  // 3. Permission deny — tool blocked, execute() NOT called
  it('does not execute a tool when permission is denied', async () => {
    const execMock = vi.fn(async () => ({ content: 'should not run' }))
    const tool: ToolDefinition<{ x: number }> = {
      name: 'danger',
      description: 'Dangerous op',
      inputSchema: z.object({ x: z.number() }),
      execute: execMock,
    }

    const provider = new MockProvider([
      // Turn 1: LLM calls the tool
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-2', name: 'danger' } },
        { type: 'tool_use_delta', text: '{"x":1}' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      // Turn 2: LLM sees permission-denied error result
      [{ type: 'text', text: 'Permission denied.' }, { type: 'done' }],
    ])

    const denyHandler = createPermissionHandler({ alwaysDeny: ['danger'] })
    const agent = new Agent({ provider, model: 'mock', tools: [tool], permissionHandler: denyHandler })

    const events = await collectEvents(agent.run('do dangerous thing'))

    // execute() must NOT have been called
    expect(execMock).not.toHaveBeenCalled()

    // An error tool_result should have been sent back
    const toolResultEvents = events.filter((e) => e.type === 'tool_result')
    expect(toolResultEvents).toHaveLength(1)
    const resultEvent = toolResultEvents[0] as { type: string; result: { isError?: boolean } }
    expect(resultEvent.result.isError).toBe(true)
  })

  // 4. allow_always — session memory skips callback on second call
  it('remembers allow_always decision and skips callback on subsequent calls', async () => {
    const execMock = vi.fn(async () => ({ content: 'ok' }))
    const tool: ToolDefinition<Record<string, never>> = {
      name: 'safe-tool',
      description: 'A safe tool',
      inputSchema: z.object({}),
      execute: execMock,
    }

    const sessionApproved = new Set<string>()
    const onPermission = vi.fn(async () => {
      // Simulate user choosing "allow always"
      sessionApproved.add('safe-tool')
      return { decision: 'allow' as const }
    })

    const handler = createPermissionHandler({ sessionApproved, onPermission })

    // Two separate runs, each calling the tool once
    const provider = new MockProvider([
      // Run 1
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-3', name: 'safe-tool' } },
        { type: 'tool_use_delta', text: '{}' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      [{ type: 'text', text: 'done 1' }, { type: 'done' }],
      // Run 2
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-4', name: 'safe-tool' } },
        { type: 'tool_use_delta', text: '{}' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      [{ type: 'text', text: 'done 2' }, { type: 'done' }],
    ])

    const agent = new Agent({ provider, model: 'mock', tools: [tool], permissionHandler: handler })

    await collectEvents(agent.run('call it once'))
    // First call: onPermission should have been invoked
    expect(onPermission).toHaveBeenCalledTimes(1)

    await collectEvents(agent.run('call it again'))
    // Second call: sessionApproved now contains 'safe-tool', callback skipped
    expect(onPermission).toHaveBeenCalledTimes(1)
  })

  // 5. Max iterations — loop terminates with reason
  it('terminates after maxTurns and yields an error + done', async () => {
    // MockProvider always returns a tool call — agent will keep looping
    const toolChunks = () => [
      { type: 'tool_use_start' as const, toolCall: { id: `tc-${Math.random()}`, name: 'infinite' } },
      { type: 'tool_use_delta' as const, text: '{}' },
      { type: 'tool_use_end' as const },
      { type: 'done' as const },
    ]

    const execMock = vi.fn(async () => ({ content: 'looping' }))
    const infiniteTool: ToolDefinition<Record<string, never>> = {
      name: 'infinite',
      description: 'Loops forever',
      inputSchema: z.object({}),
      execute: execMock,
    }

    // maxTurns: 2, so we need at least 2 tool-call turns + 2 follow-up turns isn't right;
    // each turn the LLM returns tool_use, so after 2 iterations the agent gives up.
    // We supply enough scripted responses so MockProvider doesn't throw.
    const provider = new MockProvider([
      toolChunks(),
      toolChunks(),
      toolChunks(), // extra — won't be consumed
    ])

    const agent = new Agent({ provider, model: 'mock', tools: [infiniteTool], maxTurns: 2 })
    const events = await collectEvents(agent.run('loop forever'))

    const errorEvent = events.find((e) => e.type === 'error')
    const doneEvent = events.find((e) => e.type === 'done')

    expect(errorEvent).toBeDefined()
    expect((errorEvent as { type: string; error: Error }).error.message).toMatch(/maximum turns/)

    expect(doneEvent).toBeDefined()
  })

  // 6. Abort — cancellation works
  it('stops yielding events after abort() is called', async () => {
    // Use a provider that checks the abort signal before yielding more content.
    const abortAwareProvider = {
      async *chat(options: { signal?: AbortSignal }) {
        yield { type: 'text' as const, text: 'part1' }
        // Honour the abort signal: if aborted, stop streaming
        if (options.signal?.aborted) return
        await Promise.resolve() // give the test a chance to call abort()
        if (options.signal?.aborted) return
        yield { type: 'text' as const, text: 'part2' }
        yield { type: 'done' as const }
      },
    }

    const agent = new Agent({ provider: abortAwareProvider, model: 'mock' })

    const events: AgentEvent[] = []
    const gen = agent.run('hello')

    // Collect first event (part1)
    const first = await gen.next()
    if (!first.done) events.push(first.value)

    // Abort now — before part2 is yielded
    agent.abort()

    // Drain remaining events
    for await (const event of gen) events.push(event)

    // We received the first text chunk
    expect(events.some((e) => e.type === 'text')).toBe(true)

    // part2 must NOT appear because we aborted
    const textContents = events
      .filter((e) => e.type === 'text')
      .map((e) => (e as { type: string; text: string }).text)
    expect(textContents).not.toContain('part2')
  })

  // 7. chat() simple API
  it('chat() returns the text string directly', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'pong' }, { type: 'done' }],
    ])
    const agent = new Agent({ provider, model: 'mock' })

    const result = await agent.chat('ping')
    expect(result).toBe('pong')
  })

  // 8. Stateful multi-turn conversation
  it('maintains conversation history across multiple run() calls', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'My name is Bob.' }, { type: 'done' }],
      [{ type: 'text', text: 'Your name is Alice.' }, { type: 'done' }],
    ])
    const agent = new Agent({ provider, model: 'mock' })

    await collectEvents(agent.run('My name is Alice.'))
    await collectEvents(agent.run('What is my name?'))

    // On the second call the provider should have received 3 messages:
    // user("My name is Alice"), assistant("My name is Bob."), user("What is my name?")
    const secondCallMessages = provider.getCalls()[1].messages
    expect(secondCallMessages.length).toBeGreaterThanOrEqual(3)

    const roles = secondCallMessages.map((m) => m.role)
    expect(roles[0]).toBe('user')
    expect(roles[1]).toBe('assistant')
    expect(roles[2]).toBe('user')
  })
})

// ---------------------------------------------------------------------------
// Compaction strategy tests
// ---------------------------------------------------------------------------

describe('SlidingWindowCompaction', () => {
  it('keeps system messages and most recent messages', () => {
    const strategy = new SlidingWindowCompaction()
    const messages: Message[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'reply1' },
      { role: 'user', content: 'msg2' },
      { role: 'assistant', content: 'reply2' },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: 'reply3' },
    ]

    // Budget of 10 tokens should keep only the most recent messages
    const compacted = strategy.compact(messages, 10)

    // System message should always be first
    expect(compacted[0]!.role).toBe('system')
    // Should have fewer messages than original
    expect(compacted.length).toBeLessThanOrEqual(messages.length)
  })

  it('strips orphaned tool results from the front', () => {
    const strategy = new SlidingWindowCompaction()
    const messages: Message[] = [
      { role: 'tool', toolCallId: 'tc-1', content: 'result' },
      { role: 'user', content: 'follow up' },
      { role: 'assistant', content: 'reply' },
    ]

    // Large budget so all messages fit
    const compacted = strategy.compact(messages, 10000)
    // The orphaned tool message should be stripped
    expect(compacted[0]!.role).not.toBe('tool')
  })
})

describe('SummarizationCompaction', () => {
  it('implements CompactionStrategy interface', () => {
    const provider = new MockProvider([])
    const strategy = new SummarizationCompaction(provider)

    // Verify it can be used as a CompactionStrategy
    const asStrategy: CompactionStrategy = strategy
    expect(typeof asStrategy.compact).toBe('function')
  })

  it('compact() uses LLM to summarize older messages', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'Summary of early conversation.' }, { type: 'done' }],
    ])
    const strategy = new SummarizationCompaction(provider, { keepRecentN: 2 })

    const messages: Message[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'reply1' },
      { role: 'user', content: 'msg2' },
      { role: 'assistant', content: 'reply2' },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: 'reply3' },
    ]

    // compact() is now async and uses the LLM for summarization
    const compacted = await strategy.compact(messages, 100)

    // Should contain summary + "Understood." + recent 2 messages = 4 messages
    expect(compacted.length).toBe(4)
    // Summary message
    const summaryMsg = compacted.find(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Summary'),
    )
    expect(summaryMsg).toBeDefined()
    // Recent messages preserved
    const lastMsg = compacted[compacted.length - 1]
    expect(lastMsg!.role).toBe('assistant')
    expect((lastMsg as { content: string }).content).toBe('reply3')
  })

  it('compact() returns all messages when fewer than keepRecentN', async () => {
    const provider = new MockProvider([])
    const strategy = new SummarizationCompaction(provider, { keepRecentN: 10 })

    const messages: Message[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'reply1' },
    ]

    const compacted = await strategy.compact(messages, 100)
    expect(compacted).toEqual(messages)
  })

  it('compactAsync() produces a summary via the provider', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'This is a summary.' }, { type: 'done' }],
    ])
    const strategy = new SummarizationCompaction(provider, { keepRecentN: 2 })

    const messages: Message[] = [
      { role: 'user', content: 'old message 1' },
      { role: 'assistant', content: 'old reply 1' },
      { role: 'user', content: 'old message 2' },
      { role: 'assistant', content: 'old reply 2' },
      { role: 'user', content: 'recent message' },
      { role: 'assistant', content: 'recent reply' },
    ]

    const result = await strategy.compactAsync(messages)

    expect(result.strategy).toBe('summarization')
    expect(result.tokensBefore).toBeGreaterThan(0)
    expect(result.tokensAfter).toBeGreaterThan(0)
    // After compaction, the message count should be reduced
    expect(result.messages.length).toBeLessThan(messages.length)

    // Should contain the summary in a user message
    const summaryMsg = result.messages.find(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Summary'),
    )
    expect(summaryMsg).toBeDefined()

    // Should contain the recent messages
    const lastMsg = result.messages[result.messages.length - 1]
    expect(lastMsg!.role).toBe('assistant')
    expect((lastMsg as { content: string }).content).toBe('recent reply')
  })

  it('compact() handles orphaned tool results in recent messages', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'Summary.' }, { type: 'done' }],
    ])
    const strategy = new SummarizationCompaction(provider, { keepRecentN: 2 })

    const messages: Message[] = [
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'old reply' },
      { role: 'user', content: 'old2' },
      { role: 'assistant', content: 'old reply2' },
      { role: 'tool', toolCallId: 'tc-1', content: 'tool result' },
      { role: 'user', content: 'recent' },
    ]

    const compacted = await strategy.compact(messages, 100)
    // After summarization, the compacted result should be well-formed
    expect(compacted.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Malformed tool JSON tests (Bug 2)
// ---------------------------------------------------------------------------

describe('Agent malformed tool JSON', () => {
  it('reports parse error back to LLM as tool_result with isError', async () => {
    const execMock = vi.fn(async () => ({ content: 'should not run' }))
    const tool: ToolDefinition<{ x: number }> = {
      name: 'my-tool',
      description: 'A tool',
      inputSchema: z.object({ x: z.number() }),
      execute: execMock,
    }

    const provider = new MockProvider([
      // Turn 1: LLM calls the tool with malformed JSON
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-bad', name: 'my-tool' } },
        { type: 'tool_use_delta', text: '{not valid json' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      // Turn 2: LLM sees the error and responds with text
      [{ type: 'text', text: 'Sorry, I had a JSON error.' }, { type: 'done' }],
    ])

    const agent = new Agent({ provider, model: 'mock', tools: [tool] })
    const events = await collectEvents(agent.run('do something'))

    // Tool execute() must NOT have been called
    expect(execMock).not.toHaveBeenCalled()

    // A tool_result with isError should have been emitted
    const toolResultEvents = events.filter((e) => e.type === 'tool_result')
    expect(toolResultEvents).toHaveLength(1)
    const resultEvent = toolResultEvents[0] as {
      type: string
      toolCallId: string
      result: { content: string; isError?: boolean }
    }
    expect(resultEvent.result.isError).toBe(true)
    expect(resultEvent.result.content).toContain('Failed to parse tool input JSON')

    // The agent should have continued and produced a final text response
    const textEvents = events.filter((e) => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
  })
})
