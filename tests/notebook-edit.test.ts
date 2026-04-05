import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { notebookEditTool } from '../packages/tools/src/notebook-edit.ts'
import type { ToolContext } from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDirectory: tmpDir,
    abortSignal: new AbortController().signal,
    env: {},
    ...overrides,
  }
}

function makeNotebook(cells: Array<{ cell_type: string; source: string[] }>) {
  return {
    nbformat: 4,
    nbformat_minor: 2,
    metadata: { kernelspec: {}, language_info: {} },
    cells: cells.map((c) => ({
      cell_type: c.cell_type,
      source: c.source,
      metadata: {},
      ...(c.cell_type === 'code' ? { outputs: [], execution_count: null } : {}),
    })),
  }
}

function writeNotebook(name: string, nb: ReturnType<typeof makeNotebook>): string {
  const filePath = path.join(tmpDir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(nb, null, 1), 'utf-8')
  return filePath
}

function readNotebook(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cck-notebook-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// insert action
// ---------------------------------------------------------------------------

describe('notebookEditTool — insert', () => {
  it('inserts a cell at the beginning', async () => {
    const nb = makeNotebook([
      { cell_type: 'code', source: ['print("a")\n'] },
    ])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, cell_type: 'markdown', new_source: '# New heading' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells).toHaveLength(2)
    expect(updated.cells[0].cell_type).toBe('markdown')
    expect(updated.cells[0].source.join('')).toBe('# New heading')
    expect(updated.cells[1].source.join('')).toContain('print("a")')
  })

  it('inserts a cell in the middle', async () => {
    const nb = makeNotebook([
      { cell_type: 'code', source: ['a\n'] },
      { cell_type: 'code', source: ['c\n'] },
    ])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 1, new_source: 'b' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells).toHaveLength(3)
    expect(updated.cells[1].source.join('')).toBe('b')
  })

  it('inserts a cell at the end', async () => {
    const nb = makeNotebook([
      { cell_type: 'code', source: ['first\n'] },
    ])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 1, new_source: 'last' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells).toHaveLength(2)
    expect(updated.cells[1].source.join('')).toBe('last')
  })

  it('defaults cellType to code', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, new_source: 'x = 1' },
      makeCtx(),
    )

    const updated = readNotebook(filePath)
    expect(updated.cells[0].cell_type).toBe('code')
    expect(updated.cells[0].outputs).toEqual([])
    expect(updated.cells[0].execution_count).toBeNull()
  })

  it('splits source into lines correctly', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, new_source: 'line1\nline2\nline3' },
      makeCtx(),
    )

    const updated = readNotebook(filePath)
    expect(updated.cells[0].source).toEqual(['line1\n', 'line2\n', 'line3'])
  })

  it('returns error when source is missing', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0 } as any,
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/source.*required/i)
  })
})

// ---------------------------------------------------------------------------
// replace action
// ---------------------------------------------------------------------------

describe('notebookEditTool — replace', () => {
  it('replaces a cell at the given index', async () => {
    const nb = makeNotebook([
      { cell_type: 'code', source: ['old code\n'] },
      { cell_type: 'markdown', source: ['# Old title\n'] },
    ])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_number: 0, cell_type: 'markdown', new_source: '# Replaced' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells).toHaveLength(2)
    expect(updated.cells[0].cell_type).toBe('markdown')
    expect(updated.cells[0].source.join('')).toBe('# Replaced')
  })

  it('returns error when source is missing for replace', async () => {
    const nb = makeNotebook([{ cell_type: 'code', source: ['x\n'] }])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_number: 0 } as any,
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/source.*required/i)
  })
})

// ---------------------------------------------------------------------------
// delete action
// ---------------------------------------------------------------------------

describe('notebookEditTool — delete', () => {
  it('deletes the cell at the given index', async () => {
    const nb = makeNotebook([
      { cell_type: 'code', source: ['keep\n'] },
      { cell_type: 'code', source: ['remove\n'] },
      { cell_type: 'code', source: ['keep2\n'] },
    ])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_number: 1 },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells).toHaveLength(2)
    expect(updated.cells[0].source.join('')).toContain('keep')
    expect(updated.cells[1].source.join('')).toContain('keep2')
  })
})

// ---------------------------------------------------------------------------
// cellIndex bounds checking
// ---------------------------------------------------------------------------

describe('notebookEditTool — bounds checking', () => {
  it('returns error when insert cellIndex exceeds length', async () => {
    const nb = makeNotebook([{ cell_type: 'code', source: ['a\n'] }])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 5, new_source: 'x' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/out of range/)
  })

  it('returns error when replace cellIndex is out of range', async () => {
    const nb = makeNotebook([{ cell_type: 'code', source: ['a\n'] }])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_number: 1, new_source: 'x' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/out of range/)
  })

  it('returns error when delete cellIndex is out of range', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/out of range/)
  })
})

