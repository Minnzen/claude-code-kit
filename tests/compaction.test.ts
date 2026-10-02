import { describe, expect, it } from 'vitest'
import { LayeredCompaction } from '../packages/agent/src/compaction/layered.ts'
import {
  DEFAULT_COMPACTABLE_TOOLS,
  MicroCompaction,
  TOOL_RESULT_CLEARED_MESSAGE,
} from '../packages/agent/src/compaction/micro-compact.ts'
import { SlidingWindowCompaction } from '../packages/agent/src/compaction/sliding-window.ts'
import { SummarizationCompaction } from '../packages/agent/src/compaction/summarization.ts'
import { MockProvider } from '../packages/agent/src/providers/mock.ts'
import { ContextManager } from '../packages/agent/src/context-manager.ts'
import type { CompactionStrategy, Message } from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userMsg(text: string): Message {
  return { role: 'user', content: text }
}

function assistantWithToolCall(text: string, toolId: string, toolName: string): Message {
  return {
    role: 'assistant',
    content: text,
    toolCalls: [{ id: toolId, name: toolName, input: {} }],
  }
}

function toolMsg(id: string, content: string): Message {
  return { role: 'tool', toolCallId: id, content }
}

// ---------------------------------------------------------------------------
// MicroCompaction (aligned with Claude Code's microCompact.ts)
// ---------------------------------------------------------------------------

