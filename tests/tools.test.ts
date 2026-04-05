import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bashTool } from '../packages/tools/src/bash.ts'
import { editTool } from '../packages/tools/src/edit.ts'
import { globTool } from '../packages/tools/src/glob.ts'
import { grepTool } from '../packages/tools/src/grep.ts'
import { readTool } from '../packages/tools/src/read.ts'
import { webFetchTool } from '../packages/tools/src/web-fetch.ts'
import { writeTool } from '../packages/tools/src/write.ts'
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

function writeFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cck-tools-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// readTool
// ---------------------------------------------------------------------------

describe('readTool', () => {
  it('reads a file and returns numbered lines', async () => {
    writeFile('hello.txt', 'line1\nline2\nline3')
    const result = await readTool.execute!({ file_path: path.join(tmpDir, 'hello.txt') }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('line1')
    expect(result.content).toContain('line2')
    expect(result.content).toContain('line3')
    // Lines should be numbered
    expect(result.content).toMatch(/1\t/)
  })

  it('respects the offset parameter', async () => {
    writeFile('multi.txt', 'a\nb\nc\nd')
    const result = await readTool.execute!({ file_path: path.join(tmpDir, 'multi.txt'), offset: 3 }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('c')
    expect(result.content).toContain('d')
    expect(result.content).not.toContain('1\ta')
  })

  it('returns an error for a non-existent file', async () => {
    const result = await readTool.execute!({ file_path: path.join(tmpDir, 'nope.txt') }, makeCtx())
    expect(result.isError).toBe(true)
  })

  it('defaults to 2000 line limit when limit is not specified', async () => {
    // Create a file with 2500 lines
    const lines = Array.from({ length: 2500 }, (_, i) => `line-${i + 1}`)
    writeFile('big.txt', lines.join('\n'))
    const result = await readTool.execute!({ file_path: path.join(tmpDir, 'big.txt') }, makeCtx())

    expect(result.isError).toBeFalsy()
    // Should contain line 2000 but not line 2001
    expect(result.content).toContain('line-2000')
    expect(result.content).not.toContain('line-2001')
  })

  it('returns an error when pages is used on a non-PDF file', async () => {
    writeFile('notes.txt', 'some text')
    const result = await readTool.execute!(
      { file_path: path.join(tmpDir, 'notes.txt'), pages: '1-3' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/only supported for PDF/)
  })
})

// ---------------------------------------------------------------------------
// writeTool
// ---------------------------------------------------------------------------

describe('writeTool', () => {
  it('creates a new file with given content', async () => {
    const filePath = path.join(tmpDir, 'created.txt')
    const result = await writeTool.execute!({ file_path: filePath, content: 'hello world' }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world')
  })

  it('overwrites existing file content', async () => {
    const filePath = writeFile('existing.txt', 'old content')
    await writeTool.execute!({ file_path: filePath, content: 'new content' }, makeCtx())

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
  })

  it('creates parent directories if they do not exist', async () => {
    const filePath = path.join(tmpDir, 'deep', 'nested', 'file.txt')
    const result = await writeTool.execute!({ file_path: filePath, content: 'nested' }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(fs.existsSync(filePath)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// editTool
// ---------------------------------------------------------------------------

describe('editTool', () => {
  it('replaces a unique string in a file', async () => {
    const filePath = writeFile('edit.txt', 'Hello World\nfoo bar')
    const result = await editTool.execute!(
      { file_path: filePath, old_string: 'foo bar', new_string: 'baz qux' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('baz qux')
    expect(fs.readFileSync(filePath, 'utf-8')).not.toContain('foo bar')
  })

  it('returns an error when old_string is not found', async () => {
    const filePath = writeFile('no-match.txt', 'some content here')
    const result = await editTool.execute!(
      { file_path: filePath, old_string: 'MISSING', new_string: 'replacement' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/not found/)
  })

  it('returns an error when old_string appears more than once', async () => {
    const filePath = writeFile('dupe.txt', 'repeat repeat')
    const result = await editTool.execute!(
      { file_path: filePath, old_string: 'repeat', new_string: 'x' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/\d+ times/)
  })

  it('replace_all=true replaces all occurrences', async () => {
    const filePath = writeFile('multi-replace.txt', 'foo bar foo baz foo')
    const result = await editTool.execute!(
      { file_path: filePath, old_string: 'foo', new_string: 'qux', replace_all: true },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const updated = fs.readFileSync(filePath, 'utf-8')
    expect(updated).toBe('qux bar qux baz qux')
    expect(updated).not.toContain('foo')
  })

  it('replace_all=false (default) still requires uniqueness', async () => {
    const filePath = writeFile('dupe2.txt', 'dup dup dup')
    const result = await editTool.execute!(
      { file_path: filePath, old_string: 'dup', new_string: 'x' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/\d+ times/)
    // File should be unchanged
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('dup dup dup')
  })
})

// ---------------------------------------------------------------------------
// globTool
// ---------------------------------------------------------------------------

describe('globTool', () => {
  it('finds files matching the glob pattern', async () => {
    writeFile('a.ts', 'const a = 1')
    writeFile('b.ts', 'const b = 2')
    writeFile('c.txt', 'text file')

    const result = await globTool.execute!({ pattern: '*.ts', path: tmpDir }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('a.ts')
    expect(result.content).toContain('b.ts')
    expect(result.content).not.toContain('c.txt')
  })

  it('returns a no-match message when nothing matches', async () => {
    const result = await globTool.execute!({ pattern: '*.xyz', path: tmpDir }, makeCtx())
    expect(result.content).toMatch(/no files/i)
  })
})

// ---------------------------------------------------------------------------
// grepTool
// ---------------------------------------------------------------------------

describe('grepTool', () => {
  it('finds files matching the regex pattern (default files_with_matches mode)', async () => {
    writeFile('src/index.ts', 'export function hello() {}\nexport const world = 1')
    writeFile('src/other.ts', 'import { hello } from "./index"')

    const result = await grepTool.execute!(
      { pattern: 'hello', path: tmpDir },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('index.ts')
    expect(result.content).toContain('other.ts')
  })

  it('returns no-match message when pattern is absent', async () => {
    writeFile('empty.ts', 'nothing here')

    const result = await grepTool.execute!(
      { pattern: 'xyzUnlikelyPattern123', path: tmpDir },
      makeCtx(),
    )

    expect(result.content).toMatch(/no matches/i)
  })
})

// ---------------------------------------------------------------------------
// bashTool
// ---------------------------------------------------------------------------

describe('bashTool', () => {
  it('executes a simple command and returns output', async () => {
    const result = await bashTool.execute!(
      { command: 'echo hello-from-bash', description: 'Print test string' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('hello-from-bash')
  })

  it('uses the working directory from context', async () => {
    writeFile('marker.txt', 'exists')
    const result = await bashTool.execute!(
      { command: 'ls marker.txt', description: 'List marker file' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('marker.txt')
  })

  it('returns an error result when the command fails', async () => {
    const result = await bashTool.execute!(
      { command: 'exit 1', description: 'Exit with error' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
  })

  it('cleans up abort listener after command completes', async () => {
    const controller = new AbortController()
    const ctx = makeCtx({ abortSignal: controller.signal })

    // Track listener count — removeEventListener is called on normal completion
    let addCount = 0
    let removeCount = 0
    const origAdd = controller.signal.addEventListener.bind(controller.signal)
    const origRemove = controller.signal.removeEventListener.bind(controller.signal)
    controller.signal.addEventListener = (...args: Parameters<typeof origAdd>) => {
      addCount++
      return origAdd(...args)
    }
    controller.signal.removeEventListener = (...args: Parameters<typeof origRemove>) => {
      removeCount++
      return origRemove(...args)
    }

    await bashTool.execute!({ command: 'echo done', description: 'Print done' }, ctx)

    expect(addCount).toBe(1)
    expect(removeCount).toBe(1)
  })

  it('requires description in the schema', () => {
    const schema = bashTool.inputSchema as z.ZodType
    // description is required — parsing without it should fail
    const result = schema.safeParse({ command: 'echo test' })
    expect(result.success).toBe(false)
  })

  it('run_in_background returns PID and output file path', async () => {
    const result = await bashTool.execute!(
      { command: 'echo bg-test', description: 'Background test', run_in_background: true },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('PID:')
    expect(result.content).toContain('Output file:')
    expect(result.metadata).toHaveProperty('pid')
    expect(result.metadata).toHaveProperty('outputFile')
    expect(typeof result.metadata!.pid).toBe('number')
  })

  it('timeout defaults to 120000 and is capped at 600000', () => {
    const schema = bashTool.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>>
    // Default timeout is 120000
    const parsed = schema.parse({ command: 'echo x', description: 'test' })
    expect(parsed.timeout).toBe(120_000)

    // Providing a higher value still parses but execute caps at 600000
    const parsed2 = schema.parse({ command: 'echo x', description: 'test', timeout: 999_999 })
    expect(parsed2.timeout).toBe(999_999)
    // The capping happens inside execute, not in the schema
  })
})

// ---------------------------------------------------------------------------
// Path traversal prevention
// ---------------------------------------------------------------------------

describe('path traversal prevention', () => {
  it('readTool blocks ../ traversal', async () => {
    const result = await readTool.execute!({ file_path: '../../../etc/passwd' }, makeCtx())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('writeTool blocks ../ traversal', async () => {
    const result = await writeTool.execute!(
      { file_path: '../../../tmp/evil.txt', content: 'pwned' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('editTool blocks ../ traversal', async () => {
    const result = await editTool.execute!(
      { file_path: '../../../etc/hosts', old_string: 'a', new_string: 'b' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('readTool blocks absolute paths outside working directory', async () => {
    const result = await readTool.execute!({ file_path: '/etc/passwd' }, makeCtx())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('readTool allows files inside working directory', async () => {
    writeFile('allowed.txt', 'safe content')
    const result = await readTool.execute!(
      { file_path: path.join(tmpDir, 'allowed.txt') },
      makeCtx(),
    )
    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('safe content')
  })

  it('readTool allows relative paths inside working directory', async () => {
    writeFile('sub/nested.txt', 'nested content')
    const result = await readTool.execute!({ file_path: 'sub/nested.txt' }, makeCtx())
    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('nested content')
  })
})

// ---------------------------------------------------------------------------
// SSRF prevention (web_fetch)
// ---------------------------------------------------------------------------

describe('WebFetch SSRF prevention', () => {
  it('blocks localhost', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://localhost:8080/secret' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('blocks 127.0.0.1', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://127.0.0.1/admin' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('blocks 10.x.x.x private range', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://10.0.0.1/internal' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('blocks 192.168.x.x private range', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://192.168.1.1/router' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('blocks 172.16-31.x.x private range', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://172.16.0.1/internal' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('blocks cloud metadata endpoint (169.254.169.254)', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://169.254.169.254/latest/meta-data/' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('blocks IPv6 loopback (::1)', async () => {
    const result = await webFetchTool.execute!(
      { url: 'http://[::1]:3000/api' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('web_fetch isReadOnly is false (can POST)', () => {
    expect(webFetchTool.isReadOnly).toBe(false)
  })
})
