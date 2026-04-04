import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Agent } from '../packages/agent/src/agent.ts'
import { MockProvider } from '../packages/agent/src/providers/mock.ts'
import { ToolRegistry } from '../packages/agent/src/tool-registry.ts'
import { executeToolCalls } from '../packages/agent/src/parallel-tools.ts'
import type {
  AgentEvent,
  ToolDefinition,
  ToolResultEvent,
} from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

/** Shared execution log entry used to verify concurrency via timestamp overlap. */
interface ExecLogEntry {
  toolName: string
  start: number
  end: number
}

/** Creates a tool that records the time it started and finished. */
function createTimedTool(
  name: string,
  opts: { isReadOnly?: boolean; isDestructive?: boolean; delayMs?: number; result?: string; shouldFail?: boolean },
  sharedLog?: ExecLogEntry[],
) {
  const log: { start: number; end: number }[] = []
  const execute = vi.fn(async () => {
    const start = Date.now()
    if (opts.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs))
    }
    const end = Date.now()
    log.push({ start, end })
    sharedLog?.push({ toolName: name, start, end })
    if (opts.shouldFail) {
      throw new Error(`${name} failed intentionally`)
    }
    return { content: opts.result ?? `${name}-result` }
  })

  const tool: ToolDefinition<Record<string, never>> & { log: typeof log } = {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({}),
    execute,
    isReadOnly: opts.isReadOnly,
    isDestructive: opts.isDestructive,
    log,
  }

  return tool
}

const allowAllHandler = async () => ({ decision: 'allow' as const })

/** Check whether two time ranges overlap. */
function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

// ---------------------------------------------------------------------------
// Unit tests for executeToolCalls
// ---------------------------------------------------------------------------