describe('MicroCompaction', () => {
  it('returns empty array unchanged', () => {
    const strategy = new MicroCompaction()
    expect(strategy.compact([], 1000)).toEqual([])
  })

  it('returns system-only messages unchanged', () => {
    const strategy = new MicroCompaction()
    const messages: Message[] = [{ role: 'system', content: 'system prompt' }]
    expect(strategy.compact(messages, 1000)).toEqual(messages)
  })

  it('keeps assistant toolCalls intact (decision trail preserved)', () => {
    // keepRecentN=1 (floored, since constructor uses Math.max(1, n)) means
    // we still need at least 2 compactable results for any clearing to occur.
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      assistantWithToolCall('call 1', 'tc-1', 'Read'),
      toolMsg('tc-1', 'OLD output'),
      assistantWithToolCall('call 2', 'tc-2', 'Read'),
      toolMsg('tc-2', 'recent output'),
    ]
    const compacted = strategy.compact(messages, 0)
    const a1 = compacted[0] as { toolCalls?: { id: string }[] }
    const a2 = compacted[2] as { toolCalls?: { id: string }[] }
    expect(a1.toolCalls?.[0]?.id).toBe('tc-1')
    expect(a2.toolCalls?.[0]?.id).toBe('tc-2')
  })

  it('clears old tool result content but preserves toolCallId', () => {
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      assistantWithToolCall('a', 'tc-old', 'Read'),
      toolMsg('tc-old', 'OLD output to be cleared'),
      assistantWithToolCall('b', 'tc-recent', 'Read'),
      toolMsg('tc-recent', 'recent output kept verbatim'),
    ]
    const compacted = strategy.compact(messages, 0)

    const cleared = compacted[1] as { toolCallId: string; content: string }
    expect(cleared.toolCallId).toBe('tc-old')
    expect(cleared.content).toBe(TOOL_RESULT_CLEARED_MESSAGE)

    const recent = compacted[3] as { content: string }
    expect(recent.content).toBe('recent output kept verbatim')
  })

  it('keeps the last keepRecentN compactable tool results untouched', () => {
    const strategy = new MicroCompaction({ keepRecentN: 2 })
    const messages: Message[] = []
    for (let i = 0; i < 5; i++) {
      messages.push(assistantWithToolCall(`a${i}`, `tc-${i}`, 'Bash'))
      messages.push(toolMsg(`tc-${i}`, `output ${i}`))
    }
    const compacted = strategy.compact(messages, 0)
    // Last 2 untouched.
    expect((compacted[7] as { content: string }).content).toBe('output 3')
    expect((compacted[9] as { content: string }).content).toBe('output 4')
    // First 3 cleared.
    expect((compacted[1] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    expect((compacted[3] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    expect((compacted[5] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
  })

  it('honors the default whitelist: leaves results from unlisted tools alone', () => {
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-bash-1', 'Bash'), // in whitelist
      toolMsg('tc-bash-1', 'old bash output'),
      assistantWithToolCall('a2', 'tc-custom', 'MyCustomTool'), // NOT in whitelist
      toolMsg('tc-custom', 'old custom output'),
      assistantWithToolCall('a3', 'tc-bash-2', 'Bash'),
      toolMsg('tc-bash-2', 'recent bash output'),
    ]
    const compacted = strategy.compact(messages, 0)
    // Bash old result cleared, custom result untouched.
    expect((compacted[1] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    expect((compacted[3] as { content: string }).content).toBe('old custom output')
    expect((compacted[5] as { content: string }).content).toBe('recent bash output')
  })

  it('compactableTools="all" clears every tool regardless of name', () => {
    const strategy = new MicroCompaction({ keepRecentN: 1, compactableTools: 'all' })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-x', 'WeirdTool'),
      toolMsg('tc-x', 'old weird output'),
      assistantWithToolCall('a2', 'tc-y', 'OtherTool'),
      toolMsg('tc-y', 'recent weird output'),
    ]
    const compacted = strategy.compact(messages, 0)
    expect((compacted[1] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    expect((compacted[3] as { content: string }).content).toBe('recent weird output')
  })

  it('explicit compactableTools narrows the whitelist', () => {
    const strategy = new MicroCompaction({
      keepRecentN: 1,
      compactableTools: ['Bash'], // only Bash, not Read
    })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-r-1', 'Read'),
      toolMsg('tc-r-1', 'old read'),
      assistantWithToolCall('a2', 'tc-b-1', 'Bash'),
      toolMsg('tc-b-1', 'old bash'),
      assistantWithToolCall('a3', 'tc-b-2', 'Bash'),
      toolMsg('tc-b-2', 'recent bash'),
    ]
    const compacted = strategy.compact(messages, 0)
    // Read is NOT in this whitelist so it stays even though it's old.
    expect((compacted[1] as { content: string }).content).toBe('old read')
    // Bash old → cleared, Bash recent → kept.
    expect((compacted[3] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    expect((compacted[5] as { content: string }).content).toBe('recent bash')
  })

  it('floors keepRecentN at 1 (never clears every compactable result)', () => {
    // Constructor must protect against keepRecentN=0 — otherwise the model
    // is left with no working context. Mirrors Claude Code's
    // `Math.max(1, config.keepRecent)` defense.
    const strategy = new MicroCompaction({ keepRecentN: 0 })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-1', 'Bash'),
      toolMsg('tc-1', 'must survive'),
    ]
    const compacted = strategy.compact(messages, 0)
    // Only 1 compactable result, keepRecentN floored to 1 → nothing to clear.
    expect((compacted[1] as { content: string }).content).toBe('must survive')
  })

  it('is idempotent: clearing already-cleared messages is a no-op', () => {
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-1', 'Bash'),
      { role: 'tool', toolCallId: 'tc-1', content: TOOL_RESULT_CLEARED_MESSAGE },
      assistantWithToolCall('a2', 'tc-2', 'Bash'),
      toolMsg('tc-2', 'recent'),
    ]
    const compacted = strategy.compact(messages, 0)
    // Same reference returned for the already-cleared message.
    expect(compacted[1]).toBe(messages[1])
  })

  it('default keepRecentN aligns with Claude Code (5)', () => {
    // Build 6 compactable Bash results; only the oldest (index 0) should clear.
    const strategy = new MicroCompaction()
    const messages: Message[] = []
    for (let i = 0; i < 6; i++) {
      messages.push(assistantWithToolCall(`a${i}`, `tc-${i}`, 'Bash'))
      messages.push(toolMsg(`tc-${i}`, `output ${i}`))
    }
    const compacted = strategy.compact(messages, 0)
    expect((compacted[1] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    // The 5 most-recent results must all be intact.
    for (let i = 1; i < 6; i++) {
      expect((compacted[i * 2 + 1] as { content: string }).content).toBe(`output ${i}`)
    }
  })

  it('shouldCompact triggers at the configured threshold fraction', () => {
    const strategy = new MicroCompaction({ thresholdFraction: 0.5 })
    expect(strategy.shouldCompact([], 49, 100)).toBe(false)
    expect(strategy.shouldCompact([], 50, 100)).toBe(true)
  })

  it('compactWithStats reports before/after token counts', () => {
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-1', 'Read'),
      toolMsg('tc-1', 'a'.repeat(400)), // ~100 tokens
      assistantWithToolCall('a2', 'tc-2', 'Read'),
      toolMsg('tc-2', 'recent'),
    ]
    const result = strategy.compactWithStats(messages)
    expect(result.strategy).toBe('micro-compact')
    expect(result.tokensBefore).toBeGreaterThan(result.tokensAfter)
  })

  it('exports the same default whitelist that Claude Code uses', () => {
    // Sanity check — these 9 names match Claude Code's COMPACTABLE_TOOLS set
    // (FILE_READ_TOOL_NAME + ...SHELL_TOOL_NAMES + GREP/GLOB/WEB_SEARCH/
    // WEB_FETCH/FILE_EDIT/FILE_WRITE), with SHELL_TOOL_NAMES expanding to
    // [Bash, PowerShell].
    expect(DEFAULT_COMPACTABLE_TOOLS).toEqual([
      'Read',
      'Bash',
      'PowerShell',
      'Grep',
      'Glob',
      'WebSearch',
      'WebFetch',
      'Edit',
      'Write',
    ])
  })

  it('placeholder string matches Claude Code verbatim', () => {
    expect(TOOL_RESULT_CLEARED_MESSAGE).toBe('[Old tool result content cleared]')
  })

  it('handles assistant with multiple toolCalls where only some have results', () => {
    // Real provider behavior: assistant emits N tool calls in one turn but
    // the agent loop may abort or skip some. Lookup must still work for
    // those that DO have results.
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      {
        role: 'assistant',
        content: 'fanning out',
        toolCalls: [
          { id: 'tc-1', name: 'Bash', input: {} },
          { id: 'tc-2', name: 'Bash', input: {} },
          { id: 'tc-3', name: 'Bash', input: {} },
        ],
      },
      toolMsg('tc-1', 'old result 1'),
      toolMsg('tc-3', 'recent result 3'),
      // tc-2 never produced a tool message (e.g. aborted) — should not crash
    ]
    const compacted = strategy.compact(messages, 0)
    // tc-1 (older) cleared, tc-3 (most recent) kept.
    expect((compacted[1] as { content: string }).content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
    expect((compacted[2] as { content: string }).content).toBe('recent result 3')
  })

  it('leaves orphan tool result alone when whitelist is active', () => {
    // Whitelist filters by name, but orphan results have no resolvable name.
    // Default behavior: skip them (do not clear). Matches Claude Code.
    const strategy = new MicroCompaction({ keepRecentN: 0, compactableTools: ['Bash'] })
    const messages: Message[] = [
      // No assistant precursor — orphan tool result.
      toolMsg('tc-orphan', 'mysterious old output'),
      assistantWithToolCall('a1', 'tc-1', 'Bash'),
      toolMsg('tc-1', 'recent bash output'),
    ]
    const compacted = strategy.compact(messages, 0)
    // Orphan stays untouched.
    expect((compacted[0] as { content: string }).content).toBe('mysterious old output')
  })

  it('returns input unchanged when keepRecentN equals compactable count', () => {
    // Boundary: nothing should clear if we have exactly keepRecentN results.
    const strategy = new MicroCompaction({ keepRecentN: 3 })
    const messages: Message[] = []
    for (let i = 0; i < 3; i++) {
      messages.push(assistantWithToolCall(`a${i}`, `tc-${i}`, 'Bash'))
      messages.push(toolMsg(`tc-${i}`, `output ${i}`))
    }
    const compacted = strategy.compact(messages, 0)
    // Same reference returned (early-return path).
    expect(compacted).toBe(messages)
  })

  it('preserves tool result content of type ContentPart[] (does not crash)', () => {
    const strategy = new MicroCompaction({ keepRecentN: 1 })
    const messages: Message[] = [
      assistantWithToolCall('a1', 'tc-old', 'Read'),
      {
        role: 'tool',
        toolCallId: 'tc-old',
        content: [{ type: 'text', text: 'old structured content' }],
      },
      assistantWithToolCall('a2', 'tc-recent', 'Read'),
      toolMsg('tc-recent', 'recent'),
    ]
    const compacted = strategy.compact(messages, 0)
    // Old structured content should be cleared (we replace whole content
    // field with the placeholder string).
    const cleared = compacted[1] as { content: unknown }
    expect(cleared.content).toBe(TOOL_RESULT_CLEARED_MESSAGE)
  })
})

// ---------------------------------------------------------------------------
// LayeredCompaction
// ---------------------------------------------------------------------------

describe('LayeredCompaction', () => {
  it('returns empty input unchanged', async () => {
    const layered = new LayeredCompaction([new MicroCompaction()])
    expect(await layered.compact([], 100)).toEqual([])
  })

  it('returns input unchanged when already under budget', async () => {
    const layered = new LayeredCompaction([
      // A layer that would mutate everything if it ran.
      {
        compact: () => [],
      } satisfies CompactionStrategy,
    ])
    const messages: Message[] = [{ role: 'user', content: 'short' }]
    const compacted = await layered.compact(messages, 1_000_000)
    expect(compacted).toEqual(messages)
  })

  it('short-circuits once a layer brings tokens under budget', async () => {
    let layer1Calls = 0
    let layer2Calls = 0
    const layered = new LayeredCompaction([
      {
        compact: () => {
          layer1Calls++
          // Pretend layer 1 fixes everything by returning a tiny array.
          return [{ role: 'user', content: 'ok' }]
        },
      } satisfies CompactionStrategy,
      {
        compact: (msgs) => {
          layer2Calls++
          return msgs
        },
      } satisfies CompactionStrategy,
    ])

    const big: Message[] = Array.from({ length: 50 }, () => ({
      role: 'user' as const,
      content: 'x'.repeat(400), // ~100 tokens each
    }))

    await layered.compact(big, 100)
    expect(layer1Calls).toBe(1)
    expect(layer2Calls).toBe(0)
  })

  it('falls through to subsequent layers when earlier ones are insufficient', async () => {
    let layer1Calls = 0
    let layer2Calls = 0
    const layered = new LayeredCompaction([
      {
        compact: (msgs) => {
          layer1Calls++
          return msgs // No reduction
        },
      } satisfies CompactionStrategy,
      {
        compact: () => {
          layer2Calls++
          return [{ role: 'user', content: 'tiny' }]
        },
      } satisfies CompactionStrategy,
    ])

    const big: Message[] = Array.from({ length: 50 }, () => ({
      role: 'user' as const,
      content: 'x'.repeat(400),
    }))

    await layered.compact(big, 100)
    expect(layer1Calls).toBe(1)
    expect(layer2Calls).toBe(1)
  })

  it('composes the recommended stack: micro-compact then summarization', async () => {
    const provider = new MockProvider([
      [{ type: 'text', text: 'Auto summary.' }, { type: 'done' }],
    ])
    const layered = new LayeredCompaction([
      new MicroCompaction({ keepRecentN: 2 }),
      new SummarizationCompaction(provider, { keepRecentN: 2 }),
    ])

    // Build a message list where micro-compact alone is NOT enough,
    // forcing the summarization layer to also run.
    const messages: Message[] = []
    for (let i = 0; i < 20; i++) {
      messages.push(userMsg(`u${i}-${'x'.repeat(200)}`))
      messages.push(assistantWithToolCall(`a${i}-${'x'.repeat(200)}`, `tc-${i}`, 'Bash'))
      messages.push(toolMsg(`tc-${i}`, 'r'.repeat(200)))
    }

    const compacted = await layered.compact(messages, 200)
    expect(compacted.length).toBeLessThan(messages.length)
    // Summary message must be present (summarization layer ran).
    const hasSummary = compacted.some(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('Summary of earlier conversation'),
    )
    expect(hasSummary).toBe(true)
  })

  it('summarization layer does NOT include cleared sentinel in transcript', async () => {
    // Capture the prompt actually sent to the provider so we can assert that
    // it does not contain the TOOL_RESULT_CLEARED_MESSAGE sentinel that an
    // earlier MicroCompaction layer wrote into the conversation.
    let capturedTranscript = ''
    const captureProvider = {
      chat({ messages }: { messages: Message[] }) {
        const userMsg = messages.find((m) => m.role === 'user')
        capturedTranscript = (userMsg?.content as string) ?? ''
        return (async function* () {
          yield { type: 'text' as const, text: 'Summary.' }
          yield { type: 'done' as const }
        })()
      },
    }

    const layered = new LayeredCompaction([
      new MicroCompaction({ keepRecentN: 1 }),
      new SummarizationCompaction(
        captureProvider as unknown as ConstructorParameters<typeof SummarizationCompaction>[0],
        { keepRecentN: 1 },
      ),
    ])

    // Build enough messages to force both layers to run.
    const messages: Message[] = []
    for (let i = 0; i < 10; i++) {
      messages.push(userMsg(`u${i}-${'x'.repeat(200)}`))
      messages.push(assistantWithToolCall(`a${i}`, `tc-${i}`, 'Bash'))
      messages.push(toolMsg(`tc-${i}`, 'r'.repeat(200)))
    }

    await layered.compact(messages, 100)
    // The transcript fed to the summarizer must not echo the sentinel.
    expect(capturedTranscript).not.toContain(TOOL_RESULT_CLEARED_MESSAGE)
  })
})

describe('Compaction exchange integrity', () => {
  const parallelTurn: Message[] = [
    userMsg('Inspect both files before editing'),
    { role: 'assistant', content: '', toolCalls: [
      { id: 'read-a', name: 'Read', input: { path: 'a.ts' } },
      { id: 'read-b', name: 'Read', input: { path: 'b.ts' } },
    ] },
    toolMsg('read-a', 'file a'),
    toolMsg('read-b', 'file b'),
  ]

  it('extends the summary boundary to keep the user instruction and the whole parallel exchange', async () => {
    const strategy = new SummarizationCompaction(new MockProvider([
      [{ type: 'text', text: 'Previous task complete.' }, { type: 'done' }],
    ]), { keepRecentN: 2 })
    const messages: Message[] = [userMsg('Old task'), { role: 'assistant', content: 'Old response' }, ...parallelTurn]
    const compacted = await strategy.compact(messages, 100)
    expect(compacted.slice(-4)).toEqual(parallelTurn)
    expect(compacted.slice(0, -4).some(m => m.role === 'user' && String(m.content).includes('Previous task complete.'))).toBe(true)
  })

  it('includes tool name, arguments, result identity, and system task context in summary input', async () => {
    const provider = new MockProvider([[{ type: 'text', text: 'Saved details.' }, { type: 'done' }]])
    const messages: Message[] = [
      { role: 'system', content: 'Do not deploy without authorization' },
      userMsg('Create the requested file'),
      { role: 'assistant', content: '', toolCalls: [{ id: 'write-file', name: 'Write', input: { path: 'example.ts', content: 'export const answer = 42' } }] },
      toolMsg('write-file', 'Write succeeded'),
      userMsg('Now explain the result'),
    ]
    await new SummarizationCompaction(provider, { keepRecentN: 1 }).compact(messages, 100)
    const transcript = provider.getCalls()[0].messages.map(m => String(m.content)).join('\n')
    expect(transcript).toContain('Write')
    expect(transcript).toContain('example.ts')
    expect(transcript).toContain('export const answer = 42')
    expect(transcript).toContain('write-file')
    expect(transcript).toContain('Do not deploy without authorization')
    expect(transcript).toContain('Create the requested file')
  })

  it('retains the latest complete turn when summary keepRecentN is zero', async () => {
    const messages: Message[] = [userMsg('old'), { role: 'assistant', content: 'done' }, userMsg('current request')]
    const compacted = await new SummarizationCompaction(new MockProvider([
      [{ type: 'text', text: 'Old task done.' }, { type: 'done' }],
    ]), { keepRecentN: 0 }).compact(messages, 100)
    expect(compacted.at(-1)).toEqual(userMsg('current request'))
    expect(compacted).not.toContainEqual(userMsg('old'))
  })

  it('sliding window keeps the user and every result when retaining a parallel exchange', () => {
    const messages: Message[] = [userMsg('Old task '.repeat(100)), { role: 'assistant', content: 'Old response' }, ...parallelTurn]
    expect(new SlidingWindowCompaction().compact(messages, 26)).toEqual(parallelTurn)
  })

  it('sliding window preserves the latest task even when the system already exceeds the target', () => {
    const messages: Message[] = [{ role: 'system', content: 'constraint '.repeat(100) }, ...parallelTurn]
    expect(new SlidingWindowCompaction().compact(messages, 1)).toEqual(messages)
  })

  it('layered micro and summary retain the complete latest exchange', async () => {
    const messages: Message[] = [userMsg('Old task '.repeat(100)), { role: 'assistant', content: 'Old response' }, ...parallelTurn]
    const layered = new LayeredCompaction([
      new MicroCompaction({ keepRecentN: 1 }),
      new SummarizationCompaction(new MockProvider([[{ type: 'text', text: 'Old task done.' }, { type: 'done' }]]), { keepRecentN: 2 }),
    ])
    const compacted = await layered.compact(messages, 100)
    expect(compacted.slice(-4).map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'tool'])
    expect(compacted.at(-3)).toEqual(parallelTurn[1])
    expect(compacted.at(-1)).toEqual(parallelTurn[3])
  })
})

describe('Compaction failure and cancellation', () => {
  const messages: Message[] = [userMsg('old'), { role: 'assistant', content: 'reply' }, userMsg('current')]

  it('propagates provider error chunks instead of discarding history for an empty summary', async () => {
    const failure = new Error('Summary provider failed')
    const strategy = new SummarizationCompaction(new MockProvider([[{ type: 'error', error: failure }]]), { keepRecentN: 1 })
    await expect(strategy.compact(messages, 10)).rejects.toThrow('Summary provider failed')
  })

  it('rejects an empty summary instead of dropping the only remaining task context', async () => {
    const strategy = new SummarizationCompaction(new MockProvider([[{ type: 'done' }]]), { keepRecentN: 1 })
    await expect(strategy.compact(messages, 10)).rejects.toThrow(/empty summary/i)
  })

  it('passes cancellation to the summary provider and stops after an abort', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const strategy = new SummarizationCompaction({
      async *chat(options) {
        receivedSignal = options.signal
        yield { type: 'text', text: 'partial' }
        controller.abort(new Error('Cancelled compaction'))
        yield { type: 'text', text: 'late' }
      },
    }, { keepRecentN: 1 })
    await expect(strategy.compact(messages, 10, controller.signal)).rejects.toThrow('Cancelled compaction')
    expect(receivedSignal).toBe(controller.signal)
  })

  it('settles cancellation while an abort-ignoring summary provider is waiting', async () => {
    const controller = new AbortController()
    let started!: () => void
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { started = resolve })
    const strategy = new SummarizationCompaction({
      async *chat() {
        started()
        await pending
        yield { type: 'text', text: 'late summary' }
      },
    }, { keepRecentN: 1 })
    const result = strategy.compact(messages, 10, controller.signal)
    await ready
    controller.abort(new Error('Cancelled waiting'))
    const outcome = await Promise.race([
      result.then(() => 'resolved', error => error.message),
      new Promise<string>(resolve => setTimeout(() => resolve('still waiting'), 30)),
    ])
    release()
    await result.catch(() => {})
    expect(outcome).toBe('Cancelled waiting')
  })

  it('stops the layered fallback after cancellation', async () => {
    const controller = new AbortController()
    let fallbackRan = false
    const strategy = new LayeredCompaction([
      { compact: () => { controller.abort(new Error('Cancelled')); return messages } },
      { compact: () => { fallbackRan = true; return [] } },
    ])
    await expect(strategy.compact(messages, 0, controller.signal)).rejects.toThrow('Cancelled')
    expect(fallbackRan).toBe(false)
  })
})

describe('ContextManager provider replacement', () => {
  it('uses the replacement provider for token counting', async () => {
    const provider = new MockProvider([])
    const manager = new ContextManager({ provider })
    const messages: Message[] = [userMsg('abcd')]
    expect(await manager.countTokens(messages)).toBe(1)
    manager.setProvider({ async *chat() {}, countTokens: async () => 7 })
    expect(await manager.countTokens(messages)).toBe(7)
  })
})
