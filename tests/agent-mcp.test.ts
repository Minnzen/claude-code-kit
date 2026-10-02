import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Agent } from '../packages/agent/src/agent.ts'
import { MockProvider } from '../packages/agent/src/providers/mock.ts'
import type { AgentEvent, ToolDefinition } from '../packages/agent/src/types.ts'

const harness = vi.hoisted(() => ({ clients: [] as Array<{
  tools: ToolDefinition[]; notify: (tools: ToolDefinition[]) => void; fail: (error: Error) => void;
  disconnect: ReturnType<typeof vi.fn>;
}>, failConnect: false }))
vi.mock('../packages/agent/src/mcp-client.js', () => ({ MCPClient: class {
  tools: ToolDefinition[] = []
  private changed?: (tools: ToolDefinition[]) => void
  private failed?: (error: Error) => void
  disconnect = vi.fn(async () => {})
  constructor() { harness.clients.push(this) }
  async connect() { if (harness.failConnect) throw new Error('catalog unavailable') }
  onToolsChanged(callback: (tools: ToolDefinition[]) => void) { this.changed = callback; return () => { this.changed = undefined } }
  onError(callback: (error: Error) => void) { this.failed = callback; return () => { this.failed = undefined } }
  notify(tools: ToolDefinition[]) { this.tools = tools; this.changed?.(tools) }
  fail(error: Error) { this.failed?.(error) }
} }))
beforeEach(() => { harness.clients.length = 0; harness.failConnect = false })
async function drain(iterator: AsyncGenerator<AgentEvent>) { const events: AgentEvent[] = []; for await (const event of iterator) events.push(event); return events }
const tool = (name: string, description: string): ToolDefinition => ({ name, description, inputSchema: z.object({}), isReadOnly: true, execute: async () => ({ content: description }) })
const config = { model: 'mock', mcp: { servers: [{ name: 'remote', command: 'unused' }] } }

describe('Agent MCP catalog lifecycle', () => {
  it('refreshes additions, removals and same-name metadata, then unsubscribes', async () => {
    const provider = new MockProvider(Array.from({ length: 4 }, () => [{ type: 'text' as const, text: 'ok' }, { type: 'done' as const }]))
    const agent = new Agent({ ...config, provider, tools: [tool('builtin', 'local')] })
    await drain(agent.run('initialize'))
    const client = harness.clients[0]
    client.notify([tool('mcp__remote__one', 'old')])
    await drain(agent.run('added'))
    expect(provider.getCalls()[1].tools?.map(tool => tool.name)).toEqual(['builtin', 'mcp__remote__one'])
    client.notify([tool('mcp__remote__one', 'new'), tool('mcp__remote__two', 'second')])
    client.notify([tool('mcp__remote__one', 'latest')])
    await drain(agent.run('updated'))
    expect(provider.getCalls()[2].tools?.find(tool => tool.name === 'mcp__remote__one')?.description).toBe('latest')
    expect(provider.getCalls()[2].tools?.some(tool => tool.name === 'mcp__remote__two')).toBe(false)
    await agent.disconnectMCP()
    client.notify([tool('mcp__remote__late', 'stale')])
    await drain(agent.run('fresh'))
    expect(provider.getCalls()[3].tools?.map(tool => tool.name)).toEqual(['builtin'])
    expect(client.disconnect).toHaveBeenCalledOnce()
  })

  it('surfaces initialization and idle catalog errors', async () => {
    harness.failConnect = true
    const agent = new Agent({ ...config, provider: new MockProvider([[{ type: 'done' }]]) })
    const events = await drain(agent.run('init'))
    expect(events.some(event => event.type === 'error' && /catalog unavailable/.test(event.error.message))).toBe(true)
    harness.failConnect = false
    const agent2 = new Agent({ ...config, provider: new MockProvider([[{ type: 'done' }], [{ type: 'done' }]]) })
    await drain(agent2.run('init'))
    harness.clients.at(-1)!.fail(new Error('refresh failed'))
    expect((await drain(agent2.run('again'))).some(event => event.type === 'error' && /refresh failed/.test(event.error.message))).toBe(true)
  })
})