// ---------------------------------------------------------------------------
// cell_id targeting
// ---------------------------------------------------------------------------

describe('notebookEditTool — cell_id', () => {
  it('locates cell by metadata.id', async () => {
    const nb = {
      nbformat: 4,
      nbformat_minor: 2,
      metadata: {},
      cells: [
        { cell_type: 'code', source: ['a\n'], metadata: { id: 'cell-aaa' }, outputs: [], execution_count: null },
        { cell_type: 'code', source: ['b\n'], metadata: { id: 'cell-bbb' }, outputs: [], execution_count: null },
        { cell_type: 'code', source: ['c\n'], metadata: { id: 'cell-ccc' }, outputs: [], execution_count: null },
      ],
    }
    const filePath = writeNotebook('id-test.ipynb', nb as any)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_id: 'cell-bbb', new_source: 'replaced' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells[1].source.join('')).toBe('replaced')
    // Other cells unchanged
    expect(updated.cells[0].source.join('')).toContain('a')
    expect(updated.cells[2].source.join('')).toContain('c')
  })

  it('returns error when both cell_id and cell_number are provided', async () => {
    const nb = makeNotebook([{ cell_type: 'code', source: ['x\n'] }])
    const filePath = writeNotebook('both.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_number: 0, cell_id: 'some-id', new_source: 'y' } as any,
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/either cell_id or cell_number/)
  })

  it('returns error when cell_id is not found', async () => {
    const nb = {
      nbformat: 4,
      nbformat_minor: 2,
      metadata: {},
      cells: [
        { cell_type: 'code', source: ['a\n'], metadata: { id: 'cell-aaa' }, outputs: [], execution_count: null },
      ],
    }
    const filePath = writeNotebook('missing-id.ipynb', nb as any)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_id: 'nonexistent', new_source: 'y' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/no cell found with metadata\.id/)
  })

  it('returns error when neither cell_id nor cell_number is provided', async () => {
    const nb = makeNotebook([{ cell_type: 'code', source: ['x\n'] }])
    const filePath = writeNotebook('neither.ipynb', nb)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete' } as any,
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/either cell_number or cell_id/)
  })

  it('cell_id works for delete', async () => {
    const nb = {
      nbformat: 4,
      nbformat_minor: 2,
      metadata: {},
      cells: [
        { cell_type: 'code', source: ['keep\n'], metadata: { id: 'cell-keep' }, outputs: [], execution_count: null },
        { cell_type: 'code', source: ['remove\n'], metadata: { id: 'cell-remove' }, outputs: [], execution_count: null },
      ],
    }
    const filePath = writeNotebook('delete-by-id.ipynb', nb as any)

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_id: 'cell-remove' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    expect(updated.cells).toHaveLength(1)
    expect(updated.cells[0].metadata.id).toBe('cell-keep')
  })
})

// ---------------------------------------------------------------------------
// Extension validation
// ---------------------------------------------------------------------------

describe('notebookEditTool — extension validation', () => {
  it('rejects non-.ipynb files', async () => {
    const filePath = path.join(tmpDir, 'data.json')
    fs.writeFileSync(filePath, '{}', 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/\.ipynb/)
  })

  it('rejects .py files', async () => {
    const filePath = path.join(tmpDir, 'script.py')
    fs.writeFileSync(filePath, '# python', 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, new_source: 'x' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/\.ipynb/)
  })
})

// ---------------------------------------------------------------------------
// Path traversal prevention
// ---------------------------------------------------------------------------

