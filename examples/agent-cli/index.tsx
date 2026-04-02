import React from 'react'
import { render } from '@claude-code-kit/ink-renderer'
import { AgentREPL, WelcomeScreen } from '@claude-code-kit/ui'
import {
  Agent,
  MockProvider,
  createAuth,
  createPermissionHandler,
  type LLMProvider,
  type StreamChunk,
} from '@claude-code-kit/agent'
import { bashTool, readTool, editTool, writeTool, globTool, grepTool } from '@claude-code-kit/tools'

// ---------------------------------------------------------------------------
// 1. Mock provider — realistic coding-assistant script for demo mode
// ---------------------------------------------------------------------------

const mockScript: StreamChunk[][] = [
  // Turn 1: greeting
  [
    { type: 'text', text: "Hello! I'm a mini coding assistant powered by claude-code-kit. " },
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
  // Turn 4: model uses read
  [
    { type: 'tool_use_start', toolCall: { id: 'tc_2', name: 'read' } },
    { type: 'tool_use_delta', text: '{"file_path":"package.json"}' },
    { type: 'tool_use_end' },
    { type: 'done' },
  ],
  // Turn 5: response after read
  [
    { type: 'text', text: "Here's the content of `package.json`. I can help you modify it or explore other files." },
    { type: 'done' },
  ],
  // Turn 6: model uses grep
  [
    { type: 'text', text: 'Let me search for that pattern.\n\n' },
    { type: 'tool_use_start', toolCall: { id: 'tc_3', name: 'grep' } },
    { type: 'tool_use_delta', text: '{"pattern":"TODO","path":"."}' },
    { type: 'tool_use_end' },
    { type: 'done' },
  ],
  // Turn 7: response after grep
  [
    { type: 'text', text: 'Search complete. Those are all the TODOs I found in the codebase.' },
    { type: 'done' },
  ],
  // Turn 8+: fallback
  [
    { type: 'text', text: "That's the end of the demo script! To use a real LLM, set an API key:\n\n" },
    { type: 'text', text: '  export ANTHROPIC_API_KEY=sk-...\n  export OPENAI_API_KEY=sk-...\n\n' },
    { type: 'text', text: 'Then restart the CLI. It will auto-detect the key and connect to the real provider.' },
    { type: 'done' },
  ],
]

// ---------------------------------------------------------------------------
// 2. Auth — try env vars for all providers, fall back to mock
// ---------------------------------------------------------------------------

const PROVIDER_ORDER = ['anthropic', 'openai', 'deepseek', 'siliconflow', 'groq', 'ollama'] as const

function resolveProvider(): { provider: LLMProvider; name: string; model: string } {
  const auth = createAuth()

  // Try each provider's env var
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

  // Fall back to mock
  return {
    provider: new MockProvider(mockScript),
    name: 'mock',
    model: 'demo-mode',
  }
}

const resolved = resolveProvider()

// ---------------------------------------------------------------------------
// 3. Permission handler — auto-approve reads, prompt for writes
// ---------------------------------------------------------------------------

const permissionHandler = createPermissionHandler({
  autoApproveReadOnly: true,
  // bash, edit, write will go through the REPL's PermissionRequest UI
})

// ---------------------------------------------------------------------------
// 4. System prompt
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
// 5. Create agent
// ---------------------------------------------------------------------------

const agent = new Agent({
  provider: resolved.provider,
  model: resolved.model,
  tools: [bashTool, readTool, editTool, writeTool, globTool, grepTool],
  systemPrompt: SYSTEM_PROMPT,
  permissionHandler,
})

// ---------------------------------------------------------------------------
// 6. App with commands
// ---------------------------------------------------------------------------

function App() {
  const isMock = resolved.name === 'mock'
  const subtitle = isMock
    ? 'Demo mode (no API key found). Set ANTHROPIC_API_KEY to use a real LLM.'
    : `${resolved.name} / ${resolved.model}`

  return (
    <AgentREPL
      agent={agent}
      model={isMock ? 'demo (mock)' : `${resolved.name}:${resolved.model}`}
      welcome={
        <WelcomeScreen
          appName="cck-agent"
          subtitle={subtitle}
          tips={[
            'Ask me to explore, read, search, or edit files',
            'Read-only tools auto-approve; write tools ask permission',
            '/clear to reset conversation, Ctrl+C to quit',
            isMock ? 'Set ANTHROPIC_API_KEY or OPENAI_API_KEY for real LLM' : '',
          ].filter(Boolean)}
        />
      }
      commands={[
        {
          name: 'model',
          description: 'Show current provider and model',
          onExecute: () => {
            // Info is displayed in the status line
          },
        },
      ]}
      placeholder="Ask me anything about your codebase..."
    />
  )
}

await render(<App />)
