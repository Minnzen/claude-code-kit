import React, { useState, useCallback } from 'react'
import { render } from '@claude-code-kit/ink-renderer'
import { AgentREPL, WelcomeScreen, AuthFlowUI } from '@claude-code-kit/ui'
import {
  Agent,
  MockProvider,
  createAuth,
  createPermissionHandler,
  type LLMProvider,
  type StreamChunk,
  type AuthRegistry,
} from '@claude-code-kit/agent'
import { bashTool, readTool, editTool, writeTool, globTool, grepTool } from '@claude-code-kit/tools'

// ---------------------------------------------------------------------------
// 1. Mock provider — realistic coding-assistant script for demo mode
// ---------------------------------------------------------------------------

const mockScript: StreamChunk[][] = [
  // Turn 1: greeting
  [
    { type: 'text', text: "Hello! I'm a mini coding assistant in demo mode. " },
    { type: 'text', text: 'I can read files, search code, run commands, and edit files. Try asking me to list files or read a file!' },
    { type: 'done' },
  ],
  // Turn 2: model uses glob to list files
  [
    { type: 'text', text: "Let me check what's in the current directory.\n\n" },
    { type: 'tool_use_start', toolCall: { id: 'tc_1', name: 'glob' } },
    { type: 'tool_use_delta', text: '{"pattern":"*","path":"."}' },
    { type: 'tool_use_end' },
    { type: 'done' },
  ],
  // Turn 3: response after glob result
  [
    { type: 'text', text: 'Here are the files I found. Want me to read any of them or search for something specific?' },
    { type: 'done' },
  ],
  // Turn 4+: fallback
  [
    { type: 'text', text: "That's the end of the demo script! Use /login to authenticate with a real LLM provider." },
    { type: 'done' },
  ],
]

// ---------------------------------------------------------------------------
// 2. System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a concise coding assistant running in a terminal.
You have access to tools: bash (run commands), read (read files), edit (edit files),
write (write files), glob (find files by pattern), grep (search file contents).

Rules:
- Use tools to answer questions about the codebase
- Be concise - terminal space is limited
- Show relevant code snippets when helpful
- For file edits, always read the file first to understand context
- Prefer glob/grep to explore before making changes`

// ---------------------------------------------------------------------------
// 3. Permission handler
// ---------------------------------------------------------------------------

const permissionHandler = createPermissionHandler({
  autoApproveReadOnly: true,
})

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

const TOOLS = [bashTool, readTool, editTool, writeTool, globTool, grepTool]

function createAgent(provider: LLMProvider, model: string): Agent {
  return new Agent({
    provider,
    model,
    tools: TOOLS,
    systemPrompt: SYSTEM_PROMPT,
    permissionHandler,
  })
}

/**
 * Try to resolve a provider from environment variables.
 * Returns null if no env var is set for any provider.
 */
function tryAutoAuth(auth: AuthRegistry): { provider: LLMProvider; name: string; model: string } | null {
  const PROVIDER_ORDER = ['anthropic', 'openai', 'deepseek', 'siliconflow', 'groq', 'ollama'] as const
  for (const name of PROVIDER_ORDER) {
    try {
      const provider = auth.fromEnv(name)
      const reg = auth.getRegistration(name)
      const model = reg?.defaultModel ?? 'unknown'
      return { provider, name, model }
    } catch {
      // No env var for this provider, try next
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 5. Main App — handles auth flow vs REPL state
// ---------------------------------------------------------------------------

type AppState =
  | { phase: 'auth' }
  | { phase: 'repl'; agent: Agent; providerName: string; model: string }

function App() {
  const [auth] = useState(() => createAuth())
  const [state, setState] = useState<AppState>(() => {
    // Try env-based auto-auth first
    const resolved = tryAutoAuth(auth)
    if (resolved) {
      return {
        phase: 'repl',
        agent: createAgent(resolved.provider, resolved.model),
        providerName: resolved.name,
        model: resolved.model,
      }
    }
    // No env var found — show interactive auth flow
    return { phase: 'auth' }
  })

  const handleAuthComplete = useCallback((provider: LLMProvider, providerName: string, model: string) => {
    setState({
      phase: 'repl',
      agent: createAgent(provider, model),
      providerName,
      model,
    })
  }, [])

  const handleDemoMode = useCallback(() => {
    setState({
      phase: 'repl',
      agent: createAgent(new MockProvider(mockScript), 'demo-mode'),
      providerName: 'mock',
      model: 'demo-mode',
    })
  }, [])

  const handleShowLogin = useCallback(() => {
    setState({ phase: 'auth' })
  }, [])

  // --- Auth flow ---
  if (state.phase === 'auth') {
    return (
      <AuthFlowWithDemoOption
        auth={auth}
        onComplete={handleAuthComplete}
        onDemoMode={handleDemoMode}
      />
    )
  }

  // --- REPL ---
  const isMock = state.providerName === 'mock'
  const subtitle = isMock
    ? 'Demo mode — use /login to authenticate with a real LLM provider'
    : `${state.providerName} / ${state.model}`

  return (
    <AgentREPL
      agent={state.agent}
      model={isMock ? 'demo (mock)' : `${state.providerName}:${state.model}`}
      welcome={
        <WelcomeScreen
          appName="cck-agent"
          subtitle={subtitle}
          tips={[
            'Ask me to explore, read, search, or edit files',
            'Read-only tools auto-approve; write tools ask permission',
            '/login to switch provider, /provider to show current, /clear to reset',
            'Ctrl+C to quit',
          ]}
        />
      }
      commands={[
        {
          name: 'login',
          description: 'Switch provider — re-run auth flow',
          onExecute: () => handleShowLogin(),
        },
        {
          name: 'provider',
          description: 'Show current provider and model',
          onExecute: () => {
            // Info is displayed in the status line / model badge
          },
        },
      ]}
      placeholder="Ask me anything about your codebase..."
    />
  )
}

// ---------------------------------------------------------------------------
// 6. Auth wrapper with "Demo mode" escape hatch
// ---------------------------------------------------------------------------

function AuthFlowWithDemoOption({
  auth,
  onComplete,
  onDemoMode,
}: {
  auth: AuthRegistry
  onComplete: (provider: LLMProvider, providerName: string, model: string) => void
  onDemoMode: () => void
}) {
  // Register a virtual "demo" provider so it appears in the list
  const [registered] = useState(() => {
    if (!auth.getRegistration('demo')) {
      auth.register('demo', {
        displayName: 'Demo mode (no API key)',
        description: 'Try the CLI with mock responses',
        authMethods: [{ type: 'none' }],
        createProvider: () => new MockProvider(mockScript),
      })
    }
    return true
  })

  const handleComplete = useCallback((provider: LLMProvider, providerName: string, model: string) => {
    if (providerName === 'demo') {
      // Unregister demo provider so it doesn't persist
      auth.unregister('demo')
      onDemoMode()
    } else {
      auth.unregister('demo')
      onComplete(provider, providerName, model)
    }
  }, [auth, onComplete, onDemoMode])

  const handleCancel = useCallback(() => {
    auth.unregister('demo')
    onDemoMode()
  }, [auth, onDemoMode])

  return (
    <AuthFlowUI
      auth={auth}
      onComplete={handleComplete}
      onCancel={handleCancel}
      title="Welcome to cck-agent — Select a provider to get started"
    />
  )
}

// ---------------------------------------------------------------------------
// 7. Render
// ---------------------------------------------------------------------------

await render(<App />)
