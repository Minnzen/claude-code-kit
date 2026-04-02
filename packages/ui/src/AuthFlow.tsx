import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from '@claude-code-kit/ink-renderer'
import type {
  AuthRegistry,
  AuthFlowState,
  AuthMethod,
  LLMProvider,
} from '@claude-code-kit/agent'
import { Select, type SelectOption } from './Select'
import { Divider } from './Divider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthFlowUIProps = {
  auth: AuthRegistry
  onComplete: (provider: LLMProvider, providerName: string, model: string) => void
  onCancel?: () => void
  title?: string
}

type FlowPhase =
  | { type: 'select-provider' }
  | { type: 'input-credentials'; providerName: string; method: AuthMethod; needsBaseURL: boolean }
  | { type: 'select-model'; providerName: string; method: AuthMethod; models: string[]; defaultModel?: string }
  | { type: 'done' }

// ---------------------------------------------------------------------------
// Credential input sub-component (simple text input with masking support)
// ---------------------------------------------------------------------------

function CredentialInput({
  label,
  masked,
  onSubmit,
  onCancel,
}: {
  label: string
  masked?: boolean
  onSubmit: (value: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.()
      return
    }
    if (key.return) {
      if (value.length > 0) onSubmit(value)
      return
    }
    if (key.backspace) {
      if (cursor > 0) {
        setValue(v => v.slice(0, cursor - 1) + v.slice(cursor))
        setCursor(c => c - 1)
      }
      return
    }
    if (key.leftArrow) {
      setCursor(c => Math.max(0, c - 1))
      return
    }
    if (key.rightArrow) {
      setCursor(c => Math.min(value.length, c + 1))
      return
    }
    if (key.ctrl || key.meta) return
    if (input.length > 0) {
      setValue(v => v.slice(0, cursor) + input + v.slice(cursor))
      setCursor(c => c + input.length)
    }
  })

  const display = masked ? '*'.repeat(value.length) : value
  const before = display.slice(0, cursor)
  const at = cursor < display.length ? display[cursor]! : ' '
  const after = cursor < display.length ? display.slice(cursor + 1) : ''

  return (
    <Box flexDirection="column">
      <Text bold>{label}</Text>
      <Box>
        <Text color="cyan">{'> '}</Text>
        <Text>{before}<Text inverse>{at}</Text>{after}</Text>
      </Box>
      {value.length === 0 && (
        <Text dimColor>  Type your credential and press Enter</Text>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// AuthFlowUI — main component
// ---------------------------------------------------------------------------

export function AuthFlowUI({
  auth,
  onComplete,
  onCancel,
  title = 'Authentication',
}: AuthFlowUIProps): React.ReactNode {
  const [phase, setPhase] = useState<FlowPhase>({ type: 'select-provider' })
  const [baseURL, setBaseURL] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  // Build provider options from the auth registry
  const flowState = auth.interactive()
  const providerOptions: SelectOption<string>[] = (flowState.providers ?? []).map(p => ({
    value: p.name,
    label: `${p.displayName}`,
    description: p.description,
  }))

  // --- Handlers ---

  const handleProviderSelect = useCallback((providerName: string) => {
    setError(undefined)
    try {
      const state = auth.selectProvider(providerName)

      if (state.step === 'done' && state.result) {
        onComplete(state.result.provider, state.result.providerName, state.result.model)
        setPhase({ type: 'done' })
        return
      }

      if (state.step === 'input-credentials' && state.currentAuthMethod) {
        const method = state.currentAuthMethod
        const needsBaseURL = method.type === 'base-url-key' && !method.defaultBaseURL
        setPhase({
          type: 'input-credentials',
          providerName,
          method,
          needsBaseURL,
        })
        return
      }

      if (state.step === 'select-model' && state.models) {
        setPhase({
          type: 'select-model',
          providerName,
          method: state.currentAuthMethod!,
          models: state.models,
          defaultModel: state.currentModel,
        })
        return
      }

      // select-auth-method: for simplicity, use the first auth method
      if (state.step === 'select-auth-method' && state.authMethods) {
        const method = state.authMethods[0]!
        const needsBaseURL = method.type === 'base-url-key' && !('defaultBaseURL' in method && method.defaultBaseURL)
        setPhase({
          type: 'input-credentials',
          providerName,
          method,
          needsBaseURL: needsBaseURL && method.type === 'base-url-key',
        })
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [auth, onComplete])

  const handleBaseURLSubmit = useCallback((url: string) => {
    setBaseURL(url)
  }, [])

  const handleCredentialSubmit = useCallback(async (apiKey: string) => {
    if (phase.type !== 'input-credentials') return
    setError(undefined)

    try {
      const credentials = {
        apiKey,
        baseURL: baseURL || (phase.method.type === 'base-url-key' ? phase.method.defaultBaseURL : undefined),
      }
      const state = await auth.inputCredentials(phase.providerName, phase.method, credentials)

      if (state.step === 'done' && state.result) {
        onComplete(state.result.provider, state.result.providerName, state.result.model)
        setPhase({ type: 'done' })
        return
      }

      if (state.step === 'select-model' && state.models) {
        setPhase({
          type: 'select-model',
          providerName: phase.providerName,
          method: phase.method,
          models: state.models,
          defaultModel: state.currentModel,
        })
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [auth, phase, baseURL, onComplete])

  const handleModelSelect = useCallback(async (model: string) => {
    if (phase.type !== 'select-model') return
    setError(undefined)

    try {
      const state = await auth.selectModel(phase.providerName, phase.method, model)
      if (state.step === 'done' && state.result) {
        onComplete(state.result.provider, state.result.providerName, state.result.model)
        setPhase({ type: 'done' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [auth, phase, onComplete])

  const handleCancel = useCallback(() => {
    if (phase.type === 'select-provider') {
      onCancel?.()
    } else {
      setPhase({ type: 'select-provider' })
      setBaseURL(undefined)
      setError(undefined)
    }
  }, [phase, onCancel])

  // --- Render ---

  if (phase.type === 'done') {
    return null
  }

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={1}>
      <Box marginBottom={1}>
        <Text bold color="#DA7756">{title}</Text>
      </Box>
      <Divider />

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        {phase.type === 'select-provider' && (
          <Select
            title="Select a provider:"
            options={providerOptions}
            onChange={handleProviderSelect}
            onCancel={handleCancel}
          />
        )}

        {phase.type === 'input-credentials' && phase.method.type === 'base-url-key' && phase.needsBaseURL && !baseURL && (
          <CredentialInput
            label="Enter Base URL:"
            masked={false}
            onSubmit={handleBaseURLSubmit}
            onCancel={handleCancel}
          />
        )}

        {phase.type === 'input-credentials' &&
          !(phase.method.type === 'base-url-key' && phase.needsBaseURL && !baseURL) && (
          <CredentialInput
            label={
              (phase.method.type === 'api-key' || phase.method.type === 'base-url-key')
                ? (phase.method.inputLabel ?? 'Enter API Key:')
                : 'Enter API Key:'
            }
            masked
            onSubmit={handleCredentialSubmit}
            onCancel={handleCancel}
          />
        )}

        {phase.type === 'select-model' && (
          <Select
            title="Select a model:"
            options={phase.models.map(m => ({
              value: m,
              label: m,
              description: m === phase.defaultModel ? '(default)' : undefined,
            }))}
            defaultValue={phase.defaultModel}
            onChange={handleModelSelect}
            onCancel={handleCancel}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc to {phase.type === 'select-provider' ? 'cancel' : 'go back'}</Text>
      </Box>
    </Box>
  )
}