describe('notebookEditTool — path traversal', () => {
  it('blocks ../ traversal', async () => {
    const result = await notebookEditTool.execute!(
      { notebook_path: '../../../tmp/evil.ipynb', edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('blocks absolute paths outside working directory', async () => {
    const result = await notebookEditTool.execute!(
      { notebook_path: '/etc/secret.ipynb', edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })
})

// ---------------------------------------------------------------------------
// Invalid notebook format
// ---------------------------------------------------------------------------

describe('notebookEditTool — invalid notebook', () => {
  it('rejects non-JSON file', async () => {
    const filePath = path.join(tmpDir, 'bad.ipynb')
    fs.writeFileSync(filePath, 'this is not json', 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/not valid JSON/)
  })

  it('rejects JSON without nbformat field', async () => {
    const filePath = path.join(tmpDir, 'no-format.ipynb')
    fs.writeFileSync(filePath, JSON.stringify({ cells: [] }), 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/nbformat/)
  })

  it('rejects JSON without cells array', async () => {
    const filePath = path.join(tmpDir, 'no-cells.ipynb')
    fs.writeFileSync(filePath, JSON.stringify({ nbformat: 4 }), 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/cells/)
  })
})

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

describe('notebookEditTool — metadata', () => {
  it('has correct read/destructive flags', () => {
    expect(notebookEditTool.isReadOnly).toBe(false)
    expect(notebookEditTool.isDestructive).toBe(false)
  })

  it('requires confirmation', () => {
    expect(notebookEditTool.requiresConfirmation).toBe(true)
  })

  it('has the expected name', () => {
    expect(notebookEditTool.name).toBe('NotebookEdit')
  })
})

// ---------------------------------------------------------------------------
// sourceToLines trailing newline handling
// ---------------------------------------------------------------------------

describe('notebookEditTool — trailing newline', () => {
  it('does not produce trailing empty string from source with trailing newline', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, new_source: 'hello\n' },
      makeCtx(),
    )

    const updated = readNotebook(filePath)
    // "hello\n" should become ["hello\n"], NOT ["hello\n", ""]
    expect(updated.cells[0].source).toEqual(['hello\n'])
  })

  it('handles multi-line source with trailing newline', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, new_source: 'line1\nline2\n' },
      makeCtx(),
    )

    const updated = readNotebook(filePath)
    expect(updated.cells[0].source).toEqual(['line1\n', 'line2\n'])
  })

  it('handles source without trailing newline unchanged', async () => {
    const nb = makeNotebook([])
    const filePath = writeNotebook('test.ipynb', nb)

    await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'insert', cell_number: 0, new_source: 'no trailing' },
      makeCtx(),
    )

    const updated = readNotebook(filePath)
    expect(updated.cells[0].source).toEqual(['no trailing'])
  })
})

// ---------------------------------------------------------------------------
// replace preserves original cell metadata/outputs
// ---------------------------------------------------------------------------

describe('notebookEditTool — replace preserves cell metadata', () => {
  it('preserves metadata, outputs, and execution_count on replace', async () => {
    // Write a notebook with rich cell metadata
    const richNotebook = {
      nbformat: 4,
      nbformat_minor: 2,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          source: ['old_code()\n'],
          metadata: { scrolled: true, tags: ['important'] },
          outputs: [{ output_type: 'stream', name: 'stdout', text: ['hello\n'] }],
          execution_count: 42,
        },
      ],
    }
    const filePath = path.join(tmpDir, 'rich.ipynb')
    fs.writeFileSync(filePath, JSON.stringify(richNotebook, null, 1), 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_number: 0, new_source: 'new_code()' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    const cell = updated.cells[0]
    // Source should be updated
    expect(cell.source.join('')).toBe('new_code()')
    // cell_type should be preserved (no cellType specified, so keeps original)
    expect(cell.cell_type).toBe('code')
    // Metadata, outputs, execution_count should be preserved
    expect(cell.metadata).toEqual({ scrolled: true, tags: ['important'] })
    expect(cell.outputs).toEqual([{ output_type: 'stream', name: 'stdout', text: ['hello\n'] }])
    expect(cell.execution_count).toBe(42)
  })

  it('replace with explicit cellType changes cell_type but preserves other fields', async () => {
    const richNotebook = {
      nbformat: 4,
      nbformat_minor: 2,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          source: ['x = 1\n'],
          metadata: { collapsed: true },
          outputs: [],
          execution_count: 5,
        },
      ],
    }
    const filePath = path.join(tmpDir, 'rich2.ipynb')
    fs.writeFileSync(filePath, JSON.stringify(richNotebook, null, 1), 'utf-8')

    const result = await notebookEditTool.execute!(
      { notebook_path: filePath, edit_mode: 'replace', cell_number: 0, cell_type: 'markdown', new_source: '# Title' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = readNotebook(filePath)
    const cell = updated.cells[0]
    expect(cell.cell_type).toBe('markdown')
    expect(cell.source.join('')).toBe('# Title')
    // metadata preserved even though cell_type changed
    expect(cell.metadata).toEqual({ collapsed: true })
  })
})

// ---------------------------------------------------------------------------
// File not found (ENOENT)
// ---------------------------------------------------------------------------

describe('notebookEditTool — file not found', () => {
  it('returns error when file does not exist', async () => {
    const result = await notebookEditTool.execute!(
      { notebook_path: 'nonexistent.ipynb', edit_mode: 'delete', cell_number: 0 },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/Error editing notebook/)
  })
})

// ---------------------------------------------------------------------------
// builtinTools should not include notebookEditTool
// ---------------------------------------------------------------------------

describe('notebookEditTool — not in builtinTools', () => {
  it('is not included in the builtinTools array', async () => {
    const { builtinTools } = await import('../packages/tools/src/index.ts')
    const names = builtinTools.map((t: any) => t.name)
    expect(names).not.toContain('notebook_edit')
  })

  it('is still available as a named export', async () => {
    const { notebookEditTool: exported } = await import('../packages/tools/src/index.ts')
    expect(exported).toBeDefined()
    expect(exported.name).toBe('NotebookEdit')
  })
})
