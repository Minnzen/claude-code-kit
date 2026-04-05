import { describe, expect, it, vi } from 'vitest'
import { createSubagentTool } from '../packages/tools/src/subagent.ts'
import { Agent } from '../packages/agent/src/agent.ts'
import { MockProvider } from '../packages/agent/src/providers/mock.ts'
import type { ToolContext } from '../packages/agent/src/types.ts'
import type { SubagentFactoryInput } from '../packages/tools/src/subagent.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDirectory: '/tmp',
    abortSignal: new AbortController().signal,
    env: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSubagentTool', () => {
  it('returns a valid ToolDefinition', () => {
    const tool = createSubagentTool({
      agentFactory: () => ({ chat: async () => 'ok' }),
    })

    expect(tool.name).toBe('subagent')
    expect(tool.isReadOnly).toBe(false)
    expect(tool.isDestructive).toBe(false)
    expect(tool.requiresConfirmation).toBe(true)
    expect(typeof tool.execute).toBe('function')
    expect(typeof tool.description).toBe('string')
  })

  it('spawns a subagent and returns its response', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'Search result: found 3 files.' }, { type: 'done' }],
    ])

    const tool = createSubagentTool({
      agentFactory: ({ task, signal }) =>
        new Agent({
          provider,
          model: 'mock',
          systemPrompt: `Complete this task: ${task}`,
        }),
    })

    const result = await tool.execute(
      { task: 'Find all TypeScript files' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('Search result: found 3 files.')
  })

  it('passes description as additional context in the prompt', async () => {
    const chatSpy = vi.fn(async (input: string) => `Processed: ${input}`)

    const tool = createSubagentTool({
      agentFactory: () => ({ chat: chatSpy }),
    })

    await tool.execute(
      { task: 'Analyze code', description: 'Focus on error handling' },
      makeCtx(),
    )

    expect(chatSpy).toHaveBeenCalledOnce()
    const prompt = chatSpy.mock.calls[0][0]
    expect(prompt).toContain('Analyze code')
    expect(prompt).toContain('Additional context: Focus on error handling')
  })

  it('passes task, description, and signal to agentFactory', async () => {
    const factorySpy = vi.fn(({ task, description, signal }: SubagentFactoryInput) => ({
      chat: async () => 'ok',
    }))

    const tool = createSubagentTool({
      agentFactory: factorySpy,
    })

    await tool.execute(
      { task: 'my-task', description: 'my-desc' },
      makeCtx(),
    )

    expect(factorySpy).toHaveBeenCalledOnce()
    const arg = factorySpy.mock.calls[0][0]
    expect(arg.task).toBe('my-task')
    expect(arg.description).toBe('my-desc')
    expect(arg.signal).toBeInstanceOf(AbortSignal)
    expect(arg.signal.aborted).toBe(false)
  })

  it('handles empty subagent response', async () => {
    const tool = createSubagentTool({
      agentFactory: () => ({ chat: async () => '' }),
    })

    const result = await tool.execute(
      { task: 'Do something' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('empty response')
  })

  it('subagent has independent session from parent', async () => {
    const parentProvider = new MockProvider([
      [{ type: 'text', text: 'parent response' }, { type: 'done' }],
    ])
    const childProvider = new MockProvider([
      [{ type: 'text', text: 'child response' }, { type: 'done' }],
    ])

    const parentAgent = new Agent({ provider: parentProvider, model: 'mock' })
    // Pre-populate parent history
    await parentAgent.chat('parent message')

    const tool = createSubagentTool({
      agentFactory: () =>
        new Agent({ provider: childProvider, model: 'mock' }),
    })

    const result = await tool.execute(
      { task: 'child task' },
      makeCtx(),
    )

    expect(result.content).toBe('child response')

    // Verify parent history is intact and child didn't share it
    const parentMessages = parentAgent.getMessages()
    expect(parentMessages).toHaveLength(2) // user + assistant
    expect(parentMessages.some((m) => m.role === 'user' && m.content === 'parent message')).toBe(true)

    // Child provider should only have received the child task (1 call, 1 user message)
    const childCalls = childProvider.getCalls()
    expect(childCalls).toHaveLength(1)
    expect(childCalls[0].messages).toHaveLength(1)
    expect(childCalls[0].messages[0].role).toBe('user')
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('createSubagentTool error handling', () => {
  it('handles agentFactory throwing an error', async () => {
    const tool = createSubagentTool({
      agentFactory: () => {
        throw new Error('Factory exploded')
      },
    })

    const result = await tool.execute(
      { task: 'anything' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('Failed to create subagent')
    expect(result.content).toContain('Factory exploded')
  })

  it('handles subagent chat() rejecting', async () => {
    const tool = createSubagentTool({
      agentFactory: () => ({
        chat: async () => {
          throw new Error('LLM call failed')
        },
      }),
    })

    const result = await tool.execute(
      { task: 'anything' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('Subagent error')
    expect(result.content).toContain('LLM call failed')
  })

  it('returns aborted when signal is already aborted', async () => {
    const chatSpy = vi.fn(async () => 'should not run')
    const tool = createSubagentTool({
      agentFactory: () => ({ chat: chatSpy }),
    })

    const controller = new AbortController()
    controller.abort()

    const result = await tool.execute(
      { task: 'anything' },
      makeCtx({ abortSignal: controller.signal }),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Aborted before subagent started')
    expect(chatSpy).not.toHaveBeenCalled()
  })

  it('errors when agentFactory returns object without chat method', async () => {
    const tool = createSubagentTool({
      // @ts-expect-error -- intentionally returning wrong shape for runtime test
      agentFactory: () => ({ notChat: async () => 'oops' }),
    })

    const result = await tool.execute(
      { task: 'anything' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('Subagent error')
  })
})

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('createSubagentTool timeout', () => {
  it('times out when subagent takes too long', async () => {
    const tool = createSubagentTool({
      agentFactory: () => ({
        chat: () => new Promise(() => {
          // Never resolves
        }),
      }),
      timeout: 50, // 50ms timeout for fast test
    })

    const result = await tool.execute(
      { task: 'slow task' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Subagent timed out')
  })

  it('uses default timeout of 120s when not specified', () => {
    const tool = createSubagentTool({
      agentFactory: () => ({ chat: async () => 'ok' }),
    })

    expect(tool.timeout).toBe(120_000)
  })

  it('uses custom timeout when specified', () => {
    const tool = createSubagentTool({
      agentFactory: () => ({ chat: async () => 'ok' }),
      timeout: 60_000,
    })

    expect(tool.timeout).toBe(60_000)
  })

  it('times out immediately when timeout is 0', async () => {
    const tool = createSubagentTool({
      agentFactory: () => ({
        chat: () => new Promise((resolve) => {
          setTimeout(() => resolve('too late'), 1000)
        }),
      }),
      timeout: 0,
    })

    const result = await tool.execute(
      { task: 'anything' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Subagent timed out')
  })

  it('times out immediately when timeout is negative', async () => {
    const tool = createSubagentTool({
      agentFactory: () => ({
        chat: () => new Promise((resolve) => {
          setTimeout(() => resolve('too late'), 1000)
        }),
      }),
      timeout: -100,
    })

    const result = await tool.execute(
      { task: 'anything' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Subagent timed out')
  })
})

// ---------------------------------------------------------------------------
// Abort signal
// ---------------------------------------------------------------------------

describe('createSubagentTool abort', () => {
  it('aborts a running subagent when signal fires', async () => {
    const controller = new AbortController()

    const tool = createSubagentTool({
      agentFactory: () => ({
        chat: () =>
          new Promise((resolve) => {
            // Resolves after a long time (simulating slow work)
            setTimeout(() => resolve('too late'), 10_000)
          }),
      }),
      timeout: 10_000,
    })

    // Start subagent and abort after 50ms
    const resultPromise = tool.execute(
      { task: 'long task' },
      makeCtx({ abortSignal: controller.signal }),
    )

    setTimeout(() => controller.abort(), 50)

    const result = await resultPromise

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Subagent aborted')
  })

  it('aborts child signal when parent signal fires', async () => {
    const parentController = new AbortController()
    let receivedSignal: AbortSignal | undefined

    const tool = createSubagentTool({
      agentFactory: ({ signal }) => {
        receivedSignal = signal
        return {
          chat: () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('too late'), 10_000)
            }),
        }
      },
      timeout: 10_000,
    })

    const resultPromise = tool.execute(
      { task: 'long task' },
      makeCtx({ abortSignal: parentController.signal }),
    )

    // Give execute a tick to invoke agentFactory
    await new Promise((r) => setTimeout(r, 10))
    expect(receivedSignal).toBeDefined()
    expect(receivedSignal!.aborted).toBe(false)

    parentController.abort()

    const result = await resultPromise

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Subagent aborted')
    // The child signal should have been aborted after the race settled
    expect(receivedSignal!.aborted).toBe(true)
  })

  it('aborts child signal on timeout', async () => {
    let receivedSignal: AbortSignal | undefined

    const tool = createSubagentTool({
      agentFactory: ({ signal }) => {
        receivedSignal = signal
        return {
          chat: () => new Promise(() => {
            // Never resolves
          }),
        }
      },
      timeout: 50,
    })

    const result = await tool.execute(
      { task: 'slow task' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Subagent timed out')
    expect(receivedSignal).toBeDefined()
    expect(receivedSignal!.aborted).toBe(true)
  })
})
