import React, { useState, useCallback, useRef } from 'react'
import { render, Box, Text, Newline, useInput, useApp } from '@claude-code-kit/ink-renderer'
import {
  REPL, type Message, type MessageContent, Select, type SelectOption,
  Spinner, Divider, ProgressBar, StatusIcon, StatusLine, StreamingText,
  DiffView, PermissionRequest, WelcomeScreen, ClawdLogo,
  type StatusLineSegment, type PermissionAction,
} from '@claude-code-kit/ui'

const MODELS: SelectOption[] = [
  { value: 'opus-4.6', label: 'Default (recommended)', description: 'Opus 4.6 with 1M context' },
  { value: 'sonnet-4.6', label: 'Sonnet', description: 'Sonnet 4.6 · Best for everyday tasks' },
  { value: 'haiku-4.5', label: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' },
]

const REPLIES: Record<string, string> = {
  hello: 'Hello! This is a **claude-code-kit** demo. Type `/` to browse all components.',
  hi: 'Hey there! Try typing `/` to see all available commands.',
  help: 'Type `/` to see all commands. Type "tool" to see tool_use rendering.',
}

const SAMPLE_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,4 +10,6 @@ export function formatDate(date: Date): string {
   const month = date.getMonth() + 1
-  return \`\${year}-\${month}-\${day}\`
+  const pad = (n: number) => String(n).padStart(2, '0')
+  return \`\${year}-\${pad(month)}-\${pad(day)}\`
 }
+export function parseDate(str: string): Date {
+  return new Date(str)
+}
`

// --- Shared demo shell ---

type Screen = 'repl' | 'model' | 'select' | 'spinner' | 'progress'
  | 'status' | 'divider' | 'statusline' | 'streaming' | 'diff' | 'permission'

function DemoWrapper({ title, desc, onBack, children }: {
  title: string; desc: string; onBack: () => void; children: React.ReactNode
}) {
  useInput((_ch, key) => { if (key.escape) onBack() })
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      <Text dimColor>{desc}</Text>
      <Divider />
      <Box flexDirection="column" paddingY={1}>{children}</Box>
      <Divider />
      <Text dimColor>Esc to go back</Text>
    </Box>
  )
}

function SelectDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="Select" desc="Interactive list picker" onBack={onBack}>
      <Select
        options={[
          { value: 'react', label: 'React', description: 'A JavaScript library for UIs' },
          { value: 'vue', label: 'Vue', description: 'The progressive JS framework' },
          { value: 'svelte', label: 'Svelte', description: 'Cybernetically enhanced web apps' },
        ]}
        defaultValue="react"
        onChange={() => onBack()}
        onCancel={onBack}
      />
    </DemoWrapper>
  )
}

function SpinnerDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="Spinner" desc="Animated loading indicator" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Box gap={1}><Text dimColor>Default: </Text><Spinner /></Box>
        <Box gap={1}><Text dimColor>Custom:  </Text><Spinner verb="Reading" color="green" /></Box>
        <Box gap={1}><Text dimColor>Label:   </Text><Spinner verb="Building" label="src/index.ts" color="yellow" /></Box>
      </Box>
    </DemoWrapper>
  )
}

function ProgressDemo({ onBack }: { onBack: () => void }) {
  const [p, setP] = useState(0.42)
  useInput((_ch, key) => {
    if (key.rightArrow) setP(v => Math.min(1, +(v + 0.05).toFixed(2)))
    if (key.leftArrow) setP(v => Math.max(0, +(v - 0.05).toFixed(2)))
  })
  return (
    <DemoWrapper title="ProgressBar" desc="Visual progress indicator (Left/Right to adjust)" onBack={onBack}>
      <Box gap={1}>
        <ProgressBar ratio={p} width={40} fillColor="green" emptyColor="gray" />
        <Text bold>{Math.round(p * 100)}%</Text>
      </Box>
    </DemoWrapper>
  )
}

function StatusDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="StatusIcon" desc="Status indicators" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Box gap={1}><StatusIcon status="success" /><Text color="green"> Tests passed</Text></Box>
        <Box gap={1}><StatusIcon status="warning" /><Text color="yellow"> Deprecation warning</Text></Box>
        <Box gap={1}><StatusIcon status="error" /><Text color="red"> TypeError</Text></Box>
      </Box>
    </DemoWrapper>
  )
}

function DiffDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="DiffView" desc="Unified diff rendering with line numbers" onBack={onBack}>
      <DiffView filename="src/utils.ts" lines={[]} diff={SAMPLE_DIFF} />
    </DemoWrapper>
  )
}

function PermissionDemo({ onBack }: { onBack: () => void }) {
  const [result, setResult] = useState<PermissionAction | null>(null)
  if (result) {
    return (
      <DemoWrapper title="PermissionRequest" desc="Tool approval overlay" onBack={() => setResult(null)}>
        <Text>Decision: <Text bold color={result === 'deny' ? 'red' : 'green'}>{result}</Text></Text>
      </DemoWrapper>
    )
  }
  return (
    <DemoWrapper title="PermissionRequest" desc="Tool approval overlay" onBack={onBack}>
      <PermissionRequest
        toolName="Bash"
        description="Claude wants to run a command"
        details="rm -rf node_modules && npm install"
        onDecision={(action) => setResult(action)}
      />
    </DemoWrapper>
  )
}

