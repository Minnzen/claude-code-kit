import { createServer, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Agent } from '../packages/agent/src/agent.ts'
import { OpenAIProvider } from '../packages/agent/src/providers/openai.ts'
import { AnthropicProvider } from '../packages/agent/src/providers/anthropic.ts'
import type { StreamChunk } from '../packages/agent/src/types.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { await Promise.all(cleanups.splice(0).map(cleanup => cleanup())) })

// The real SDK parses these mocked HTTP SSE responses; adapter generators are not mocked.
async function sseServer(respond: (response: ServerResponse, call: number) => void) {
  const requests: Record<string, unknown>[] = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const part of request) body += part
    requests.push(JSON.parse(body))
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    respond(response, requests.length)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No server address')
  cleanups.push(() => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  }))
  return { baseURL: `http://127.0.0.1:${address.port}/v1`, requests }
}
function openaiSSE(response: ServerResponse, chunks: unknown[]) {
  response.end(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n')
}
function anthropicSSE(response: ServerResponse, events: Array<{ type: string }>) {
  response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
}
async function collect(stream: AsyncGenerator<StreamChunk>) {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}
const options = { model: 'test-model', messages: [{ role: 'user' as const, content: 'test' }] }
const openaiTools = [
  { choices: [{ delta: { tool_calls: [
    { index: 0, id: 'a', function: { name: 'echo', arguments: '{"value":"A' } },
    { index: 1, id: 'b', function: { name: 'echo', arguments: '{"value":"B' } },
  ] } }] },
  { choices: [{ delta: { tool_calls: [
    { index: 1, function: { arguments: '"}' } },
    { index: 0, function: { arguments: '"}' } },
  ] } }] },
  { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
]
const messageStart = { type: 'message_start', message: {
  id: 'msg', type: 'message', role: 'assistant', model: 'test-model', content: [],
  stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 },
} }

describe('OpenAI SDK SSE adapter', () => {
  it('preserves same-name interleaved tool calls and usage-only tail chunks', async () => {
    const server = await sseServer(response => openaiSSE(response, openaiTools))
    const chunks = await collect(new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }).chat(options))
    expect(chunks.filter(chunk => chunk.type === 'tool_use_delta').map(chunk => chunk.id)).toEqual(['a', 'b', 'b', 'a'])
    expect(chunks.filter(chunk => chunk.type === 'tool_use_end').map(chunk => chunk.id)).toEqual(['a', 'b'])
    expect(chunks.find(chunk => chunk.type === 'usage')).toEqual({ type: 'usage', usage: { inputTokens: 12, outputTokens: 7 } })
    expect(server.requests[0].stream_options).toEqual({ include_usage: true })
  })

  it('executes both real SDK calls and sends both results in the next request', async () => {
    const server = await sseServer((response, call) => openaiSSE(response, call === 1 ? openaiTools : [
      { choices: [{ delta: { content: 'finished' }, finish_reason: 'stop' }] },
    ]))
    const execute = vi.fn(async ({ value }: { value: string }) => ({ content: value }))
    const agent = new Agent({ model: 'test-model', provider: new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }), tools: [{
      name: 'echo', description: 'Echo', inputSchema: z.object({ value: z.string() }), isReadOnly: true, execute,
    }] })
    expect(await agent.chat('echo both')).toBe('finished')
    expect(execute).toHaveBeenCalledTimes(2)
    const messages = server.requests[1].messages as Array<Record<string, unknown>>
    expect(messages.filter(message => message.role === 'tool')).toEqual([
      { role: 'tool', tool_call_id: 'a', content: 'A' }, { role: 'tool', tool_call_id: 'b', content: 'B' },
    ])
  })

  it('rejects a truncated tool response without executing it', async () => {
    const server = await sseServer(response => openaiSSE(response, [openaiTools[0]]))
    const execute = vi.fn(async () => ({ content: 'bad' }))
    const agent = new Agent({ model: 'test-model', provider: new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }), tools: [{
      name: 'echo', description: 'Echo', inputSchema: z.object({}), isReadOnly: true, execute,
    }] })
    await expect(agent.chat('test')).rejects.toThrow(/incomplete|finish/i)
    expect(execute).not.toHaveBeenCalled()
  })

  it('reports malformed JSON as an error result instead of executing it', async () => {
    const server = await sseServer((response, call) => openaiSSE(response, call === 1 ? [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad', function: { name: 'echo', arguments: '{bad' } }] }, finish_reason: 'tool_calls' }] },
    ] : [{ choices: [{ delta: { content: 'handled' }, finish_reason: 'stop' }] }]))
    const execute = vi.fn(async () => ({ content: 'bad' }))
    const agent = new Agent({ model: 'test-model', provider: new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }), tools: [{
      name: 'echo', description: 'Echo', inputSchema: z.object({}), isReadOnly: true, execute,
    }] })
    expect(await agent.chat('test')).toBe('handled')
    const messages = server.requests[1].messages as Array<Record<string, unknown>>
    expect(messages.find(message => message.role === 'tool')?.content).toMatch(/parse tool input JSON/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('surfaces SDK SSE errors without committing an assistant', async () => {
    const server = await sseServer(response => openaiSSE(response, [{ error: { message: 'SSE upstream failure', type: 'server_error', code: 'server_error' } }]))
    const agent = new Agent({ model: 'test-model', provider: new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }) })
    await expect(agent.chat('test')).rejects.toThrow(/SSE upstream failure/)
    expect(agent.getMessages()).toHaveLength(1)
  })

  it('aborts a pending SDK stream and allows another run after cancel', async () => {
    const server = await sseServer((response, call) => {
      if (call > 1) return openaiSSE(response, [{ choices: [{ delta: { content: 'new' }, finish_reason: 'stop' }] }])
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' } }] })}\n\n`)
    })
    const agent = new Agent({ model: 'test-model', provider: new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }) })
    const iterator = agent.run('test')
    expect((await iterator.next()).value).toEqual({ type: 'text', text: 'partial' })
    const remaining = (async () => { for await (const event of iterator) void event })()
    await agent.cancel()
    await remaining
    agent.clearMessages()
    expect(await agent.chat('again')).toBe('new')
  })
})

