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
    const result = await readTool.execute!({ path: path.join(tmpDir, 'hello.txt') }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('line1')
    expect(result.content).toContain('line2')
    expect(result.content).toContain('line3')
    // Lines should be numbered
    expect(result.content).toMatch(/1\t/)
  })

  it('respects the offset parameter', async () => {
    writeFile('multi.txt', 'a\nb\nc\nd')
    const result = await readTool.execute!({ path: path.join(tmpDir, 'multi.txt'), offset: 3 }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('c')
    expect(result.content).toContain('d')
    expect(result.content).not.toContain('1\ta')
  })

  it('returns an error for a non-existent file', async () => {
    const result = await readTool.execute!({ path: path.join(tmpDir, 'nope.txt') }, makeCtx())
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// writeTool
// ---------------------------------------------------------------------------

describe('writeTool', () => {
  it('creates a new file with given content', async () => {
    const filePath = path.join(tmpDir, 'created.txt')
    const result = await writeTool.execute!({ path: filePath, content: 'hello world' }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world')
  })

  it('overwrites existing file content', async () => {
    const filePath = writeFile('existing.txt', 'old content')
    await writeTool.execute!({ path: filePath, content: 'new content' }, makeCtx())

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
  })

  it('creates parent directories if they do not exist', async () => {
    const filePath = path.join(tmpDir, 'deep', 'nested', 'file.txt')
    const result = await writeTool.execute!({ path: filePath, content: 'nested' }, makeCtx())

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
      { path: filePath, oldString: 'foo bar', newString: 'baz qux' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('baz qux')
    expect(fs.readFileSync(filePath, 'utf-8')).not.toContain('foo bar')
  })

  it('returns an error when oldString is not found', async () => {
    const filePath = writeFile('no-match.txt', 'some content here')
    const result = await editTool.execute!(
      { path: filePath, oldString: 'MISSING', newString: 'replacement' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/not found/)
  })

  it('returns an error when oldString appears more than once', async () => {
    const filePath = writeFile('dupe.txt', 'repeat repeat')
    const result = await editTool.execute!(
      { path: filePath, oldString: 'repeat', newString: 'x' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/\d+ times/)
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

    const result = await globTool.execute!({ pattern: '*.ts', cwd: tmpDir }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('a.ts')
    expect(result.content).toContain('b.ts')
    expect(result.content).not.toContain('c.txt')
  })

  it('returns a no-match message when nothing matches', async () => {
    const result = await globTool.execute!({ pattern: '*.xyz', cwd: tmpDir }, makeCtx())
    expect(result.content).toMatch(/no files/i)
  })
})

// ---------------------------------------------------------------------------
// grepTool
// ---------------------------------------------------------------------------

describe('grepTool', () => {
  it('finds lines matching the regex pattern', async () => {
    writeFile('src/index.ts', 'export function hello() {}\nexport const world = 1')
    writeFile('src/other.ts', 'import { hello } from "./index"')

    const result = await grepTool.execute!(
      { pattern: 'hello', path: tmpDir },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('hello')
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
      { command: 'echo hello-from-bash' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('hello-from-bash')
  })

  it('uses the working directory from context', async () => {
    writeFile('marker.txt', 'exists')
    const result = await bashTool.execute!(
      { command: 'ls marker.txt' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('marker.txt')
  })

  it('returns an error result when the command fails', async () => {
    const result = await bashTool.execute!(
      { command: 'exit 1' },
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

    await bashTool.execute!({ command: 'echo done' }, ctx)

    expect(addCount).toBe(1)
    expect(removeCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Path traversal prevention
// ---------------------------------------------------------------------------

describe('path traversal prevention', () => {
  it('readTool blocks ../ traversal', async () => {
    const result = await readTool.execute!({ path: '../../../etc/passwd' }, makeCtx())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('writeTool blocks ../ traversal', async () => {
    const result = await writeTool.execute!(
      { path: '../../../tmp/evil.txt', content: 'pwned' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('editTool blocks ../ traversal', async () => {
    const result = await editTool.execute!(
      { path: '../../../etc/hosts', oldString: 'a', newString: 'b' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('readTool blocks absolute paths outside working directory', async () => {
    const result = await readTool.execute!({ path: '/etc/passwd' }, makeCtx())
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/path traversal denied/)
  })

  it('readTool allows files inside working directory', async () => {
    writeFile('allowed.txt', 'safe content')
    const result = await readTool.execute!(
      { path: path.join(tmpDir, 'allowed.txt') },
      makeCtx(),
    )
    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('safe content')
  })

  it('readTool allows relative paths inside working directory', async () => {
    writeFile('sub/nested.txt', 'nested content')
    const result = await readTool.execute!({ path: 'sub/nested.txt' }, makeCtx())
    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('nested content')
  })
})

// ---------------------------------------------------------------------------
// SSRF prevention (web_fetch)
// ---------------------------------------------------------------------------

describe('web_fetch SSRF prevention', () => {
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
