import { describe, expect, it } from 'vitest'
import { AuthRegistry } from '../packages/agent/src/auth/registry.ts'
import { MemoryAuthStorage } from '../packages/agent/src/auth/storage.ts'
import type { AuthMethod, ProviderRegistration } from '../packages/agent/src/auth/types.ts'
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
    displayName: 'Test Provider',
    authMethods: [
      { type: 'api-key', envVar },
    ],
    createProvider: ({ apiKey }) => makeStubProvider(apiKey ?? 'no-key'),
  }
}

function makeMultiMethodRegistration(): ProviderRegistration {
  return {
    displayName: 'Multi-Method Provider',
    description: 'Supports both API key and base-url-key',
    authMethods: [
      { type: 'api-key', envVar: 'MULTI_PROVIDER_KEY', inputLabel: 'API Key' },
      { type: 'base-url-key', defaultBaseURL: 'http://localhost:8080/v1', inputLabel: 'Custom endpoint' },
    ],
    models: ['model-a', 'model-b'],
    defaultModel: 'model-a',
    createProvider: ({ apiKey, baseURL }) =>
      makeStubProvider(`${apiKey ?? 'x'}@${baseURL ?? 'default'}`),
  }
}

function makeNoneRegistration(): ProviderRegistration {
  return {
    displayName: 'Local Provider',
    authMethods: [{ type: 'none' }],
    models: ['llama3.1', 'mistral'],
    defaultModel: 'llama3.1',
    createProvider: () => makeStubProvider('local'),
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
    registry.register('local', makeNoneRegistration())

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

// ---------------------------------------------------------------------------
// New tests for multi-method, models, and interactive flow
// ---------------------------------------------------------------------------

describe('AuthRegistry — multi-method auth', () => {
  it('authenticate tries multiple auth methods in order', async () => {
    const envVar = 'MULTI_PROVIDER_KEY_TEST_8821'
    process.env[envVar] = 'multi-key'

    try {
      const registry = makeRegistryWithMemory()
      registry.register('multi', makeMultiMethodRegistration())
      // Override the envVar to match our test var
      const reg = registry.getRegistration('multi')!
      ;(reg.authMethods[0] as { envVar?: string }).envVar = envVar

      const provider = await registry.authenticate('multi')
      expect(provider).toBeDefined()
    } finally {
      delete process.env[envVar]
    }
  })

  it('authenticate falls back to second method if first has no env var', async () => {
    const storage = new MemoryAuthStorage()
    await storage.set('multi', 'stored-key')

    const registry = new AuthRegistry({ storage })
    registry.register('multi', {
      displayName: 'Multi',
      authMethods: [
        { type: 'api-key' }, // no envVar, no stored cred under this method
        { type: 'base-url-key', defaultBaseURL: 'http://localhost:8080/v1' },
      ],
      createProvider: ({ apiKey }) => makeStubProvider(apiKey ?? 'fallback'),
    })

    const provider = await registry.authenticate('multi')
    expect(provider).toBeDefined()
  })
})

describe('AuthRegistry — getModels', () => {
  it('returns models for a registered provider', () => {
    const registry = makeRegistryWithMemory()
    registry.register('multi', makeMultiMethodRegistration())

    const models = registry.getModels('multi')
    expect(models).toEqual(['model-a', 'model-b'])
  })

  it('returns empty array if no models defined', () => {
    const registry = makeRegistryWithMemory()
    registry.register('simple', makeRegistration())

    const models = registry.getModels('simple')
    expect(models).toEqual([])
  })

  it('throws for unregistered provider', () => {
    const registry = makeRegistryWithMemory()
    expect(() => registry.getModels('nope')).toThrow(/not registered/)
  })
})

describe('AuthRegistry — interactive flow', () => {
  it('interactive() returns initial state with provider list', () => {
    const registry = makeRegistryWithMemory()
    registry.register('a', makeRegistration())
    registry.register('b', makeNoneRegistration())

    const state = registry.interactive()
    expect(state.step).toBe('select-provider')
    expect(state.providers).toHaveLength(2)
    expect(state.providers![0].name).toBe('a')
    expect(state.providers![1].name).toBe('b')
  })

  it('selectProvider skips to input-credentials for single api-key method', () => {
    const registry = makeRegistryWithMemory()
    registry.register('single', makeRegistration())

    const state = registry.selectProvider('single')
    expect(state.step).toBe('input-credentials')
    expect(state.currentProvider).toBe('single')
  })

  it('selectProvider skips to select-model for none method with models', () => {
    const registry = makeRegistryWithMemory()
    registry.register('local', makeNoneRegistration())

    const state = registry.selectProvider('local')
    expect(state.step).toBe('select-model')
    expect(state.models).toEqual(['llama3.1', 'mistral'])
    expect(state.currentModel).toBe('llama3.1')
  })

  it('selectProvider shows auth methods when provider has multiple', () => {
    const registry = makeRegistryWithMemory()
    registry.register('multi', makeMultiMethodRegistration())

    const state = registry.selectProvider('multi')
    expect(state.step).toBe('select-auth-method')
    expect(state.authMethods).toHaveLength(2)
    expect(state.authMethods![0].type).toBe('api-key')
    expect(state.authMethods![1].type).toBe('base-url-key')
  })

  it('selectAuthMethod moves to input-credentials for api-key', () => {
    const registry = makeRegistryWithMemory()
    registry.register('multi', makeMultiMethodRegistration())

    const state = registry.selectAuthMethod('multi', 0)
    expect(state.step).toBe('input-credentials')
    expect(state.currentAuthMethod!.type).toBe('api-key')
  })

  it('inputCredentials stores key and moves to select-model', async () => {
    const registry = makeRegistryWithMemory()
    registry.register('multi', makeMultiMethodRegistration())

    const method: AuthMethod = { type: 'api-key', envVar: 'X' }
    const state = await registry.inputCredentials('multi', method, { apiKey: 'test-key' })

    expect(state.step).toBe('select-model')
    expect(state.models).toEqual(['model-a', 'model-b'])
  })

  it('selectModel returns done state with configured provider', async () => {
    const registry = makeRegistryWithMemory()
    await registry.storeCredential('multi', 'stored-key')
    registry.register('multi', makeMultiMethodRegistration())

    const method: AuthMethod = { type: 'api-key' }
    const state = await registry.selectModel('multi', method, 'model-b')

    expect(state.step).toBe('done')
    expect(state.result).toBeDefined()
    expect(state.result!.model).toBe('model-b')
    expect(state.result!.providerName).toBe('multi')
    expect(state.result!.provider).toBeDefined()
  })

  it('full interactive flow: none provider → select-model → done', async () => {
    const registry = makeRegistryWithMemory()
    registry.register('local', makeNoneRegistration())

    // Step 1: interactive
    const s1 = registry.interactive()
    expect(s1.step).toBe('select-provider')

    // Step 2: select provider
    const s2 = registry.selectProvider('local')
    expect(s2.step).toBe('select-model')

    // Step 3: select model
    const s3 = await registry.selectModel('local', { type: 'none' }, 'mistral')
    expect(s3.step).toBe('done')
    expect(s3.result!.model).toBe('mistral')
    expect(s3.result!.provider).toBeDefined()
  })

  it('selectProvider returns done directly for none provider without models', () => {
    const registry = makeRegistryWithMemory()
    registry.register('bare', {
      displayName: 'Bare',
      authMethods: [{ type: 'none' }],
      createProvider: () => makeStubProvider('bare'),
    })

    const state = registry.selectProvider('bare')
    expect(state.step).toBe('done')
    expect(state.result).toBeDefined()
    expect(state.result!.provider).toBeDefined()
  })
})
