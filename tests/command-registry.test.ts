import { describe, expect, it } from 'vitest'
import { CommandRegistry, createCommandRegistry } from '../packages/ui/src/commands/registry.ts'
import type { Command, LocalCommand } from '../packages/ui/src/commands/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLocalCommand(partial: Partial<LocalCommand> & { name: string }): LocalCommand {
  return {
    type: 'local',
    description: 'test command',
    execute: async () => ({ type: 'skip' }),
    ...partial,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandRegistry', () => {
  // 1. Register and retrieve a command
  it('registers a command and retrieves it by name', () => {
    const registry = new CommandRegistry()
    const cmd = makeLocalCommand({ name: 'hello' })
    registry.register(cmd)

    expect(registry.get('hello')).toBe(cmd)
  })

  // 2. Aliases
  it('registers aliases and retrieves command via alias', () => {
    const registry = new CommandRegistry()
    const cmd = makeLocalCommand({ name: 'clear', aliases: ['cls', 'clr'] })
    registry.register(cmd)

    expect(registry.get('cls')).toBe(cmd)
    expect(registry.get('clr')).toBe(cmd)
  })

  // 3. getAll deduplicates aliases
  it('getAll returns each command only once even with aliases', () => {
    const registry = new CommandRegistry()
    const cmd = makeLocalCommand({ name: 'clear', aliases: ['cls'] })
    registry.register(cmd)

    const all = registry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]).toBe(cmd)
  })

  // 4. parse returns command + args
  it('parse extracts command and trailing args', () => {
    const registry = new CommandRegistry()
    const cmd = makeLocalCommand({ name: 'help' })
    registry.register(cmd)

    const result = registry.parse('/help topic123')
    expect(result).not.toBeNull()
    expect(result!.command).toBe(cmd)
    expect(result!.args).toBe('topic123')
  })

  // 5. parse returns null for unknown commands
  it('parse returns null for an unregistered command', () => {
    const registry = new CommandRegistry()
    expect(registry.parse('/unknown')).toBeNull()
  })

  // 6. parse returns null for non-slash input
  it('parse returns null when input does not start with /', () => {
    const registry = new CommandRegistry()
    expect(registry.parse('hello')).toBeNull()
  })

  // 7. parse strips args correctly when no trailing text
  it('parse sets empty args when no arguments provided', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'exit' }))
    const result = registry.parse('/exit')
    expect(result!.args).toBe('')
  })

  // 8. getSuggestions filters by prefix
  it('getSuggestions returns commands matching the partial prefix', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'help' }))
    registry.register(makeLocalCommand({ name: 'history' }))
    registry.register(makeLocalCommand({ name: 'exit' }))

    const suggestions = registry.getSuggestions('/h')
    const names = suggestions.map((c) => c.name)
    expect(names).toContain('help')
    expect(names).toContain('history')
    expect(names).not.toContain('exit')
  })

  // 9. getSuggestions returns empty array for non-slash partial
  it('getSuggestions returns empty array for non-slash prefix', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'help' }))
    expect(registry.getSuggestions('hel')).toEqual([])
  })

  // 10. getVisible excludes hidden commands
  it('getVisible excludes hidden commands', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'visible' }))
    registry.register(makeLocalCommand({ name: 'secret', isHidden: true }))

    const names = registry.getVisible().map((c) => c.name)
    expect(names).toContain('visible')
    expect(names).not.toContain('secret')
  })

  // 11. getVisible excludes disabled commands
  it('getVisible excludes disabled commands', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'enabled' }))
    registry.register(makeLocalCommand({ name: 'disabled', isEnabled: () => false }))

    const names = registry.getVisible().map((c) => c.name)
    expect(names).toContain('enabled')
    expect(names).not.toContain('disabled')
  })

  // 12. parse returns null for disabled command
  it('parse returns null when a command is disabled', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'off', isEnabled: () => false }))
    expect(registry.parse('/off')).toBeNull()
  })

  // 13. createCommandRegistry factory
  it('createCommandRegistry registers initial commands', () => {
    const cmds: Command[] = [
      makeLocalCommand({ name: 'exit' }),
      makeLocalCommand({ name: 'help' }),
    ]
    const registry = createCommandRegistry(cmds)
    expect(registry.get('exit')).toBeDefined()
    expect(registry.get('help')).toBeDefined()
  })

  // 14. getSuggestions matches aliases
  it('getSuggestions includes commands whose alias matches', () => {
    const registry = new CommandRegistry()
    registry.register(makeLocalCommand({ name: 'clear', aliases: ['cls'] }))

    const suggestions = registry.getSuggestions('/cl')
    const names = suggestions.map((c) => c.name)
    expect(names).toContain('clear')
  })
})