describe('executeToolCalls', () => {
  it('executes readOnly tools in parallel (verified by timestamp overlap)', async () => {
    const sharedLog: ExecLogEntry[] = []
    const toolA = createTimedTool('read-a', { isReadOnly: true, delayMs: 50 }, sharedLog)
    const toolB = createTimedTool('read-b', { isReadOnly: true, delayMs: 50 }, sharedLog)
    const toolC = createTimedTool('read-c', { isReadOnly: true, delayMs: 50 }, sharedLog)

    const registry = new ToolRegistry()
    registry.register(toolA)
    registry.register(toolB)
    registry.register(toolC)

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-1', name: 'read-a', input: {} },
        { id: 'tc-2', name: 'read-b', input: {} },
        { id: 'tc-3', name: 'read-c', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    expect(results).toHaveLength(3)
    expect(results[0]!.content).toBe('read-a-result')
    expect(results[1]!.content).toBe('read-b-result')
    expect(results[2]!.content).toBe('read-c-result')

    // Parallel tools should have overlapping execution windows
    const logA = sharedLog.find((e) => e.toolName === 'read-a')!
    const logB = sharedLog.find((e) => e.toolName === 'read-b')!
    const logC = sharedLog.find((e) => e.toolName === 'read-c')!
    expect(rangesOverlap(logA, logB)).toBe(true)
    expect(rangesOverlap(logB, logC)).toBe(true)
  })

  it('executes destructive tools sequentially (verified by non-overlapping timestamps)', async () => {
    const toolA = createTimedTool('write-a', { isReadOnly: false, delayMs: 30 })
    const toolB = createTimedTool('write-b', { isReadOnly: false, delayMs: 30 })
    const toolC = createTimedTool('write-c', { isReadOnly: false, delayMs: 30 })

    const registry = new ToolRegistry()
    registry.register(toolA)
    registry.register(toolB)
    registry.register(toolC)

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-1', name: 'write-a', input: {} },
        { id: 'tc-2', name: 'write-b', input: {} },
        { id: 'tc-3', name: 'write-c', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    expect(results).toHaveLength(3)

    // Each destructive tool must not overlap with others.
    expect(toolA.log[0]!.end).toBeLessThanOrEqual(toolB.log[0]!.start)
    expect(toolB.log[0]!.end).toBeLessThanOrEqual(toolC.log[0]!.start)
  })

  it('handles mixed readOnly and destructive: parallel batch then sequential', async () => {
    const readA = createTimedTool('read-a', { isReadOnly: true, delayMs: 30 })
    const readB = createTimedTool('read-b', { isReadOnly: true, delayMs: 30 })
    const writeC = createTimedTool('write-c', { isReadOnly: false, delayMs: 30 })
    const readD = createTimedTool('read-d', { isReadOnly: true, delayMs: 30 })

    const registry = new ToolRegistry()
    registry.register(readA)
    registry.register(readB)
    registry.register(writeC)
    registry.register(readD)

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-1', name: 'read-a', input: {} },
        { id: 'tc-2', name: 'read-b', input: {} },
        { id: 'tc-3', name: 'write-c', input: {} },
        { id: 'tc-4', name: 'read-d', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    // Results must be in original tool_calls order
    expect(results[0]!.toolCallId).toBe('tc-1')
    expect(results[1]!.toolCallId).toBe('tc-2')
    expect(results[2]!.toolCallId).toBe('tc-3')
    expect(results[3]!.toolCallId).toBe('tc-4')

    // read-a and read-b should run in parallel (their time ranges overlap)
    expect(rangesOverlap(readA.log[0]!, readB.log[0]!)).toBe(true)

    // write-c must start after the parallel batch finishes
    const parallelEnd = Math.max(readA.log[0]!.end, readB.log[0]!.end)
    expect(writeC.log[0]!.start).toBeGreaterThanOrEqual(parallelEnd)

    // read-d runs after write-c (it's in its own parallel batch)
    expect(readD.log[0]!.start).toBeGreaterThanOrEqual(writeC.log[0]!.end)
  })

  it('respects maxConcurrent limit (verified by batch non-overlap)', async () => {
    // Create 4 readOnly tools, but limit concurrency to 2
    const sharedLog: ExecLogEntry[] = []
    const tools = Array.from({ length: 4 }, (_, i) =>
      createTimedTool(`read-${i}`, { isReadOnly: true, delayMs: 40 }, sharedLog),
    )

    const registry = new ToolRegistry()
    for (const t of tools) registry.register(t)

    await executeToolCalls({
      toolCalls: tools.map((t, i) => ({ id: `tc-${i}`, name: t.name, input: {} })),
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
      maxConcurrent: 2,
    })

    // With maxConcurrent=2, tools 0+1 form batch 1, tools 2+3 form batch 2.
    // Within each batch, tools should overlap; between batches, they should not.
    const log0 = sharedLog.find((e) => e.toolName === 'read-0')!
    const log1 = sharedLog.find((e) => e.toolName === 'read-1')!
    const log2 = sharedLog.find((e) => e.toolName === 'read-2')!
    const log3 = sharedLog.find((e) => e.toolName === 'read-3')!

    // Batch 1 tools overlap
    expect(rangesOverlap(log0, log1)).toBe(true)
    // Batch 2 tools overlap
    expect(rangesOverlap(log2, log3)).toBe(true)

    // Batch 2 starts after batch 1 ends
    const batch1End = Math.max(log0.end, log1.end)
    const batch2Start = Math.min(log2.start, log3.start)
    expect(batch2Start).toBeGreaterThanOrEqual(batch1End)
  })

  it('one tool failure does not affect others', async () => {
    const toolOk = createTimedTool('ok-tool', { isReadOnly: true, result: 'success' })
    const toolFail = createTimedTool('fail-tool', { isReadOnly: true, shouldFail: true })
    const toolOk2 = createTimedTool('ok-tool-2', { isReadOnly: true, result: 'also-success' })

    const registry = new ToolRegistry()
    registry.register(toolOk)
    registry.register(toolFail)
    registry.register(toolOk2)

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-1', name: 'ok-tool', input: {} },
        { id: 'tc-2', name: 'fail-tool', input: {} },
        { id: 'tc-3', name: 'ok-tool-2', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    expect(results).toHaveLength(3)
    expect(results[0]!.content).toBe('success')
    expect(results[0]!.isError).toBeUndefined()
    expect(results[1]!.isError).toBe(true)
    expect(results[1]!.content).toContain('fail-tool failed')
    expect(results[2]!.content).toBe('also-success')
    expect(results[2]!.isError).toBeUndefined()
  })

  it('handles parse errors without executing the tool', async () => {
    const tool = createTimedTool('my-tool', { isReadOnly: true })

    const registry = new ToolRegistry()
    registry.register(tool)

    const parseErrors = new Map([['tc-1', 'Invalid JSON: unexpected token']])

    const results = await executeToolCalls({
      toolCalls: [{ id: 'tc-1', name: 'my-tool', input: {} }],
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
      parseErrors,
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.isError).toBe(true)
    expect(results[0]!.content).toContain('Invalid JSON')
    // Execute should not have been called
    expect(tool.log).toHaveLength(0)
  })

  it('preserves result order matching tool_calls order', async () => {
    // Stagger delays so execution finishes out of order
    const toolFast = createTimedTool('fast', { isReadOnly: true, delayMs: 10, result: 'fast-done' })
    const toolSlow = createTimedTool('slow', { isReadOnly: true, delayMs: 60, result: 'slow-done' })

    const registry = new ToolRegistry()
    registry.register(toolSlow)
    registry.register(toolFast)

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-slow', name: 'slow', input: {} },
        { id: 'tc-fast', name: 'fast', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: allowAllHandler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    // Results should be in the same order as tool_calls, not execution completion order
    expect(results[0]!.toolCallId).toBe('tc-slow')
    expect(results[0]!.content).toBe('slow-done')
    expect(results[1]!.toolCallId).toBe('tc-fast')
    expect(results[1]!.content).toBe('fast-done')
  })

  it('handles permission denied for some tools in parallel batch', async () => {
    const toolA = createTimedTool('allowed', { isReadOnly: true })
    const toolB = createTimedTool('denied', { isReadOnly: true })

    const registry = new ToolRegistry()
    registry.register(toolA)
    registry.register(toolB)

    const handler = async (req: { tool: string }) => {
      if (req.tool === 'denied') return { decision: 'deny' as const, reason: 'not allowed' }
      return { decision: 'allow' as const }
    }

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-1', name: 'allowed', input: {} },
        { id: 'tc-2', name: 'denied', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: handler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    expect(results[0]!.content).toBe('allowed-result')
    expect(results[0]!.isError).toBeUndefined()
    expect(results[1]!.isError).toBe(true)
    expect(results[1]!.content).toContain('Permission denied')
  })

  it('catches permissionHandler exceptions without losing other results', async () => {
    const toolA = createTimedTool('safe-tool', { isReadOnly: true, result: 'ok' })
    const toolB = createTimedTool('crash-tool', { isReadOnly: true })

    const registry = new ToolRegistry()
    registry.register(toolA)
    registry.register(toolB)

    const handler = async (req: { tool: string }) => {
      if (req.tool === 'crash-tool') throw new Error('handler exploded')
      return { decision: 'allow' as const }
    }

    const results = await executeToolCalls({
      toolCalls: [
        { id: 'tc-1', name: 'safe-tool', input: {} },
        { id: 'tc-2', name: 'crash-tool', input: {} },
      ],
      toolRegistry: registry,
      permissionHandler: handler,
      context: { workingDirectory: '/tmp', abortSignal: AbortSignal.timeout(5000) },
    })

    expect(results).toHaveLength(2)
    expect(results[0]!.content).toBe('ok')
    expect(results[0]!.isError).toBeUndefined()
    expect(results[1]!.isError).toBe(true)
    expect(results[1]!.content).toContain('Permission error: handler exploded')
  })
})

// ---------------------------------------------------------------------------
// Integration tests via Agent
// ---------------------------------------------------------------------------

describe('Agent parallel tool execution', () => {
  it('runs multiple readOnly tools in parallel through the agent loop', async () => {
    const sharedLog: ExecLogEntry[] = []
    const toolA = createTimedTool('read-a', { isReadOnly: true, delayMs: 40 }, sharedLog)
    const toolB = createTimedTool('read-b', { isReadOnly: true, delayMs: 40 }, sharedLog)
    const toolC = createTimedTool('read-c', { isReadOnly: true, delayMs: 40 }, sharedLog)

    const provider = new MockProvider([
      // Turn 1: LLM calls all three tools
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-1', name: 'read-a' } },
        { type: 'tool_use_delta', text: '{}' },
        { type: 'tool_use_end' },
        { type: 'tool_use_start', toolCall: { id: 'tc-2', name: 'read-b' } },
        { type: 'tool_use_delta', text: '{}' },
        { type: 'tool_use_end' },
        { type: 'tool_use_start', toolCall: { id: 'tc-3', name: 'read-c' } },
        { type: 'tool_use_delta', text: '{}' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      // Turn 2: LLM responds with text
      [{ type: 'text', text: 'All three files read.' }, { type: 'done' }],
    ])

    const agent = new Agent({
      provider,
      model: 'mock',
      tools: [toolA, toolB, toolC],
      permissionHandler: allowAllHandler,
    })

    const events = await collectEvents(agent.run('read all files'))

    // All three tool results should be emitted
    const toolResults = events.filter((e) => e.type === 'tool_result') as ToolResultEvent[]
    expect(toolResults).toHaveLength(3)

    // Results in original order
    expect(toolResults[0]!.toolCallId).toBe('tc-1')
    expect(toolResults[1]!.toolCallId).toBe('tc-2')
    expect(toolResults[2]!.toolCallId).toBe('tc-3')

    // Parallel execution verified by timestamp overlap
    const logA = sharedLog.find((e) => e.toolName === 'read-a')!
    const logB = sharedLog.find((e) => e.toolName === 'read-b')!
    const logC = sharedLog.find((e) => e.toolName === 'read-c')!
    expect(rangesOverlap(logA, logB)).toBe(true)
    expect(rangesOverlap(logB, logC)).toBe(true)

    // Final text response
    const textEvents = events.filter((e) => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
  })

  it('respects maxConcurrentTools config on Agent', async () => {
    const sharedLog: ExecLogEntry[] = []
    const tools = Array.from({ length: 4 }, (_, i) =>
      createTimedTool(`read-${i}`, { isReadOnly: true, delayMs: 30 }, sharedLog),
    )

    const toolCallChunks = tools.flatMap((t, i) => [
      { type: 'tool_use_start' as const, toolCall: { id: `tc-${i}`, name: t.name } },
      { type: 'tool_use_delta' as const, text: '{}' },
      { type: 'tool_use_end' as const },
    ])

    const provider = new MockProvider([
      [...toolCallChunks, { type: 'done' }],
      [{ type: 'text', text: 'Done.' }, { type: 'done' }],
    ])

    const agent = new Agent({
      provider,
      model: 'mock',
      tools,
      permissionHandler: allowAllHandler,
      maxConcurrentTools: 2,
    })

    await collectEvents(agent.run('read them'))

    // With maxConcurrent=2, tools 0+1 form batch 1, tools 2+3 form batch 2.
    const log0 = sharedLog.find((e) => e.toolName === 'read-0')!
    const log1 = sharedLog.find((e) => e.toolName === 'read-1')!
    const log2 = sharedLog.find((e) => e.toolName === 'read-2')!
    const log3 = sharedLog.find((e) => e.toolName === 'read-3')!

    // Batch 1 tools overlap
    expect(rangesOverlap(log0, log1)).toBe(true)
    // Batch 2 starts after batch 1 ends
    const batch1End = Math.max(log0.end, log1.end)
    const batch2Start = Math.min(log2.start, log3.start)
    expect(batch2Start).toBeGreaterThanOrEqual(batch1End)
  })

  it('existing tests still pass: single tool execution works', async () => {
    const execMock = vi.fn(async () => ({ content: '42' }))
    const tool: ToolDefinition<{ a: number; b: number; op: string }> = {
      name: 'calculator',
      description: 'Perform arithmetic',
      inputSchema: z.object({ a: z.number(), b: z.number(), op: z.string() }),
      execute: execMock,
      isReadOnly: true,
    }

    const provider = new MockProvider([
      [
        { type: 'tool_use_start', toolCall: { id: 'tc-1', name: 'calculator' } },
        { type: 'tool_use_delta', text: '{"a":6,"b":7,"op":"mul"}' },
        { type: 'tool_use_end' },
        { type: 'done' },
      ],
      [{ type: 'text', text: 'The answer is 42.' }, { type: 'done' }],
    ])

    const agent = new Agent({ provider, model: 'mock', tools: [tool] })
    const events = await collectEvents(agent.run('what is 6*7'))

    expect(execMock).toHaveBeenCalledOnce()
    const toolResults = events.filter((e) => e.type === 'tool_result')
    expect(toolResults).toHaveLength(1)
  })
})