function StreamingDemo({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState(0)
  useInput((ch) => { if (ch === 'r') setKey(k => k + 1) })
  return (
    <DemoWrapper title="StreamingText" desc="Character-by-character text (press r to replay)" onBack={onBack}>
      <StreamingText key={key} text="This text appears progressively, simulating AI streaming." speed={2} interval={25} />
    </DemoWrapper>
  )
}

// --- Main App ---

function App() {
  const { exit } = useApp()
  const [screen, setScreen] = useState<Screen>('repl')
  const [model, setModel] = useState('opus-4.6')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streaming, setStreaming] = useState<string | null>(null)
  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgId = useRef(10)

  const addMessage = useCallback((role: Message['role'], content: string | MessageContent[]) => {
    msgId.current++
    setMessages(prev => [...prev.slice(-30), { id: String(msgId.current), role, content }])
  }, [])

  const simulateStream = useCallback((text: string) => {
    setIsLoading(true); setStreaming('')
    let pos = 0
    const tick = () => {
      pos += Math.floor(Math.random() * 4) + 2
      if (pos >= text.length) { setStreaming(null); setIsLoading(false); addMessage('assistant', text); return }
      setStreaming(text.slice(0, pos))
      streamRef.current = setTimeout(tick, 15 + Math.random() * 20)
    }
    streamRef.current = setTimeout(tick, 400)
  }, [addMessage])

  const simulateToolUse = useCallback(() => {
    addMessage('assistant', [
      { type: 'text', text: 'Let me check the project structure.' },
      { type: 'tool_use', toolName: 'Bash', input: 'ls -la src/', status: 'running' },
    ])
    setIsLoading(true)
    setTimeout(() => {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          id: String(msgId.current), role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check the project structure.' },
            { type: 'tool_use', toolName: 'Bash', input: 'ls -la src/', status: 'success',
              result: 'total 24\n-rw-r--r--  1 user staff 1420 index.ts\n-rw-r--r--  1 user staff  890 utils.ts' },
            { type: 'text', text: 'Found 2 source files: `index.ts` and `utils.ts`.' },
          ],
        }
        return updated
      })
      setIsLoading(false)
    }, 2000)
  }, [addMessage])

  const handleSubmit = useCallback(async (message: string) => {
    addMessage('user', message)
    if (message.toLowerCase().trim() === 'tool') { simulateToolUse(); return }
    const reply = REPLIES[message.toLowerCase().trim()]
      ?? `You said: "${message}". Type \`/\` for commands, or "tool" to see tool_use.`
    simulateStream(reply)
  }, [addMessage, simulateStream, simulateToolUse])

  const modelLabel = MODELS.find(m => m.value === model)?.label ?? model
  const goRepl = useCallback(() => setScreen('repl'), [])

  const statusSegments: StatusLineSegment[] = [
    { content: modelLabel, color: 'green' }, { content: '0 tokens' },
    { content: '$0.00', color: 'yellow' }, { content: '', flex: true },
    { content: 'Type / for commands' },
  ]

  const commands = [
    { name: 'model', description: 'Switch the AI model', onExecute: () => setScreen('model') },
    { name: 'diff', description: 'DiffView demo', onExecute: () => setScreen('diff') },
    { name: 'permission', description: 'PermissionRequest demo', onExecute: () => setScreen('permission') },
    { name: 'select', description: 'Interactive list picker', onExecute: () => setScreen('select') },
    { name: 'spinner', description: 'Animated loading indicator', onExecute: () => setScreen('spinner') },
    { name: 'progress', description: 'Progress bar', onExecute: () => setScreen('progress') },
    { name: 'status', description: 'Status icons', onExecute: () => setScreen('status') },
    { name: 'divider', description: 'Horizontal dividers', onExecute: () => setScreen('divider') },
    { name: 'statusline', description: 'Bottom status bar', onExecute: () => setScreen('statusline') },
    { name: 'streaming', description: 'Streaming text', onExecute: () => setScreen('streaming') },
    { name: 'clear', description: 'Clear conversation', onExecute: () => setMessages([]) },
    { name: 'exit', description: 'Exit', onExecute: () => exit() },
  ]

  const demos: Record<string, React.ReactNode> = {
    model: <Box flexDirection="column">
      <Text bold color="cyan">Select model</Text>
      <Newline />
      <Select options={MODELS} defaultValue={model}
        onChange={(v) => { setModel(v); addMessage('system', `Model: ${v}`); setScreen('repl') }}
        onCancel={goRepl} />
    </Box>,
    diff: <DiffDemo onBack={goRepl} />,
    permission: <PermissionDemo onBack={goRepl} />,
    select: <SelectDemo onBack={goRepl} />,
    spinner: <SpinnerDemo onBack={goRepl} />,
    progress: <ProgressDemo onBack={goRepl} />,
    status: <StatusDemo onBack={goRepl} />,
    divider: <DemoWrapper title="Divider" desc="Horizontal dividers" onBack={goRepl}>
      <Divider /><Divider title="Section" /><Divider char="=" />
    </DemoWrapper>,
    statusline: <DemoWrapper title="StatusLine" desc="Bottom status bar" onBack={goRepl}>
      <StatusLine segments={[{ content: 'opus-4.6', color: 'green' }, { content: '12.5k tokens' }, { content: '$0.42', color: 'yellow' }]} />
    </DemoWrapper>,
    streaming: <StreamingDemo onBack={goRepl} />,
  }

  if (screen !== 'repl' && demos[screen]) return <Box padding={1}>{demos[screen]}</Box>

  const welcome = (
    <WelcomeScreen
      appName="claude-code-kit"
      subtitle="Terminal UI toolkit extracted from Claude Code"
      version="0.1.0"
      logo={<ClawdLogo />}
      tips={['Type / to browse components', 'Type a message to chat', 'Type "tool" to see tool_use', 'Ctrl+F to search']}
    />
  )

  return (
    <Box padding={1} flexDirection="column" flexGrow={1}>
      <REPL
        messages={messages} onSubmit={handleSubmit} onExit={exit}
        isLoading={isLoading} streamingContent={streaming}
        commands={commands} model={modelLabel} statusSegments={statusSegments}
        placeholder="Type a message or / for commands..." welcome={welcome}
      />
    </Box>
  )
}

await render(<App />)
