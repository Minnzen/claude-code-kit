import React, { useState, useCallback, useRef } from 'react'
import { render, Box, Text, Newline, useInput, useApp } from '@claude-code-kit/ink-renderer'
import {
  REPL, type Message, Select, type SelectOption, MultiSelect, Spinner,
  Divider, ProgressBar, StatusIcon, StatusLine, StreamingText,
  type StatusLineSegment,
} from '@claude-code-kit/ui'

// --- Config ---

const CC_ORANGE = '#DA7756'

const MODELS: SelectOption[] = [
  { value: 'opus-4.6', label: 'Default (recommended)', description: 'Opus 4.6 with 1M context · Most capable for complex work' },
  { value: 'sonnet-4.6', label: 'Sonnet', description: 'Sonnet 4.6 · Best for everyday tasks' },
  { value: 'haiku-4.5', label: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' },
]

const REPLIES: Record<string, string> = {
  hello: 'Hello! This is a **claude-code-kit** demo. Type `/` to browse all components.',
  hi: 'Hey there! Try typing `/` to see all available commands and component demos.',
  help: 'Type `/` to see all commands. Each component has its own demo command.',
}

// --- Clawd mascot (from Claude Code source) ---

function Clawd() {
  const c = CC_ORANGE
  return (
    <Box flexDirection="column">
      <Text><Text color={c}>{' \u2590'}</Text><Text color={c} backgroundColor={c}>{'\u259B\u2588\u2588\u2588\u259C'}</Text><Text color={c}>{'\u258C'}</Text></Text>
      <Text><Text color={c}>{'\u259D\u259C'}</Text><Text color={c} backgroundColor={c}>{'\u2588\u2588\u2588\u2588\u2588'}</Text><Text color={c}>{'\u259B\u2598'}</Text></Text>
      <Text><Text color={c}>{'  \u2598\u2598 \u259D\u259D  '}</Text></Text>
    </Box>
  )
}

function WelcomeScreen() {
  return (
    <Box flexDirection="column">
      <Box gap={2} marginBottom={1}>
        <Clawd />
        <Box flexDirection="column">
          <Text bold>claude-code-kit</Text>
          <Text dimColor>Terminal UI toolkit extracted from Claude Code</Text>
        </Box>
      </Box>
      <Box flexDirection="column" paddingLeft={2}>
        <Text dimColor>  Type <Text color="cyan">/</Text> to browse components and commands</Text>
        <Text dimColor>  Type a message to chat</Text>
      </Box>
    </Box>
  )
}

// --- Component demo screens ---

type Screen = 'repl' | 'model' | 'select' | 'multiselect' | 'spinner' | 'progress' | 'status' | 'divider' | 'statusline' | 'streaming' | 'markdown' | 'table'

function ModelScreen({ current, onSelect, onCancel }: {
  current: string; onSelect: (v: string) => void; onCancel: () => void
}) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Select model</Text>
      <Text dimColor>Switch between Claude models. Applies to this session and future sessions.</Text>
      <Newline />
      <Select
        options={MODELS}
        defaultValue={current}
        onChange={onSelect}
        onCancel={onCancel}
      />
      <Newline />
      <Text dimColor>Enter to confirm · Esc to exit</Text>
    </Box>
  )
}

function DemoWrapper({ title, description, onBack, children }: {
  title: string; description: string; onBack: () => void; children: React.ReactNode
}) {
  useInput((_ch, key) => { if (key.escape) onBack() })
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      <Text dimColor>{description}</Text>
      <Divider />
      <Box flexDirection="column" paddingY={1}>{children}</Box>
      <Divider />
      <Text dimColor>Esc to go back</Text>
    </Box>
  )
}

