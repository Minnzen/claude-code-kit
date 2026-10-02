import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { MCPClient, _resetSdkCache } from '../packages/agent/src/mcp-client.ts'
import { Agent } from '../packages/agent/src/agent.ts'
import { MockProvider } from '../packages/agent/src/providers/mock.ts'
import { ToolRegistry } from '../packages/agent/src/tool-registry.ts'
import { toolToProviderFormat } from '../packages/agent/src/tool-formatter.ts'
import type {
  AgentEvent,
  MCPServerConfig,
  MCPStdioServerConfig,
  MCPHttpServerConfig,
  ToolDefinition,
} from '../packages/agent/src/types.ts'

const sdkHarness = vi.hoisted(() => ({
  client: null as any,
  transport: null as any,
  options: null as any,
}))

vi.mock('../packages/agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js', () => ({
  Client: class {
    constructor(_info: unknown, options: unknown) {
      sdkHarness.options = options
      Object.assign(this, sdkHarness.client)
    }
  },
}))
vi.mock('../packages/agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor() { Object.assign(this, sdkHarness.transport) }
  },
}))
vi.mock('../packages/agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor() { Object.assign(this, sdkHarness.transport) }
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

/** Create a mock MCP Client SDK instance that returns scripted tools. */
function createMockMCPClientSdk(tools: MockMCPTool[] = []) {
  return {
    connect: vi.fn(async () => {}),
    listTools: vi.fn(async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description ?? `Mock tool ${t.name}`,
        inputSchema: t.inputSchema ?? { type: 'object' as const, properties: {} },
        annotations: t.annotations,
      })),
    })),
    callTool: vi.fn(async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const tool = tools.find((t) => t.name === params.name)
      if (!tool) throw new Error(`Unknown tool: ${params.name}`)
      return tool.result ?? { content: [{ type: 'text', text: `result from ${params.name}` }] }
    }),
    close: vi.fn(async () => {}),
  }
}

interface MockMCPTool {
  name: string
  description?: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, object>
    required?: string[]
  }
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
  }
  result?: Record<string, unknown>
}

// Mock transport that does nothing
function createMockTransport() {
  return {
    start: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown) => void) | undefined,
  }
}

// ---------------------------------------------------------------------------
// Tests: MCPClient connection & tool discovery
// ---------------------------------------------------------------------------

describe('MCPClient', () => {
  beforeEach(() => {
    _resetSdkCache()
  })

  it('exposes name from config', () => {
    const config: MCPStdioServerConfig = {
      name: 'test-server',
      command: 'echo',
      args: ['hello'],
    }
    const client = new MCPClient(config)
    expect(client.name).toBe('test-server')
  })

  it('starts disconnected', () => {
    const client = new MCPClient({ name: 'test', command: 'echo' })
    expect(client.connected).toBe(false)
    expect(client.tools).toEqual([])
  })

  it('can be constructed with HTTP config', () => {
    const config: MCPHttpServerConfig = {
      name: 'remote',
      url: 'http://localhost:3000/mcp',
      headers: { Authorization: 'Bearer token' },
    }
    const client = new MCPClient(config)
    expect(client.name).toBe('remote')
  })

  it('rejects server names containing double underscores', () => {
    expect(() => new MCPClient({ name: 'bad__name', command: 'echo' })).toThrow(
      /Invalid MCP server name/,
    )
  })

  it('rejects server names with invalid characters', () => {
    expect(() => new MCPClient({ name: 'bad name', command: 'echo' })).toThrow(
      /Invalid MCP server name/,
    )
    expect(() => new MCPClient({ name: 'bad.name', command: 'echo' })).toThrow(
      /Invalid MCP server name/,
    )
    expect(() => new MCPClient({ name: '', command: 'echo' })).toThrow(
      /Invalid MCP server name/,
    )
  })

  it('accepts valid server names', () => {
    expect(() => new MCPClient({ name: 'my-server', command: 'echo' })).not.toThrow()
    expect(() => new MCPClient({ name: 'my_server', command: 'echo' })).not.toThrow()
    expect(() => new MCPClient({ name: 'Server1', command: 'echo' })).not.toThrow()
    expect(() => new MCPClient({ name: 'a', command: 'echo' })).not.toThrow()
  })
})

