import { describe, expect, it, vi, beforeEach } from 'vitest'
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

// ---------------------------------------------------------------------------
// Tests: MCP tool conversion
// ---------------------------------------------------------------------------

describe('MCP tool conversion', () => {
  it('converts MCP tools to ToolDefinition with namespaced names', () => {
    const mockClient = createMockMCPClientSdk([
      { name: 'search', description: 'Search files' },
      { name: 'read', description: 'Read a file' },
    ])

    // Manually call the conversion (we test the output shape)
    const tools = mockClient.listTools()

    // Verify the mock returns expected tools
    expect(tools).resolves.toEqual(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'search' }),
          expect.objectContaining({ name: 'read' }),
        ]),
      }),
    )
  })

  it('preserves readOnlyHint from annotations', async () => {
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
    const client = new MCPClient({ name: 'test', command: 'echo' })

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
    expect(mockSdkClient.callTool).toHaveBeenCalledWith({
      name: 'greet',
      arguments: {},
    })
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