function SelectDemo({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  if (selected) {
    return (
      <DemoWrapper title="Select" description="Interactive list picker with keyboard navigation" onBack={() => { setSelected(null) }}>
        <Text>You selected: <Text bold color="cyan">{selected}</Text></Text>
        <Newline />
        <Text dimColor>Esc to try again</Text>
      </DemoWrapper>
    )
  }
  return (
    <DemoWrapper title="Select" description="Interactive list picker with keyboard navigation" onBack={onBack}>
      <Select
        options={[
          { value: 'react', label: 'React', description: 'A JavaScript library for building user interfaces' },
          { value: 'vue', label: 'Vue', description: 'The progressive JavaScript framework' },
          { value: 'svelte', label: 'Svelte', description: 'Cybernetically enhanced web apps' },
          { value: 'solid', label: 'SolidJS', description: 'Simple and performant reactivity' },
          { value: 'angular', label: 'Angular', description: 'Platform for building apps (disabled)', disabled: true },
        ]}
        defaultValue="react"
        onChange={(v) => setSelected(v)}
        onCancel={onBack}
      />
      <Newline />
      <Text dimColor>Up/Down or j/k to navigate · Enter to select · 1-5 quick select</Text>
    </DemoWrapper>
  )
}

function MultiSelectDemo({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<string[]>(['typescript'])
  const [confirmed, setConfirmed] = useState(false)
  if (confirmed) {
    return (
      <DemoWrapper title="MultiSelect" description="Select multiple items from a list" onBack={() => setConfirmed(false)}>
        <Text>Selected: <Text bold color="cyan">{selected.join(', ')}</Text></Text>
        <Newline />
        <Text dimColor>Esc to try again</Text>
      </DemoWrapper>
    )
  }
  return (
    <DemoWrapper title="MultiSelect" description="Select multiple items from a list" onBack={onBack}>
      <MultiSelect
        options={[
          { value: 'typescript', label: 'TypeScript', description: 'Typed JavaScript' },
          { value: 'rust', label: 'Rust', description: 'Memory safe systems language' },
          { value: 'go', label: 'Go', description: 'Simple, fast, compiled' },
          { value: 'python', label: 'Python', description: 'Easy to learn, versatile' },
        ]}
        selectedValues={selected}
        onToggle={(v) => setSelected(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v])}
        onConfirm={() => setConfirmed(true)}
        onChange={() => {}}
        onCancel={onBack}
      />
      <Newline />
      <Text dimColor>Space to toggle · Enter to confirm · Esc to cancel</Text>
      <Text dimColor>Selected: {selected.join(', ') || 'none'}</Text>
    </DemoWrapper>
  )
}

function SpinnerDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="Spinner" description="Animated loading indicator with verb rotation and elapsed time" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Box gap={1}><Text dimColor>Default:  </Text><Spinner /></Box>
        <Box gap={1}><Text dimColor>Custom:   </Text><Spinner verb="Reading" color="green" /></Box>
        <Box gap={1}><Text dimColor>Rotating: </Text><Spinner verbs={['Thinking', 'Analyzing', 'Processing', 'Reasoning']} /></Box>
        <Box gap={1}><Text dimColor>With label:</Text><Spinner verb="Building" label="src/index.ts" color="yellow" /></Box>
      </Box>
    </DemoWrapper>
  )
}

function ProgressDemo({ onBack }: { onBack: () => void }) {
  const [progress, setProgress] = useState(0.42)
  useInput((_ch, key) => {
    if (key.rightArrow) setProgress(p => Math.min(1, +(p + 0.05).toFixed(2)))
    if (key.leftArrow) setProgress(p => Math.max(0, +(p - 0.05).toFixed(2)))
  })
  return (
    <DemoWrapper title="ProgressBar" description="Visual progress indicator" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          <ProgressBar ratio={progress} width={40} fillColor="green" emptyColor="gray" />
          <Text bold>{Math.round(progress * 100)}%</Text>
        </Box>
        <Box gap={1}>
          <ProgressBar ratio={0.8} width={40} fillColor="cyan" emptyColor="gray" />
          <Text bold>80%</Text>
        </Box>
        <Box gap={1}>
          <ProgressBar ratio={0.3} width={40} fillColor="yellow" emptyColor="gray" />
          <Text bold>30%</Text>
        </Box>
      </Box>
      <Newline />
      <Text dimColor>Left/Right to adjust first bar</Text>
    </DemoWrapper>
  )
}

function StatusDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="StatusIcon" description="Status indicators for success, warning, and error states" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Box gap={1}><StatusIcon status="success" /><Text color="green"> All 42 tests passed</Text></Box>
        <Box gap={1}><StatusIcon status="success" /><Text color="green"> Build completed in 2.3s</Text></Box>
        <Box gap={1}><StatusIcon status="warning" /><Text color="yellow"> 3 deprecation warnings</Text></Box>
        <Box gap={1}><StatusIcon status="warning" /><Text color="yellow"> Node.js 18 reaches EOL soon</Text></Box>
        <Box gap={1}><StatusIcon status="error" /><Text color="red"> TypeError: Cannot read property of undefined</Text></Box>
        <Box gap={1}><StatusIcon status="error" /><Text color="red"> ENOENT: no such file or directory</Text></Box>
      </Box>
    </DemoWrapper>
  )
}

function DividerDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="Divider" description="Horizontal dividers with optional titles" onBack={onBack}>
      <Text dimColor>Plain:</Text>
      <Divider />
      <Newline />
      <Text dimColor>With title:</Text>
      <Divider title="Section Title" />
      <Newline />
      <Text dimColor>Colored:</Text>
      <Divider color="cyan" />
      <Newline />
      <Text dimColor>Custom char:</Text>
      <Divider char="=" />
      <Newline />
      <Text dimColor>With padding:</Text>
      <Divider padding={10} title="Padded" />
    </DemoWrapper>
  )
}

function StatusLineDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="StatusLine" description="Bottom status bar with segments" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Simple:</Text>
        <StatusLine segments={[{ content: 'claude-code-kit v0.1.0' }]} />
        <Newline />
        <Text dimColor>Multi-segment:</Text>
        <StatusLine segments={[
          { content: 'opus-4.6', color: 'green' },
          { content: '12.5k tokens' },
          { content: '$0.42', color: 'yellow' },
        ]} />
        <Newline />
        <Text dimColor>With spacer:</Text>
        <StatusLine segments={[
          { content: 'main', color: 'cyan' },
          { content: '3 files changed', color: 'yellow' },
          { content: '', flex: true },
          { content: 'Ctrl+C to exit' },
        ]} />
      </Box>
    </DemoWrapper>
  )
}

function StreamingDemo({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState(0)
  useInput((ch) => { if (ch === 'r') setKey(k => k + 1) })
  return (
    <DemoWrapper title="StreamingText" description="Text that appears character by character" onBack={onBack}>
      <StreamingText
        key={key}
        text="This text appears progressively, character by character, simulating how an AI model streams its response. It supports any length of text and calls onComplete when finished."
        speed={2}
        interval={25}
      />
      <Newline />
      <Text dimColor>Press r to replay</Text>
    </DemoWrapper>
  )
}

function MarkdownDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="Markdown" description="Terminal markdown rendering (bold, code, lists)" onBack={onBack}>
      <Box flexDirection="column">
        <Text><Text bold>Bold text</Text> and <Text dimColor>dim text</Text></Text>
        <Text>Inline <Text color="cyan">`code`</Text> rendering</Text>
        <Newline />
        <Text>Lists:</Text>
        <Text>  - First item</Text>
        <Text>  - Second item with <Text bold>bold</Text></Text>
        <Text>  - Third item with <Text color="cyan">`code`</Text></Text>
        <Newline />
        <Text dimColor>Note: Full Markdown component available via {'<Markdown />'}</Text>
      </Box>
    </DemoWrapper>
  )
}

function TableDemo({ onBack }: { onBack: () => void }) {
  return (
    <DemoWrapper title="Table" description="Data table rendering" onBack={onBack}>
      <Box flexDirection="column">
        <Box>
          <Box width={24}><Text bold color="cyan">Package</Text></Box>
          <Box width={16}><Text bold color="cyan">Version</Text></Box>
          <Box width={12}><Text bold color="cyan">Status</Text></Box>
        </Box>
        <Divider />
        {[
          { pkg: '@claude-code-kit/shared', ver: '0.1.0', status: 'stable' },
          { pkg: '@claude-code-kit/ink-renderer', ver: '0.1.0', status: 'stable' },
          { pkg: '@claude-code-kit/ui', ver: '0.1.0', status: 'stable' },
          { pkg: '@claude-code-kit/streaming', ver: '-', status: 'planned' },
          { pkg: '@claude-code-kit/bash', ver: '-', status: 'planned' },
        ].map(r => (
          <Box key={r.pkg}>
            <Box width={24}><Text>{r.pkg}</Text></Box>
            <Box width={16}><Text dimColor>{r.ver}</Text></Box>
            <Box width={12}><Text color={r.status === 'stable' ? 'green' : 'yellow'}>{r.status}</Text></Box>
          </Box>
        ))}
      </Box>
    </DemoWrapper>
  )
}

// --- Main App ---