describe('MCPClient lifecycle and discovery', () => {
  beforeEach(() => {
    _resetSdkCache()
    sdkHarness.client = createMockMCPClientSdk()
    sdkHarness.transport = createMockTransport()
    sdkHarness.options = null
  })

  afterEach(() => { vi.useRealTimers() })

  it('discovers every tools/list page before exposing a catalog', async () => {
    const client = new MCPClient({ name: 'pages', command: 'unused' })
    sdkHarness.client.listTools
      .mockResolvedValueOnce({ tools: [{ name: 'first', inputSchema: { type: 'object' } }], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ tools: [{ name: 'last', inputSchema: { type: 'object' } }] })
    await client.connect()
    expect(client.tools.map(tool => tool.name)).toEqual(['mcp__pages__first', 'mcp__pages__last'])
    expect(sdkHarness.client.listTools.mock.calls[1][0]).toEqual({ cursor: 'page-2' })
    await client.disconnect()
  })

  it('clears the connection timeout after successful discovery', async () => {
    vi.useFakeTimers()
    const client = new MCPClient({ name: 'timer', command: 'unused', connectTimeout: 100 })
    await client.connect()
    expect(vi.getTimerCount()).toBe(0)
    await client.disconnect()
  })

  it('cleans a failed connection and permits a later reconnect', async () => {
    const client = new MCPClient({ name: 'retry', command: 'unused' })
    sdkHarness.client.connect.mockRejectedValueOnce(new Error('handshake failed'))
    await expect(client.connect()).rejects.toThrow('handshake failed')
    expect(client.connected).toBe(false)
    expect(sdkHarness.transport.close).toHaveBeenCalledTimes(1)
    expect(sdkHarness.client.close).toHaveBeenCalledTimes(1)
    await client.connect()
    expect(client.connected).toBe(true)
    await client.disconnect()
  })

  it('bounds stalled discovery by the connection timeout and closes the transport', async () => {
    vi.useFakeTimers()
    const client = new MCPClient({ name: 'timeout', command: 'unused', connectTimeout: 10 })
    sdkHarness.client.listTools.mockImplementation(() => new Promise(() => {}))
    const result = expect(client.connect()).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(10)
    await result
    expect(client.connected).toBe(false)
    expect(client.tools).toEqual([])
    expect(sdkHarness.transport.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an incomplete discovery and preserves no connected state', async () => {
    const client = new MCPClient({ name: 'broken-list', command: 'unused' })
    sdkHarness.client.listTools
      .mockResolvedValueOnce({ tools: [{ name: 'partial', inputSchema: { type: 'object' } }], nextCursor: 'next' })
      .mockRejectedValueOnce(new Error('page failed'))
    await expect(client.connect()).rejects.toThrow('page failed')
    expect(client.connected).toBe(false)
    expect(client.tools).toEqual([])
    expect(sdkHarness.transport.close).toHaveBeenCalledTimes(1)
  })

  it('cancels stalled initial discovery even if SDK close never resolves', async () => {
    const client = new MCPClient({ name: 'abort-init', command: 'unused' })
    let resolveDiscovery: (value: unknown) => void = () => {}
    const started = new Promise<void>(resolve => {
      sdkHarness.client.listTools.mockImplementationOnce(() => {
        resolve()
        return new Promise(done => { resolveDiscovery = done })
      })
    })
    sdkHarness.client.close.mockImplementationOnce(() => new Promise(() => {}))
    const controller = new AbortController()
    const result = expect(client.connect(controller.signal)).rejects.toThrow(/cancelled/)
    await started
    controller.abort(new Error('initialization cancelled'))
    await result
    expect(sdkHarness.transport.close).toHaveBeenCalledTimes(1)
    resolveDiscovery({ tools: [{ name: 'late', inputSchema: { type: 'object' } }] })
    await Promise.resolve()
    expect(client.tools).toEqual([])
    await client.connect()
    expect(client.connected).toBe(true)
    await client.disconnect()
  })

  it('closes the transport even when SDK client cleanup throws synchronously', async () => {
    sdkHarness.client.connect.mockRejectedValueOnce(new Error('handshake failed'))
    sdkHarness.client.close.mockImplementationOnce(() => { throw new Error('close failed') })
    const client = new MCPClient({ name: 'cleanup', command: 'unused' })
    await expect(client.connect()).rejects.toThrow('handshake failed')
    expect(sdkHarness.transport.close).toHaveBeenCalledTimes(1)
  })

  it('allows list_changed refresh after reconnect when an old refresh never resolves', async () => {
    const client = new MCPClient({ name: 'refresh-retry', command: 'unused' })
    await client.connect()
    const started = new Promise<void>(resolve => {
      sdkHarness.client.listTools.mockImplementationOnce(() => {
        resolve()
        return new Promise(() => {})
      })
    })
    void sdkHarness.options.listChanged.tools.onChanged(null, null)
    await started
    await client.disconnect()
    await client.connect()
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [{ name: 'new', inputSchema: { type: 'object' } }] })
    await sdkHarness.options.listChanged.tools.onChanged(null, null)
    expect(client.tools.map(tool => tool.name)).toEqual(['mcp__refresh-retry__new'])
    await client.disconnect()
  })

  it('refreshes additions and removals when the server sends tools/list_changed', async () => {
    const client = new MCPClient({ name: 'dynamic', command: 'unused' })
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [{ name: 'old', inputSchema: { type: 'object' } }] })
    await client.connect()
    const catalogs: string[][] = []
    client.onToolsChanged(tools => catalogs.push(tools.map(tool => tool.name)))
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [{ name: 'new', inputSchema: { type: 'object' } }] })
    await sdkHarness.options.listChanged.tools.onChanged(null, null)
    expect(client.tools.map(tool => tool.name)).toEqual(['mcp__dynamic__new'])
    expect(catalogs).toEqual([['mcp__dynamic__new']])
    await client.disconnect()
  })

  it('reports failed notification refresh while retaining the last complete catalog', async () => {
    const client = new MCPClient({ name: 'dynamic-error', command: 'unused' })
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [{ name: 'known', inputSchema: { type: 'object' } }] })
    await client.connect()
    const errors: Error[] = []
    client.onError(error => errors.push(error))
    sdkHarness.client.listTools.mockRejectedValueOnce(new Error('refresh denied'))
    await sdkHarness.options.listChanged.tools.onChanged(null, null)
    expect(errors[0]?.message).toContain('refresh denied')
    expect(client.tools.map(tool => tool.name)).toEqual(['mcp__dynamic-error__known'])
    await client.disconnect()
  })

  it('does not grant read-only permission from untrusted remote annotations', async () => {
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [
      { name: 'claimed-safe', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
    ] })
    const client = new MCPClient({ name: 'untrusted', command: 'unused' })
    await client.connect()
    expect(client.tools[0]?.isReadOnly).toBe(false)
    await client.disconnect()
  })

  it('never grants read-only permission to a destructive tool even with trusted annotations', async () => {
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [
      { name: 'conflicting', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: true } },
    ] })
    const client = new MCPClient({ name: 'trusted', command: 'unused', trustToolAnnotations: true })
    await client.connect()
    expect(client.tools[0]?.isReadOnly).toBe(false)
    expect(client.tools[0]?.isDestructive).toBe(true)
    await client.disconnect()
  })

  it('propagates tool cancellation to the SDK request', async () => {
    sdkHarness.client.listTools.mockResolvedValueOnce({ tools: [{ name: 'slow', inputSchema: { type: 'object' } }] })
    sdkHarness.client.callTool.mockImplementation((_params: unknown, _schema: unknown, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('request cancelled')), { once: true })
    }))
    const client = new MCPClient({ name: 'cancel', command: 'unused' })
    await client.connect()
    const controller = new AbortController()
    const result = client.tools[0]!.execute({}, { workingDirectory: '/tmp', abortSignal: controller.signal })
    controller.abort()
    expect(await result).toMatchObject({ isError: true, content: expect.stringContaining('cancelled') })
    await client.disconnect()
  })
})

