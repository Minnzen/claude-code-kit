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
    // Sanity check — these 8 names match Claude Code's COMPACTABLE_TOOLS set.
    expect(DEFAULT_COMPACTABLE_TOOLS).toEqual([
      'Bash',
      'Read',
      'Edit',
      'Write',
      'Glob',
      'Grep',
      'WebFetch',
      'WebSearch',
    ])
  })

  it('placeholder string matches Claude Code verbatim', () => {
    expect(TOOL_RESULT_CLEARED_MESSAGE).toBe('[Old tool result content cleared]')
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
})