function App() {
  const { exit } = useApp()
  const [screen, setScreen] = useState<Screen>('repl')
  const [model, setModel] = useState('opus-4.6')
  const [showWelcome, setShowWelcome] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streaming, setStreaming] = useState<string | null>(null)
  const streamRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgId = useRef(10)

  const addMessage = useCallback((role: Message['role'], content: string) => {
    msgId.current++
    setMessages(prev => [...prev.slice(-30), { id: String(msgId.current), role, content }])
  }, [])

  const simulateStream = useCallback((text: string) => {
    setIsLoading(true)
    setStreaming('')
    let pos = 0
    const tick = () => {
      pos += Math.floor(Math.random() * 4) + 2
      if (pos >= text.length) {
        setStreaming(null)
        setIsLoading(false)
        addMessage('assistant', text)
        return
      }
      setStreaming(text.slice(0, pos))
      streamRef.current = setTimeout(tick, 15 + Math.random() * 20)
    }
    streamRef.current = setTimeout(tick, 400)
  }, [addMessage])

  const handleSubmit = useCallback(async (message: string) => {
    if (showWelcome) setShowWelcome(false)
    addMessage('user', message)
    const reply = REPLIES[message.toLowerCase().trim()]
      ?? `You said: "${message}". Type \`/\` to browse all components.`
    simulateStream(reply)
  }, [addMessage, simulateStream, showWelcome])

  const modelLabel = MODELS.find(m => m.value === model)?.label ?? model
  const goRepl = useCallback(() => setScreen('repl'), [])

  const statusSegments: StatusLineSegment[] = [
    { content: modelLabel, color: 'green' },
    { content: '0 tokens' },
    { content: '$0.00', color: 'yellow' },
    { content: '', flex: true },
    { content: 'Type / for commands' },
  ]

  // Every component is a command
  const commands = [
    { name: 'model', description: 'Switch the AI model', onExecute: () => setScreen('model') },
    { name: 'select', description: 'Interactive list picker', onExecute: () => setScreen('select') },
    { name: 'multiselect', description: 'Multi-item selector', onExecute: () => setScreen('multiselect') },
    { name: 'spinner', description: 'Animated loading indicator', onExecute: () => setScreen('spinner') },
    { name: 'progress', description: 'Progress bar', onExecute: () => setScreen('progress') },
    { name: 'status', description: 'Status icons (success/warning/error)', onExecute: () => setScreen('status') },
    { name: 'divider', description: 'Horizontal dividers', onExecute: () => setScreen('divider') },
    { name: 'statusline', description: 'Bottom status bar', onExecute: () => setScreen('statusline') },
    { name: 'streaming', description: 'Streaming text animation', onExecute: () => setScreen('streaming') },
    { name: 'markdown', description: 'Terminal markdown rendering', onExecute: () => setScreen('markdown') },
    { name: 'table', description: 'Data table rendering', onExecute: () => setScreen('table') },
    { name: 'clear', description: 'Clear conversation', onExecute: () => setMessages([]) },
    { name: 'help', description: 'Show help', onExecute: () => addMessage('system', 'Type / to browse all components and commands.') },
    { name: 'exit', description: 'Exit', onExecute: () => exit() },
  ]

  // Render demo screens
  const demos: Record<string, React.ReactNode> = {
    model: <ModelScreen current={model} onSelect={(v) => { setModel(v); addMessage('system', `Model: ${v}`); setScreen('repl') }} onCancel={goRepl} />,
    select: <SelectDemo onBack={goRepl} />,
    multiselect: <MultiSelectDemo onBack={goRepl} />,
    spinner: <SpinnerDemo onBack={goRepl} />,
    progress: <ProgressDemo onBack={goRepl} />,
    status: <StatusDemo onBack={goRepl} />,
    divider: <DividerDemo onBack={goRepl} />,
    statusline: <StatusLineDemo onBack={goRepl} />,
    streaming: <StreamingDemo onBack={goRepl} />,
    markdown: <MarkdownDemo onBack={goRepl} />,
    table: <TableDemo onBack={goRepl} />,
  }

  if (screen !== 'repl' && demos[screen]) {
    return <Box padding={1}>{demos[screen]}</Box>
  }

  return (
    <Box padding={1} flexDirection="column" flexGrow={1}>
      {showWelcome && <WelcomeScreen />}
      <REPL
        messages={messages}
        onSubmit={handleSubmit}
        onExit={exit}
        isLoading={isLoading}
        streamingContent={streaming}
        commands={commands}
        model={modelLabel}
        statusSegments={statusSegments}
        placeholder="Type a message or / for commands..."
      />
    </Box>
  )
}

await render(<App />)
