import { describe, expect, it, vi } from 'vitest'
import { createLspTool } from '../packages/tools/src/lsp.ts'
import type { LspConnection } from '../packages/tools/src/lsp.ts'
import type { ToolContext } from '../packages/agent/src/types.ts'

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

function mockConnection(response: unknown = null): LspConnection {
  return {
    request: vi.fn().mockResolvedValue(response),
  }
}

// ---------------------------------------------------------------------------
// No connection (fallback)
// ---------------------------------------------------------------------------

describe('LSP tool — no connection', () => {
  it('returns fallback message when no connection is provided', async () => {
    const tool = createLspTool()
    const result = await tool.execute(
      { action: 'hover', file_path: '/src/index.ts', line: 0, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('LSP not available')
    expect(result.content).toContain('createLspTool(connection)')
  })

  it('returns fallback for every action when disconnected', async () => {
    const tool = createLspTool()

    for (const action of ['goToDefinition', 'findReferences', 'hover', 'documentSymbol', 'workspaceSymbol'] as const) {
      const input: Record<string, unknown> = { action }
      if (action !== 'workspaceSymbol') input.file_path = '/src/index.ts'
      if (['goToDefinition', 'findReferences', 'hover'].includes(action)) {
        input.line = 0
        input.character = 0
      }
      if (action === 'workspaceSymbol') input.query = 'test'

      const result = await tool.execute(input as never, makeCtx())
      expect(result.isError).toBe(true)
      expect(result.content).toContain('LSP not available')
    }
  })
})

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

describe('LSP tool — metadata', () => {
  it('has the correct name', () => {
    const tool = createLspTool()
    expect(tool.name).toBe('LSP')
  })

  it('is read-only and not destructive', () => {
    const tool = createLspTool()
    expect(tool.isReadOnly).toBe(true)
    expect(tool.isDestructive).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('LSP tool — schema validation', () => {
  it('rejects unknown action', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'unknownAction',
      file_path: '/src/index.ts',
    })
    expect(parsed.success).toBe(false)
  })

  it('requires file_path for goToDefinition', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'goToDefinition',
      line: 0,
      character: 0,
    })
    expect(parsed.success).toBe(false)
  })

  it('requires line for hover', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'hover',
      file_path: '/src/index.ts',
      character: 0,
    })
    expect(parsed.success).toBe(false)
  })

  it('requires character for findReferences', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'findReferences',
      file_path: '/src/index.ts',
      line: 5,
    })
    expect(parsed.success).toBe(false)
  })

  it('requires file_path for documentSymbol', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'documentSymbol',
    })
    expect(parsed.success).toBe(false)
  })

  it('does not require file_path for workspaceSymbol', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'workspaceSymbol',
      query: 'MyClass',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts valid goToDefinition input', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'goToDefinition',
      file_path: '/src/index.ts',
      line: 10,
      character: 5,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts valid documentSymbol input', () => {
    const tool = createLspTool()
    const parsed = tool.inputSchema.safeParse({
      action: 'documentSymbol',
      file_path: '/src/index.ts',
    })
    expect(parsed.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Request construction (with mock connection)
// ---------------------------------------------------------------------------

describe('LSP tool — request construction', () => {
  it('sends textDocument/definition for goToDefinition', async () => {
    const conn = mockConnection({ uri: 'file:///src/lib.ts', range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } } })
    const tool = createLspTool(conn)

    await tool.execute(
      { action: 'goToDefinition', file_path: '/src/index.ts', line: 10, character: 5 },
      makeCtx(),
    )

    expect(conn.request).toHaveBeenCalledWith('textDocument/definition', {
      textDocument: { uri: 'file:///src/index.ts' },
      position: { line: 10, character: 5 },
    })
  })

  it('sends textDocument/references for findReferences with includeDeclaration', async () => {
    const conn = mockConnection([])
    const tool = createLspTool(conn)

    await tool.execute(
      { action: 'findReferences', file_path: '/src/index.ts', line: 3, character: 8 },
      makeCtx(),
    )

    expect(conn.request).toHaveBeenCalledWith('textDocument/references', {
      textDocument: { uri: 'file:///src/index.ts' },
      position: { line: 3, character: 8 },
      context: { includeDeclaration: true },
    })
  })

  it('sends textDocument/hover for hover', async () => {
    const conn = mockConnection(null)
    const tool = createLspTool(conn)

    await tool.execute(
      { action: 'hover', file_path: '/src/types.ts', line: 0, character: 12 },
      makeCtx(),
    )

    expect(conn.request).toHaveBeenCalledWith('textDocument/hover', {
      textDocument: { uri: 'file:///src/types.ts' },
      position: { line: 0, character: 12 },
    })
  })

  it('sends textDocument/documentSymbol for documentSymbol', async () => {
    const conn = mockConnection([])
    const tool = createLspTool(conn)

    await tool.execute(
      { action: 'documentSymbol', file_path: '/src/main.ts' },
      makeCtx(),
    )

    expect(conn.request).toHaveBeenCalledWith('textDocument/documentSymbol', {
      textDocument: { uri: 'file:///src/main.ts' },
    })
  })

  it('sends workspace/symbol for workspaceSymbol with query', async () => {
    const conn = mockConnection([])
    const tool = createLspTool(conn)

    await tool.execute(
      { action: 'workspaceSymbol', query: 'MyInterface' },
      makeCtx(),
    )

    expect(conn.request).toHaveBeenCalledWith('workspace/symbol', {
      query: 'MyInterface',
    })
  })

  it('defaults query to empty string for workspaceSymbol', async () => {
    const conn = mockConnection([])
    const tool = createLspTool(conn)

    await tool.execute(
      { action: 'workspaceSymbol' },
      makeCtx(),
    )

    expect(conn.request).toHaveBeenCalledWith('workspace/symbol', {
      query: '',
    })
  })
})

