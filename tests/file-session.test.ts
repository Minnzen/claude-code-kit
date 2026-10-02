import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSession, FileSessionStore } from '../packages/agent/src/session/file.ts'
import type { Message } from '../packages/agent/src/types.ts'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'cck-file-session-')) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

describe('FileSession persistence', () => {
  it('round-trips save, append, reload, and subsequent appends', async () => {
    const first: Message = { role: 'user', content: 'first\nline' }
    const second: Message = { role: 'assistant', content: 'second' }
    const third: Message = { role: 'user', content: 'third' }
    const session = new FileSession(directory, 'round-trip')
    session.setMessages([first])
    await session.save()
    await session.append(second)
    const reloaded = await new FileSession(directory, 'round-trip').load()
    expect(reloaded.getMessages()).toEqual([first, second])
    await reloaded.append(third)
    expect((await new FileSession(directory, 'round-trip').load()).getMessages()).toEqual([first, second, third])
  })

  it('appends to legacy JSONL without a final newline', async () => {
    await writeFile(join(directory, 'legacy.jsonl'), '{"role":"user","content":"old"}')
    const session = await new FileSession(directory, 'legacy').load()
    await session.append({ role: 'assistant', content: 'new' })
    expect((await new FileSession(directory, 'legacy').load()).getMessages()).toEqual([
      { role: 'user', content: 'old' }, { role: 'assistant', content: 'new' },
    ])
  })

  it('keeps setMessages and clear in memory until save is called', async () => {
    const session = new FileSession(directory, 'explicit')
    session.setMessages([{ role: 'user', content: 'saved' }])
    await session.save()
    session.clear()
    expect((await new FileSession(directory, 'explicit').load()).getMessages()).toEqual([{ role: 'user', content: 'saved' }])
    await session.save()
    expect((await new FileSession(directory, 'explicit').load()).getMessages()).toEqual([])
  })
})

describe('FileSessionStore errors and boundaries', () => {
  it('returns null only when the requested session is missing', async () => {
    const store = new FileSessionStore(directory)
    expect(await store.load('missing')).toBeNull()
    const session = store.create('empty')
    await store.save('empty', session)
    expect((await store.load('empty'))?.getMessages()).toEqual([])
  })

  it('surfaces malformed JSON instead of treating corruption as a missing session', async () => {
    await writeFile(join(directory, 'broken.jsonl'), '{invalid JSON}\n')
    await expect(new FileSessionStore(directory).load('broken')).rejects.toThrow()
  })

  it('surfaces filesystem errors instead of treating them as a missing session', async () => {
    await mkdir(join(directory, 'blocked.jsonl'))
    await expect(new FileSessionStore(directory).load('blocked')).rejects.toThrow()
  })

  it.each(['', '../outside', 'nested/id', 'nested\\id', '.', '..', 'bad\u0000id'])('rejects unsafe id %j', async (id) => {
    expect(() => new FileSession(directory, id)).toThrow(/session id/i)
    const store = new FileSessionStore(directory)
    expect(() => store.create(id)).toThrow(/session id/i)
    await expect(store.load(id)).rejects.toThrow(/session id/i)
    await expect(store.delete(id)).rejects.toThrow(/session id/i)
  })

  it.each([undefined, null, 123])('rejects a non-string session id %j', (id) => {
    expect(() => new FileSession(directory, id as unknown as string)).toThrow(/session id/i)
  })

  it('rejects session file symlinks during reads and writes', async () => {
    const sessionDirectory = join(directory, 'sessions')
    await mkdir(sessionDirectory)
    const outside = join(directory, 'outside.txt')
    await writeFile(outside, 'untouched')
    await symlink(outside, join(sessionDirectory, 'linked.jsonl'))
    const session = new FileSession(sessionDirectory, 'linked')
    session.setMessages([{ role: 'user', content: 'overwrite' }])
    await expect(session.load()).rejects.toThrow()
    await expect(session.save()).rejects.toThrow()
    await expect(session.append({ role: 'assistant', content: 'append' })).rejects.toThrow()
    expect(await readFile(outside, 'utf8')).toBe('untouched')
    expect(await new FileSessionStore(sessionDirectory).list()).toEqual([])
  })

  it('rejects a configured directory symlink when it is redirected after opening', async () => {
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    const link = join(directory, 'sessions')
    await mkdir(first)
    await mkdir(second)
    await writeFile(join(first, 'pinned.jsonl'), '{"role":"user","content":"first"}\n')
    await writeFile(join(second, 'pinned.jsonl'), '{"role":"user","content":"second"}\n')
    await symlink(first, link)
    const session = await new FileSession(link, 'pinned').load()
    await rm(link)
    await symlink(second, link)
    await expect(session.append({ role: 'assistant', content: 'overwrite' })).rejects.toThrow(/directory changed/i)
    expect(await readFile(join(second, 'pinned.jsonl'), 'utf8')).toBe('{"role":"user","content":"second"}\n')
  })
})
