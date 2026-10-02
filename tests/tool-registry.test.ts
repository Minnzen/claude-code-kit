import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from '../packages/agent/src/tool-registry.ts'
import type { ToolContext, ToolDefinition } from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(): ToolContext {
  return {
    workingDirectory: '/tmp',
    abortSignal: new AbortController().signal,
    env: {},
  }
}

function makeTool(
  name: string,
  execute: ToolDefinition['execute'] = async () => ({ content: 'ok' }),
): ToolDefinition {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: z.object({ value: z.string().optional() }),
    execute,
    isReadOnly: true,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolRegistry', () => {
  // 1. Register and get by name
  it('registers a tool and retrieves it by name', () => {
    const registry = new ToolRegistry()
    const tool = makeTool('echo')
    registry.register(tool)

    expect(registry.get('echo')).toBe(tool)
  })

  // 2. has()
  it('has() returns true for registered tools', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('ping'))
    expect(registry.has('ping')).toBe(true)
    expect(registry.has('pong')).toBe(false)
  })

  // 3. list()
  it('list() returns all registered tools', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('a'))
    registry.register(makeTool('b'))

    const names = registry.list().map((t) => t.name)
    expect(names).toContain('a')
    expect(names).toContain('b')
    expect(names).toHaveLength(2)
  })

  // 4. Duplicate registration throws
  it('throws when registering a tool with a duplicate name', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('dup'))
    expect(() => registry.register(makeTool('dup'))).toThrow(/already registered/)
  })

  // 5. unregister returns true and removes the tool
  it('unregister removes the tool and returns true', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('remove-me'))

    expect(registry.unregister('remove-me')).toBe(true)
    expect(registry.get('remove-me')).toBeUndefined()
  })

  // 6. unregister returns false for unknown tool
  it('unregister returns false for an unregistered tool', () => {
    const registry = new ToolRegistry()
    expect(registry.unregister('ghost')).toBe(false)
  })

  // 7. toProviderFormat returns JSON Schema
  it('toProviderFormat returns tool definitions with JSON Schema', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('search'))

    const defs = registry.toProviderFormat()
    expect(defs).toHaveLength(1)
    expect(defs[0]!.name).toBe('search')
    expect(defs[0]!.inputSchema).toBeDefined()
    // JSON Schema should have "type": "object"
    expect((defs[0]!.inputSchema as { type: string }).type).toBe('object')
  })

  // 8. execute calls the tool's execute function
  it('execute calls the tool function and returns its result', async () => {
    const execMock = vi.fn(async () => ({ content: 'result-42' }))
    const registry = new ToolRegistry()
    registry.register(makeTool('compute', execMock))

    const result = await registry.execute('compute', {}, makeContext())
    expect(result.content).toBe('result-42')
    expect(execMock).toHaveBeenCalledOnce()
  })

  // 9. execute returns error for unknown tool
  it('execute returns an error result for an unknown tool', async () => {
    const registry = new ToolRegistry()
    const result = await registry.execute('no-such-tool', {}, makeContext())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/Unknown tool/)
  })

  // 10. execute validates input with Zod
  it('execute returns an error result when Zod validation fails', async () => {
    const registry = new ToolRegistry()
    const tool: ToolDefinition = {
      name: 'strict',
      description: 'strict input',
      inputSchema: z.object({ num: z.number() }),
      execute: async () => ({ content: 'ok' }),
      isReadOnly: true,
    }
    registry.register(tool)

    // Pass a string where a number is expected
    const result = await registry.execute('strict', { num: 'not-a-number' }, makeContext())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/Invalid input/)
  })

  // 11. clear removes all tools
  it('clear() removes all registered tools', () => {
    const registry = new ToolRegistry()
    registry.register(makeTool('a'))
    registry.register(makeTool('b'))
    registry.clear()

    expect(registry.list()).toHaveLength(0)
  })

  // 12. execute passes validated input to the tool
  it('execute passes Zod-parsed input to the tool function', async () => {
    const execMock = vi.fn(async (input: { num: number }) => ({
      content: String(input.num * 2),
    }))
    const registry = new ToolRegistry()
    const tool: ToolDefinition = {
      name: 'double',
      description: 'doubles a number',
      inputSchema: z.object({ num: z.number() }),
      execute: execMock as ToolDefinition['execute'],
      isReadOnly: true,
    }
    registry.register(tool)

    const result = await registry.execute('double', { num: 21 }, makeContext())
    expect(result.content).toBe('42')
    expect(execMock.mock.calls[0]![0]).toMatchObject({ num: 21 })
  })
})


describe('ToolRegistry bounded execution', () => {
  it('returns a timeout error even when a tool ignores its signal', async () => {
    const registry = new ToolRegistry()
    const tool = makeTool('stuck', async () => new Promise(() => {}))
    tool.timeout = 10
    registry.register(tool)
    const result = await registry.execute('stuck', {}, makeContext())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/timed out/i)
  }, 500)

  it('returns an abort error and ignores late success', async () => {
    const registry = new ToolRegistry()
    let finish!: (value: { content: string }) => void
    const tool = makeTool('late', async () => new Promise(resolve => { finish = resolve }))
    registry.register(tool)
    const controller = new AbortController()
    const pending = registry.execute('late', {}, { ...makeContext(), abortSignal: controller.signal })
    await Promise.resolve()
    controller.abort()
    const result = await pending
    finish({ content: 'late success' })
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/aborted/i)
  }, 500)

  it('does not invoke an already aborted tool', async () => {
    const registry = new ToolRegistry()
    const execute = vi.fn(async () => ({ content: 'bad' }))
    registry.register(makeTool('never', execute))
    const controller = new AbortController()
    controller.abort()
    expect((await registry.execute('never', {}, { ...makeContext(), abortSignal: controller.signal })).isError).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })
})


it('isolates saved tool arguments from late mutation after abort', async () => {
  const registry = new ToolRegistry()
  let mutate!: () => void
  const tool: ToolDefinition<{ nested: { value: string } }> = {
    name: 'late-mutation', description: 'late mutation', inputSchema: z.object({ nested: z.unknown() }) as never,
    execute: async input => new Promise(() => { mutate = () => { input.nested.value = 'mutated' } }),
  }
  registry.register(tool)
  const controller = new AbortController()
  const input = { nested: { value: 'original' } }
  const pending = registry.execute(tool.name, input, { ...makeContext(), abortSignal: controller.signal })
  await Promise.resolve()
  controller.abort()
  await pending
  mutate()
  expect(input.nested.value).toBe('original')
})