// ---------------------------------------------------------------------------
// Response formatting
// ---------------------------------------------------------------------------

describe('LSP tool — response formatting', () => {
  it('formats a single definition location', async () => {
    const conn = mockConnection({
      uri: 'file:///src/lib.ts',
      range: { start: { line: 5, character: 2 }, end: { line: 5, character: 10 } },
    })
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'goToDefinition', file_path: '/src/index.ts', line: 10, character: 5 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('/src/lib.ts:6:3')
  })

  it('formats multiple reference locations', async () => {
    const conn = mockConnection([
      { uri: 'file:///src/a.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
      { uri: 'file:///src/b.ts', range: { start: { line: 9, character: 3 }, end: { line: 9, character: 8 } } },
    ])
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'findReferences', file_path: '/src/index.ts', line: 1, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('/src/a.ts:1:1')
    expect(result.content).toContain('/src/b.ts:10:4')
  })

  it('formats empty references as "No results found"', async () => {
    const conn = mockConnection([])
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'findReferences', file_path: '/src/index.ts', line: 1, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('No results found')
  })

  it('formats null definition as "No results found"', async () => {
    const conn = mockConnection(null)
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'goToDefinition', file_path: '/src/index.ts', line: 1, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('No results found')
  })

  it('formats hover with MarkupContent', async () => {
    const conn = mockConnection({
      contents: { kind: 'markdown', value: '```ts\nconst x: number\n```' },
    })
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'hover', file_path: '/src/index.ts', line: 0, character: 6 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('const x: number')
  })

  it('formats hover with plain string contents', async () => {
    const conn = mockConnection({
      contents: 'function hello(): void',
    })
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'hover', file_path: '/src/index.ts', line: 0, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('function hello(): void')
  })

  it('formats null hover as "No hover information available"', async () => {
    const conn = mockConnection(null)
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'hover', file_path: '/src/index.ts', line: 0, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('No hover information available')
  })

  it('formats DocumentSymbol results with hierarchy', async () => {
    const conn = mockConnection([
      {
        name: 'MyClass',
        kind: 5, // Class
        range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
        selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
        children: [
          {
            name: 'myMethod',
            kind: 6, // Method
            range: { start: { line: 2, character: 2 }, end: { line: 5, character: 3 } },
            selectionRange: { start: { line: 2, character: 2 }, end: { line: 2, character: 10 } },
          },
        ],
      },
    ])
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'documentSymbol', file_path: '/src/my-class.ts' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('Class MyClass')
    expect(result.content).toContain('Method myMethod')
    expect(result.content).toContain('L1-21')
  })

  it('formats SymbolInformation results (workspace/symbol)', async () => {
    const conn = mockConnection([
      {
        name: 'createAgent',
        kind: 12, // Function
        location: {
          uri: 'file:///src/agent.ts',
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 11 } },
        },
        containerName: 'agent',
      },
    ])
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'workspaceSymbol', query: 'createAgent' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('Function createAgent')
    expect(result.content).toContain('[agent]')
    expect(result.content).toContain('/src/agent.ts:11:1')
  })

  it('formats empty symbol list as "No symbols found"', async () => {
    const conn = mockConnection([])
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'documentSymbol', file_path: '/src/empty.ts' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('No symbols found')
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('LSP tool — error handling', () => {
  it('returns error when LSP request throws', async () => {
    const conn: LspConnection = {
      request: vi.fn().mockRejectedValue(new Error('Server crashed')),
    }
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'hover', file_path: '/src/index.ts', line: 0, character: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('LSP request failed')
    expect(result.content).toContain('Server crashed')
  })

  it('returns aborted when signal is already aborted', async () => {
    const conn = mockConnection()
    const tool = createLspTool(conn)

    const controller = new AbortController()
    controller.abort()

    const result = await tool.execute(
      { action: 'hover', file_path: '/src/index.ts', line: 0, character: 0 },
      makeCtx({ abortSignal: controller.signal }),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Aborted')
    expect(conn.request).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Metadata in result
// ---------------------------------------------------------------------------

describe('LSP tool — result metadata', () => {
  it('includes action, method, and raw result in metadata', async () => {
    const raw = { uri: 'file:///src/lib.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
    const conn = mockConnection(raw)
    const tool = createLspTool(conn)

    const result = await tool.execute(
      { action: 'goToDefinition', file_path: '/src/index.ts', line: 0, character: 0 },
      makeCtx(),
    )

    expect(result.metadata).toEqual({
      action: 'goToDefinition',
      method: 'textDocument/definition',
      raw,
    })
  })
})