describe('Anthropic SDK SSE adapter', () => {
  it('routes indexed tool blocks and preserves cumulative token totals', async () => {
    const server = await sseServer(response => anthropicSSE(response, [
      messageStart,
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'a', name: 'echo', input: {} } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'b', name: 'echo', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"value":"A"}' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"value":"B"}' } },
      { type: 'content_block_stop', index: 0 }, { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } },
      { type: 'message_stop' },
    ]))
    const chunks = await collect(new AnthropicProvider({ apiKey: 'test', baseURL: server.baseURL }).chat(options))
    expect(chunks.filter(chunk => chunk.type === 'tool_use_delta').map(chunk => chunk.id)).toEqual(['a', 'b'])
    expect(chunks.filter(chunk => chunk.type === 'tool_use_end').map(chunk => chunk.id)).toEqual(['a', 'b'])
    expect(chunks.filter(chunk => chunk.type === 'usage').at(-1)).toEqual({ type: 'usage', usage: { inputTokens: 12, outputTokens: 7 } })
  })

  it('preserves thinking/text chunks and rejects stream errors', async () => {
    const server = await sseServer((response, call) => anthropicSSE(response, call === 1 ? [
      messageStart,
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'consider' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'answer' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } },
      { type: 'message_stop' },
    ] : [{ type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } }]))
    const provider = new AnthropicProvider({ apiKey: 'test', baseURL: server.baseURL })
    const chunks = await collect(provider.chat(options))
    expect(chunks).toContainEqual({ type: 'thinking', text: 'consider' })
    expect(chunks).toContainEqual({ type: 'text', text: 'answer' })
    await expect(collect(provider.chat(options))).rejects.toThrow(/overloaded/)
  })
})


describe('provider stream edge cases', () => {
  it('buffers OpenAI args until metadata arrives and emits zero token usage', async () => {
    const server = await sseServer(response => openaiSSE(response, [
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"value":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'delayed', function: { name: 'echo', arguments: '"ok"}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 0, completion_tokens: 0 } },
    ]))
    const chunks = await collect(new OpenAIProvider({ apiKey: 'test', baseURL: server.baseURL }).chat(options))
    expect(chunks.filter(chunk => chunk.type === 'tool_use_start')).toEqual([{ type: 'tool_use_start', toolCall: { id: 'delayed', name: 'echo' } }])
    expect(chunks.filter(chunk => chunk.type === 'tool_use_delta')).toEqual([{ type: 'tool_use_delta', id: 'delayed', text: '{"value":"ok"}' }])
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } })
  })

  it('rejects an Anthropic partial tool stream before execution', async () => {
    const server = await sseServer(response => anthropicSSE(response, [messageStart,
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'partial', name: 'echo', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"value":' } },
    ]))
    const execute = vi.fn(async () => ({ content: 'bad' }))
    const agent = new Agent({ model: 'test-model', provider: new AnthropicProvider({ apiKey: 'test', baseURL: server.baseURL }), tools: [{
      name: 'echo', description: 'Echo', inputSchema: z.object({}), isReadOnly: true, execute,
    }] })
    await expect(agent.chat('test')).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(agent.getMessages()).toHaveLength(1)
  })

  it('rejects malformed Anthropic args before executing a tool', async () => {
    const server = await sseServer(response => anthropicSSE(response, [messageStart,
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'bad', name: 'echo', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{bad' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } },
      { type: 'message_stop' },
    ]))
    const execute = vi.fn(async () => ({ content: 'bad' }))
    const agent = new Agent({ model: 'test-model', provider: new AnthropicProvider({ apiKey: 'test', baseURL: server.baseURL }), maxTurns: 1, tools: [{
      name: 'echo', description: 'Echo', inputSchema: z.object({}), isReadOnly: true, execute,
    }] })
    const events = []
    for await (const event of agent.run('test')) events.push(event)
    expect(events.some(event => event.type === 'error' || (event.type === 'tool_result' && event.result.isError))).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it('aborts an Anthropic SDK stream waiting for more SSE', async () => {
    const server = await sseServer(response => {
      for (const event of [messageStart,
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
      ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    })
    const agent = new Agent({ model: 'test-model', provider: new AnthropicProvider({ apiKey: 'test', baseURL: server.baseURL }) })
    const iterator = agent.run('test')
    while ((await iterator.next()).value?.type !== 'text') {}
    const events = (async () => { const result = []; for await (const event of iterator) result.push(event); return result })()
    await agent.cancel()
    expect((await events).some(event => event.type === 'error' && event.error.name === 'AbortError')).toBe(true)
  })
})