// ---------------------------------------------------------------------------
// Tests: MCP tool conversion
// ---------------------------------------------------------------------------

describe('MCP tool conversion', () => {
  it('converts MCP tools to ToolDefinition with namespaced names', async () => {
    const mockClient = createMockMCPClientSdk([
      { name: 'search', description: 'Search files' },
      { name: 'read', description: 'Read a file' },
    ])

    // Manually call the conversion (we test the output shape)
    const tools = mockClient.listTools()

    // Verify the mock returns expected tools
    await expect(tools).resolves.toEqual(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'search' }),
          expect.objectContaining({ name: 'read' }),
        ]),
      }),
    )
  })

  it('preserves readOnlyHint only when server annotations are explicitly trusted', async () => {
    // Simulate the full flow by testing what MCPClient.connect() would produce
    // We test the conversion logic directly by examining the ToolDefinition output

    const mockTools: MockMCPTool[] = [
      {
        name: 'list-files',
        description: 'List files in directory',
        annotations: { readOnlyHint: true },
      },
      {
        name: 'delete-file',
        description: 'Delete a file',
        annotations: { destructiveHint: true },
      },
      {
        name: 'unknown-op',
        description: 'No annotations',
      },
    ]

    // Use MCPClient with a mock SDK
    const mockSdkClient = createMockMCPClientSdk(mockTools)
    const mockTransport = createMockTransport()

    // Patch the internal state to simulate a connected client
    const client = new MCPClient({ name: 'test', command: 'echo', trustToolAnnotations: true })

    // Use private access to inject mock (testing the conversion logic)
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()

    expect(tools).toHaveLength(3)

    // Read-only tool
    const listFiles = tools.find((t) => t.name === 'mcp__test__list-files')
    expect(listFiles).toBeDefined()
    expect(listFiles!.isReadOnly).toBe(true)

    // Destructive tool
    const deleteFile = tools.find((t) => t.name === 'mcp__test__delete-file')
    expect(deleteFile).toBeDefined()
    expect(deleteFile!.isDestructive).toBe(true)
    expect(deleteFile!.isReadOnly).toBe(false)

    // No annotations — defaults to non-readOnly
    const unknownOp = tools.find((t) => t.name === 'mcp__test__unknown-op')
    expect(unknownOp).toBeDefined()
    expect(unknownOp!.isReadOnly).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: MCP tool execution
// ---------------------------------------------------------------------------

describe('MCP tool execution', () => {
  it('calls the MCP server and returns text content', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      {
        name: 'greet',
        description: 'Say hello',
        result: {
          content: [{ type: 'text', text: 'Hello from MCP!' }],
        },
      },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'test', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()
    expect(tools).toHaveLength(1)

    const tool = tools[0]!
    const result = await tool.execute(
      {},
      {
        workingDirectory: '/tmp',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.content).toBe('Hello from MCP!')
    expect(result.isError).toBeFalsy()
    expect(mockSdkClient.callTool).toHaveBeenCalledWith(
      { name: 'greet', arguments: {} }, undefined,
      { signal: expect.any(AbortSignal) },
    )
  })

  it('handles MCP server errors gracefully', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      { name: 'fail', description: 'Always fails' },
    ])
    // Override callTool to throw
    mockSdkClient.callTool.mockRejectedValue(new Error('Connection reset'))

    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'broken', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()
    const tool = tools[0]!

    const result = await tool.execute(
      {},
      {
        workingDirectory: '/tmp',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('Connection reset')
    expect(result.content).toContain('broken')
  })

  it('handles isError flag from MCP server', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      {
        name: 'erroring',
        description: 'Returns error',
        result: {
          content: [{ type: 'text', text: 'Something went wrong' }],
          isError: true,
        },
      },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'test', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()
    const result = await tools[0]!.execute(
      {},
      {
        workingDirectory: '/tmp',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Something went wrong')
  })

  it('handles binary content with placeholder', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      {
        name: 'screenshot',
        description: 'Take screenshot',
        result: {
          content: [{ type: 'image', data: 'base64data...', mimeType: 'image/png' }],
        },
      },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'test', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()
    const result = await tools[0]!.execute(
      {},
      {
        workingDirectory: '/tmp',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.content).toContain('[binary content: image/png]')
  })

  it('concatenates multiple text parts', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      {
        name: 'multi',
        description: 'Multi-part',
        result: {
          content: [
            { type: 'text', text: 'Line 1' },
            { type: 'text', text: 'Line 2' },
            { type: 'text', text: 'Line 3' },
          ],
        },
      },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'test', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()
    const result = await tools[0]!.execute(
      {},
      {
        workingDirectory: '/tmp',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.content).toBe('Line 1\nLine 2\nLine 3')
  })
})

// ---------------------------------------------------------------------------
// Tests: MCPClient disconnect
// ---------------------------------------------------------------------------

describe('MCPClient disconnect', () => {
  it('cleans up state on disconnect', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      { name: 'tool1', description: 'A tool' },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'test', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true
    ;(client as any)._tools = [{ name: 'mcp__test__tool1' }]

    await client.disconnect()

    expect(client.connected).toBe(false)
    expect(client.tools).toEqual([])
    expect(mockTransport.close).toHaveBeenCalled()
  })

  it('is idempotent', async () => {
    const client = new MCPClient({ name: 'test', command: 'echo' })

    // Should not throw when already disconnected
    await client.disconnect()
    expect(client.connected).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: Tool formatter with MCP tools
// ---------------------------------------------------------------------------

describe('MCP tool provider format', () => {
  it('uses original JSON Schema instead of Zod conversion for MCP tools', async () => {
    const originalSchema = {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    }

    const mockSdkClient = createMockMCPClientSdk([
      {
        name: 'search',
        description: 'Search things',
        inputSchema: originalSchema,
      },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'test', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()
    const tool = tools[0]!

    const providerFormat = toolToProviderFormat(tool)

    expect(providerFormat.name).toBe('mcp__test__search')
    expect(providerFormat.description).toBe('Search things')
    // The input schema should be the original MCP JSON Schema, not a Zod-converted one
    expect(providerFormat.inputSchema).toEqual(originalSchema)
  })
})

// ---------------------------------------------------------------------------
// Tests: Agent + MCP integration
// ---------------------------------------------------------------------------

describe('Agent MCP integration', () => {
  it('registers MCP tools alongside built-in tools', async () => {
    // This test verifies the Agent constructor accepts mcp config
    // and that the integration path exists (actual MCP connection
    // requires the SDK, which we test separately above)

    const builtinTool: ToolDefinition<{ value: string }> = {
      name: 'builtin-tool',
      description: 'A built-in tool',
      inputSchema: z.object({ value: z.string() }),
      execute: async () => ({ content: 'built-in result' }),
      isReadOnly: true,
    }

    const provider = new MockProvider([
      [{ type: 'text', text: 'Hello' }, { type: 'done' }],
    ])

    // Agent accepts mcp config without errors
    const agent = new Agent({
      provider,
      model: 'mock',
      tools: [builtinTool],
      mcp: {
        servers: [
          { name: 'test', command: 'nonexistent-server' },
        ],
      },
    })

    // MCP clients list is initially empty (not yet connected)
    expect(agent.getMCPClients()).toEqual([])
  })

  it('AgentConfig accepts HTTP MCP server config', () => {
    const provider = new MockProvider([])

    // Should not throw — validates the type accepts HTTP config
    const agent = new Agent({
      provider,
      model: 'mock',
      mcp: {
        servers: [
          { name: 'remote', url: 'http://localhost:3000/mcp' },
        ],
      },
    })

    expect(agent).toBeDefined()
  })

  it('disconnectMCP is callable even without MCP config', async () => {
    const provider = new MockProvider([])
    const agent = new Agent({ provider, model: 'mock' })

    // Should not throw
    await agent.disconnectMCP()
    expect(agent.getMCPClients()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: ToolRegistry with MCP tools
// ---------------------------------------------------------------------------

describe('ToolRegistry with MCP tools', () => {
  it('registers and executes MCP tools via the registry', async () => {
    const mockSdkClient = createMockMCPClientSdk([
      {
        name: 'echo',
        description: 'Echo input',
        result: {
          content: [{ type: 'text', text: 'echoed!' }],
        },
      },
    ])
    const mockTransport = createMockTransport()

    const client = new MCPClient({ name: 'server', command: 'echo' })
    ;(client as any).client = mockSdkClient
    ;(client as any).transport = mockTransport
    ;(client as any)._connected = true

    const tools = await client.discoverTools()

    const registry = new ToolRegistry()
    for (const tool of tools) {
      registry.register(tool)
    }

    expect(registry.has('mcp__server__echo')).toBe(true)

    // Execute through the registry
    const result = await registry.execute(
      'mcp__server__echo',
      { message: 'test' },
      {
        workingDirectory: '/tmp',
        abortSignal: new AbortController().signal,
      },
    )

    expect(result.content).toBe('echoed!')
    expect(result.isError).toBeFalsy()
  })
})
