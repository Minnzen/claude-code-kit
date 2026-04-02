import { describe, expect, it } from 'vitest'
import { AuthRegistry } from '../packages/agent/src/auth/registry.ts'
import { MemoryAuthStorage } from '../packages/agent/src/auth/storage.ts'
import type { ProviderRegistration } from '../packages/agent/src/auth/types.ts'
import type { LLMProvider } from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal stub that satisfies the LLMProvider interface */
function makeStubProvider(label: string): LLMProvider {
  return {
    async *chat() {
      yield { type: 'text' as const, text: label }
      yield { type: 'done' as const }
    },
  }
}

function makeRegistration(envVar?: string): ProviderRegistration {
  return {
    type: 'api-key',
    displayName: 'Test Provider',
    envVar,
    createProvider: (credential) => makeStubProvider(credential),
  }
}

function makeRegistryWithMemory(): AuthRegistry {
  return new AuthRegistry({ storage: new MemoryAuthStorage() })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthRegistry', () => {
  // 1. Register and retrieve a provider registration
  it('registers a provider and retrieves it via getRegistration', () => {
    const registry = makeRegistryWithMemory()
    const reg = makeRegistration()
    registry.register('test', reg)

    expect(registry.getRegistration('test')).toBe(reg)
  })

  // 2. Overwriting registration (open registry allows overwrite)
  it('allows overwriting a provider registration', () => {
    const registry = makeRegistryWithMemory()
    registry.register('provider', makeRegistration())
    const newReg = makeRegistration('NEW_KEY')
    registry.register('provider', newReg)

    expect(registry.getRegistration('provider')).toBe(newReg)
  })

  // 3. unregister removes provider
  it('unregister removes a registered provider', () => {
    const registry = makeRegistryWithMemory()
    registry.register('gone', makeRegistration())

    expect(registry.unregister('gone')).toBe(true)
    expect(registry.getRegistration('gone')).toBeUndefined()
  })

  // 4. unregister returns false for unknown provider
  it('unregister returns false for an unregistered provider', () => {
    const registry = makeRegistryWithMemory()
    expect(registry.unregister('ghost')).toBe(false)
  })

  // 5. authenticate with stored credential
  it('authenticate uses the stored credential when no env var is set', async () => {
    const storage = new MemoryAuthStorage()
    await storage.set('myProvider', 'secret-key-123')

    const registry = new AuthRegistry({ storage })
    registry.register('myProvider', makeRegistration())

    const provider = await registry.authenticate('myProvider')
    expect(provider).toBeDefined()
  })

  // 6. authenticate reads from env var
  it('authenticate uses environment variable when set', async () => {
    const envVar = 'TEST_PROVIDER_KEY_UNIQUE_12345'
    process.env[envVar] = 'env-api-key'

    try {
      const registry = makeRegistryWithMemory()
      registry.register('envProvider', makeRegistration(envVar))

      const provider = await registry.authenticate('envProvider')
      expect(provider).toBeDefined()
    } finally {
      delete process.env[envVar]
    }
  })

  // 7. fromEnv reads env var directly
  it('fromEnv returns a provider when the env var is set', () => {
    const envVar = 'FROM_ENV_PROVIDER_KEY_12345'
    process.env[envVar] = 'from-env-key'

    try {
      const registry = makeRegistryWithMemory()
      registry.register('fromEnvProvider', makeRegistration(envVar))

      const provider = registry.fromEnv('fromEnvProvider')
      expect(provider).toBeDefined()
    } finally {
      delete process.env[envVar]
    }
  })

  // 8. fromEnv throws when env var is not set
  it('fromEnv throws when the env var is not set', () => {
    const registry = makeRegistryWithMemory()
    registry.register('missing', makeRegistration('DEFINITELY_UNSET_VAR_XYZ'))

    expect(() => registry.fromEnv('missing')).toThrow(/DEFINITELY_UNSET_VAR_XYZ/)
  })

  // 9. authenticate throws for unregistered provider
  it('authenticate throws for an unregistered provider', async () => {
    const registry = makeRegistryWithMemory()
    await expect(registry.authenticate('nobody')).rejects.toThrow(/not registered/)
  })

  // 10. storeCredential + authenticate uses the credential
  it('storeCredential stores and authenticate retrieves the credential', async () => {
    const registry = makeRegistryWithMemory()
    registry.register('myProv', makeRegistration())
    await registry.storeCredential('myProv', 'stored-secret')

    // Should not throw (credential now available)
    const provider = await registry.authenticate('myProv')
    expect(provider).toBeDefined()
  })

  // 11. logout removes stored credential
  it('logout removes stored credential so authenticate throws', async () => {
    const storage = new MemoryAuthStorage()
    const registry = new AuthRegistry({ storage })
    registry.register('logoutMe', makeRegistration())

    await storage.set('logoutMe', 'stored-cred')
    await registry.logout('logoutMe')

    await expect(registry.authenticate('logoutMe')).rejects.toThrow(/No credential/)
  })

  // 12. type 'none' provider authenticates without credential
  it('authenticate succeeds for type:none provider without any credential', async () => {
    const registry = makeRegistryWithMemory()
    const noneReg: ProviderRegistration = {
      type: 'none',
      displayName: 'Local Provider',
      createProvider: () => makeStubProvider('local'),
    }
    registry.register('local', noneReg)

    const provider = await registry.authenticate('local')
    expect(provider).toBeDefined()
  })

  // 13. listProviders includes registered providers
  it('listProviders returns all registered providers', async () => {
    const registry = makeRegistryWithMemory()
    registry.register('p1', makeRegistration())
    registry.register('p2', makeRegistration())

    const list = await registry.listProviders()
    const names = list.map((p) => p.name)
    expect(names).toContain('p1')
    expect(names).toContain('p2')
  })
})
