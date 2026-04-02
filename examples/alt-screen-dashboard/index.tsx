import os from 'node:os'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlternateScreen,
  Box,
  ScrollBox,
  type ScrollBoxHandle,
  Text,
  render,
  useApp,
  useInput,
} from '@claude-code-kit/ink-renderer'
import {
  Byline,
  KeyboardShortcutHint,
  ProgressBar,
  StatusLine,
  Tab,
  Tabs,
  ThemeProvider,
  ThemedBox,
  ThemedText,
  getTheme,
  useTerminalSize,
  useTheme,
} from '@claude-code-kit/ui'

type DashboardTab = 'overview' | 'machine' | 'process'
type Tone = 'accent' | 'assistant' | 'success' | 'warning' | 'error'

type StaticInfo = {
  hostname: string
  platform: NodeJS.Platform
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemory: number
  nodeVersion: string
}

type RuntimeSnapshot = {
  systemCpu: number
  processCpu: number
  freeMemory: number
  usedMemory: number
  rss: number
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
  systemUptime: number
  processUptime: number
  loadAverage: [number, number, number] | null
  eventLoopMean: number
  eventLoopMax: number
  terminalColumns: number
  terminalRows: number
  sampleIntervalMs: number
  histories: {
    systemCpu: number[]
    processCpu: number[]
    memoryPressure: number[]
    rssPressure: number[]
    loopDelay: number[]
  }
}

type SectionFrameProps = {
  title: string
  tone?: Tone
  right?: React.ReactNode
  children: React.ReactNode
}

type MetricCardProps = {
  label: string
  value: string
  note: string
  tone?: Tone
  trend?: string
}

const TAB_ORDER: DashboardTab[] = ['overview', 'machine', 'process']
const TAB_LABEL: Record<DashboardTab, string> = {
  overview: 'Overview',
  machine: 'Machine',
  process: 'Process',
}
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const SAMPLE_INTERVAL_MS = 1000
const HISTORY_LENGTH = 18

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`
}

function formatMs(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)} ms`
}

function formatLoadAverage(loadAverage: [number, number, number] | null): string {
  if (!loadAverage) return 'n/a on windows'
  return loadAverage.map(value => value.toFixed(2)).join(' / ')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pushHistory(values: number[], next: number): number[] {
  const merged = [...values, next]
  return merged.slice(-HISTORY_LENGTH)
}

function sparkline(values: number[]): string {
  return values
    .map(value => BLOCKS[Math.round(clamp(value, 0, 1) * (BLOCKS.length - 1))]!)
    .join('')
}

function toneFillColor(tone: Tone, themeName: string): string {
  const theme = getTheme(themeName as any)
  switch (tone) {
    case 'accent':
      return theme.accent
    case 'assistant':
      return theme.assistant
    case 'success':
      return theme.success
    case 'warning':
      return theme.warning
    case 'error':
      return theme.error
  }
}

function toneForLoad(value: number): Tone {
  if (value <= 0.4) return 'success'
  if (value <= 0.75) return 'warning'
  return 'error'
}

function readSystemCpuTotals(): { idle: number; total: number } {
  const cpus = os.cpus()
  let idle = 0
  let total = 0

  for (const cpu of cpus) {
    idle += cpu.times.idle
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq
  }

  return { idle, total }
}

function createStaticInfo(): StaticInfo {
  const cores = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model ?? 'unknown cpu',
    cpuCores: cores,
    totalMemory: os.totalmem(),
    nodeVersion: process.version,
  }
}

function createInitialSnapshot(
  columns: number,
  rows: number,
  totalMemory: number,
): RuntimeSnapshot {
  const memory = process.memoryUsage()
  return {
    systemCpu: 0,
    processCpu: 0,
    freeMemory: os.freemem(),
    usedMemory: totalMemory - os.freemem(),
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
    systemUptime: os.uptime(),
    processUptime: process.uptime(),
    loadAverage:
      process.platform === 'win32'
        ? null
        : (os.loadavg() as [number, number, number]),
    eventLoopMean: 0,
    eventLoopMax: 0,
    terminalColumns: columns,
    terminalRows: rows,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    histories: {
      systemCpu: [0],
      processCpu: [0],
      memoryPressure: [0],
      rssPressure: [0],
      loopDelay: [0],
    },
  }
}

function useMachineMonitor(columns: number, rows: number) {
  const staticInfo = useMemo(createStaticInfo, [])
  const previousCpuRef = useRef(readSystemCpuTotals())
  const previousProcessCpuRef = useRef(process.cpuUsage())
  const previousTimeRef = useRef(performance.now())
  const loopDelayRef = useRef(
    monitorEventLoopDelay({ resolution: 20 }),
  )

  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() =>
    createInitialSnapshot(columns, rows, staticInfo.totalMemory),
  )

  useEffect(() => {
    const histogram = loopDelayRef.current
    histogram.enable()
    return () => {
      histogram.disable()
    }
  }, [])

  useEffect(() => {
    const sample = () => {
      const now = performance.now()
      const wallTimeMs = Math.max(1, now - previousTimeRef.current)
      previousTimeRef.current = now

      const currentCpu = readSystemCpuTotals()
      const idleDelta = currentCpu.idle - previousCpuRef.current.idle
      const totalDelta = currentCpu.total - previousCpuRef.current.total
      previousCpuRef.current = currentCpu

      const currentProcessCpu = process.cpuUsage()
      const processCpuDelta =
        currentProcessCpu.user -
        previousProcessCpuRef.current.user +
        currentProcessCpu.system -
        previousProcessCpuRef.current.system
      previousProcessCpuRef.current = currentProcessCpu

      const histogram = loopDelayRef.current
      const rawMean = histogram.mean / 1e6
      const rawMax = histogram.max / 1e6
      const eventLoopMean = Number.isFinite(rawMean) ? rawMean : 0
      const eventLoopMax = Number.isFinite(rawMax) ? rawMax : 0
      histogram.reset()

      const systemCpu =
        totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0
      const processCpu =
        (processCpuDelta / (wallTimeMs * 1000)) * 100

      const memory = process.memoryUsage()
      const freeMemory = os.freemem()
      const usedMemory = staticInfo.totalMemory - freeMemory
      const loadAverage =
        process.platform === 'win32'
          ? null
          : (os.loadavg() as [number, number, number])

      setSnapshot(previous => ({
        systemCpu,
        processCpu,
        freeMemory,
        usedMemory,
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
        systemUptime: os.uptime(),
        processUptime: process.uptime(),
        loadAverage,
        eventLoopMean,
        eventLoopMax,
        terminalColumns: columns,
        terminalRows: rows,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        histories: {
          systemCpu: pushHistory(previous.histories.systemCpu, clamp(systemCpu / 100, 0, 1)),
          processCpu: pushHistory(previous.histories.processCpu, clamp(processCpu / 100, 0, 1)),
          memoryPressure: pushHistory(previous.histories.memoryPressure, clamp(usedMemory / staticInfo.totalMemory, 0, 1)),
          rssPressure: pushHistory(previous.histories.rssPressure, clamp(memory.rss / staticInfo.totalMemory, 0, 1)),
          loopDelay: pushHistory(previous.histories.loopDelay, clamp(eventLoopMean / 40, 0, 1)),
        },
      }))
    }

    sample()
    const intervalId = setInterval(sample, SAMPLE_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
    }
  }, [columns, rows, staticInfo.totalMemory])

  return { staticInfo, snapshot }
}

function SectionFrame({
  title,
  tone = 'accent',
  right,
  children,
}: SectionFrameProps) {
  return (
    <ThemedBox
      borderStyle="round"
      borderColor="border"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
    >
      <Box>
        <ThemedText color={tone} bold>
          {title}
        </ThemedText>
        <Box flexGrow={1} />
        {right}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </ThemedBox>
  )
}

function MetricCard({
  label,
  value,
  note,
  tone = 'accent',
  trend,
}: MetricCardProps) {
  return (
    <ThemedBox
      borderStyle="single"
      borderColor="border"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      flexGrow={1}
      minWidth={22}
    >
      <Box>
        <ThemedText color={tone} bold>
          {label}
        </ThemedText>
        <Box flexGrow={1} />
        {trend && <ThemedText dimColor>{trend}</ThemedText>}
      </Box>
      <ThemedText bold>{value}</ThemedText>
      <ThemedText dimColor>{note}</ThemedText>
    </ThemedBox>
  )
}

function InfoRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: Tone
}) {
  return (
    <Box>
      <ThemedText dimColor>{label}</ThemedText>
      <Box flexGrow={1} />
      <ThemedText color={tone}>{value}</ThemedText>
    </Box>
  )
}

function ProgressLine({
  label,
  ratio,
  meta,
  tone,
  width,
}: {
  label: string
  ratio: number
  meta: string
  tone: Tone
  width: number
}) {
  const [themeName] = useTheme()
  return (
    <Box flexDirection="column">
      <Box>
        <ThemedText color={tone} bold>
          {label}
        </ThemedText>
        <Box flexGrow={1} />
        <ThemedText>{formatPercent(ratio * 100)}</ThemedText>
      </Box>
      <Box gap={1}>
        <ProgressBar
          ratio={ratio}
          width={width}
          fillColor={toneFillColor(tone, themeName)}
          emptyColor={themeName === 'dark' ? '#2B3440' : '#D9DEE6'}
        />
        <ThemedText dimColor>{meta}</ThemedText>
      </Box>
    </Box>
  )
}

function Header({
  snapshot,
}: {
  snapshot: RuntimeSnapshot
}) {
  return (
    <ThemedBox
      borderStyle="round"
      borderColor="assistant"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
    >
      <Box>
        <Box flexDirection="column" flexGrow={1}>
          <Box>
            <ThemedText color="assistant" bold>
              LOCAL NODE MONITOR
            </ThemedText>
            <Box marginLeft={1}>
              <ThemedText dimColor>
                built from `os`, `process`, and `perf_hooks`
              </ThemedText>
            </Box>
          </Box>
          <ThemedText dimColor>
            Real machine and process metrics in an alt-screen dashboard with
            keyboard and wheel scrolling.
          </ThemedText>
        </Box>
        <Box flexDirection="column">
          <ThemedText color="success" bold>
            LIVE
          </ThemedText>
          <ThemedText dimColor>
            {snapshot.terminalColumns}x{snapshot.terminalRows}
          </ThemedText>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          <Byline>
            <KeyboardShortcutHint shortcut="1 / 2 / 3" action="switch tabs" />
            <KeyboardShortcutHint shortcut="j / k" action="scroll" />
            <KeyboardShortcutHint shortcut="PgUp / PgDn" action="page scroll" />
            <KeyboardShortcutHint shortcut="T" action="toggle theme" bold />
            <KeyboardShortcutHint shortcut="Q" action="quit" bold />
          </Byline>
        </Text>
      </Box>
    </ThemedBox>
  )
}

function NavBar({
  activeTab,
}: {
  activeTab: DashboardTab
}) {
  return (
    <ThemedBox
      borderStyle="single"
      borderColor="border"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
    >
      <Box>
        {TAB_ORDER.map((tab, index) => (
          <Box key={tab} marginRight={index < TAB_ORDER.length - 1 ? 1 : 0}>
            <Text inverse={activeTab === tab} bold={activeTab === tab}>
              {index + 1} {TAB_LABEL[tab]}
            </Text>
          </Box>
        ))}
        <Box flexGrow={1} />
        <ThemedText dimColor>scrollable content area below</ThemedText>
      </Box>
    </ThemedBox>
  )
}

function OverviewTab({
  staticInfo,
  snapshot,
  columns,
}: {
  staticInfo: StaticInfo
  snapshot: RuntimeSnapshot
  columns: number
}) {
  const dual = columns >= 96
  const load1 = snapshot.loadAverage?.[0] ?? 0
  const loadTone = toneForLoad(load1 / Math.max(1, staticInfo.cpuCores))
  const eventLoopTone = toneForLoad(snapshot.eventLoopMean / 40)

  return (
    <Box flexDirection="column" gap={1}>
      <SectionFrame
        title="Realtime overview"
        tone="accent"
        right={<ThemedText dimColor>{snapshot.sampleIntervalMs}ms sampling</ThemedText>}
      >
        <Box flexDirection={dual ? 'row' : 'column'} gap={1}>
          <MetricCard
            label="System CPU"
            value={formatPercent(snapshot.systemCpu)}
            note={`${staticInfo.cpuCores} logical cores`}
            tone={toneForLoad(snapshot.systemCpu / 100)}
            trend={sparkline(snapshot.histories.systemCpu)}
          />
          <MetricCard
            label="Memory used"
            value={formatBytes(snapshot.usedMemory)}
            note={`${formatBytes(snapshot.freeMemory)} free`}
            tone={toneForLoad(snapshot.usedMemory / staticInfo.totalMemory)}
            trend={sparkline(snapshot.histories.memoryPressure)}
          />
        </Box>
        <Box marginTop={1} flexDirection={dual ? 'row' : 'column'} gap={1}>
          <MetricCard
            label="Process RSS"
            value={formatBytes(snapshot.rss)}
            note={`${formatPercent((snapshot.rss / staticInfo.totalMemory) * 100)} of host memory`}
            tone="assistant"
            trend={sparkline(snapshot.histories.rssPressure)}
          />
          <MetricCard
            label="Process CPU"
            value={formatPercent(snapshot.processCpu)}
            note="single-process share of one core"
            tone={toneForLoad(snapshot.processCpu / 100)}
            trend={sparkline(snapshot.histories.processCpu)}
          />
        </Box>
        <Box marginTop={1} flexDirection={dual ? 'row' : 'column'} gap={1}>
          <MetricCard
            label="Event loop mean"
            value={formatMs(snapshot.eventLoopMean)}
            note={`max ${formatMs(snapshot.eventLoopMax)}`}
            tone={eventLoopTone}
            trend={sparkline(snapshot.histories.loopDelay)}
          />
          <MetricCard
            label="Load average"
            value={snapshot.loadAverage ? load1.toFixed(2) : 'n/a'}
            note={snapshot.loadAverage ? `5m ${snapshot.loadAverage[1].toFixed(2)} · 15m ${snapshot.loadAverage[2].toFixed(2)}` : 'not exposed on windows'}
            tone={loadTone}
          />
        </Box>
      </SectionFrame>

      <SectionFrame
        title="Pressure lines"
        tone="assistant"
        right={<ThemedText dimColor>normalized across the current host</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <ProgressLine
            label="System CPU"
            ratio={snapshot.systemCpu / 100}
            meta={`${staticInfo.cpuModel}`}
            tone={toneForLoad(snapshot.systemCpu / 100)}
            width={Math.max(16, Math.min(34, columns - 38))}
          />
          <ProgressLine
            label="Host memory pressure"
            ratio={snapshot.usedMemory / staticInfo.totalMemory}
            meta={`${formatBytes(snapshot.usedMemory)} / ${formatBytes(staticInfo.totalMemory)}`}
            tone={toneForLoad(snapshot.usedMemory / staticInfo.totalMemory)}
            width={Math.max(16, Math.min(34, columns - 38))}
          />
          <ProgressLine
            label="Process RSS share"
            ratio={snapshot.rss / staticInfo.totalMemory}
            meta={`${formatBytes(snapshot.rss)} rss`}
            tone="assistant"
            width={Math.max(16, Math.min(34, columns - 38))}
          />
          <ProgressLine
            label="Event loop delay"
            ratio={clamp(snapshot.eventLoopMean / 40, 0, 1)}
            meta={`mean ${formatMs(snapshot.eventLoopMean)} · max ${formatMs(snapshot.eventLoopMax)}`}
            tone={eventLoopTone}
            width={Math.max(16, Math.min(34, columns - 38))}
          />
        </Box>
      </SectionFrame>

      <SectionFrame
        title="Current runtime"
        tone="success"
        right={<ThemedText dimColor>{staticInfo.hostname}</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <InfoRow label="System uptime" value={formatDuration(snapshot.systemUptime)} />
          <InfoRow label="Process uptime" value={formatDuration(snapshot.processUptime)} />
          <InfoRow label="Terminal" value={`${snapshot.terminalColumns} columns × ${snapshot.terminalRows} rows`} />
          <InfoRow label="Load average" value={formatLoadAverage(snapshot.loadAverage)} />
          <InfoRow label="Working directory" value={process.cwd()} />
        </Box>
      </SectionFrame>
    </Box>
  )
}

function MachineTab({
  staticInfo,
  snapshot,
  columns,
}: {
  staticInfo: StaticInfo
  snapshot: RuntimeSnapshot
  columns: number
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <SectionFrame
        title="Machine identity"
        tone="accent"
        right={<ThemedText dimColor>{staticInfo.nodeVersion}</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <InfoRow label="Hostname" value={staticInfo.hostname} />
          <InfoRow label="Platform" value={`${staticInfo.platform}`} />
          <InfoRow label="Architecture" value={staticInfo.arch} />
          <InfoRow label="CPU model" value={staticInfo.cpuModel} />
          <InfoRow label="CPU cores" value={String(staticInfo.cpuCores)} />
          <InfoRow label="Total memory" value={formatBytes(staticInfo.totalMemory)} />
          <InfoRow label="Node version" value={staticInfo.nodeVersion} />
        </Box>
      </SectionFrame>

      <SectionFrame
        title="Host state"
        tone="warning"
        right={<ThemedText dimColor>live system snapshot</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <ProgressLine
            label="Used memory"
            ratio={snapshot.usedMemory / staticInfo.totalMemory}
            meta={`${formatBytes(snapshot.freeMemory)} free`}
            tone={toneForLoad(snapshot.usedMemory / staticInfo.totalMemory)}
            width={Math.max(16, Math.min(36, columns - 38))}
          />
          <ProgressLine
            label="CPU load"
            ratio={snapshot.systemCpu / 100}
            meta={`${formatPercent(snapshot.systemCpu)} active`}
            tone={toneForLoad(snapshot.systemCpu / 100)}
            width={Math.max(16, Math.min(36, columns - 38))}
          />
          <InfoRow label="System uptime" value={formatDuration(snapshot.systemUptime)} />
          <InfoRow label="Load average" value={formatLoadAverage(snapshot.loadAverage)} />
          <InfoRow
            label="Terminal size"
            value={`${snapshot.terminalColumns}x${snapshot.terminalRows}`}
          />
        </Box>
      </SectionFrame>

      <SectionFrame
        title="Sampling notes"
        tone="assistant"
        right={<ThemedText dimColor>no extra runtime deps</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <ThemedText>
            CPU usage comes from delta sampling over `os.cpus()` time slices.
          </ThemedText>
          <ThemedText>
            Event loop delay comes from `monitorEventLoopDelay()` in
            `node:perf_hooks`.
          </ThemedText>
          <ThemedText>
            Load average is shown only on platforms where Node exposes it.
          </ThemedText>
        </Box>
      </SectionFrame>
    </Box>
  )
}

function ProcessTab({
  staticInfo,
  snapshot,
  columns,
}: {
  staticInfo: StaticInfo
  snapshot: RuntimeSnapshot
  columns: number
}) {
  const heapRatio =
    snapshot.heapTotal > 0 ? snapshot.heapUsed / snapshot.heapTotal : 0

  return (
    <Box flexDirection="column" gap={1}>
      <SectionFrame
        title="Process identity"
        tone="accent"
        right={<ThemedText dimColor>pid {process.pid}</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <InfoRow label="PID" value={String(process.pid)} />
          <InfoRow label="Node" value={process.version} />
          <InfoRow label="Current working dir" value={process.cwd()} />
          <InfoRow label="Process uptime" value={formatDuration(snapshot.processUptime)} />
          <InfoRow label="Terminal size" value={`${snapshot.terminalColumns}x${snapshot.terminalRows}`} />
        </Box>
      </SectionFrame>

      <SectionFrame
        title="Process memory"
        tone="assistant"
        right={<ThemedText dimColor>{formatBytes(snapshot.rss)} rss</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <ProgressLine
            label="Heap used"
            ratio={heapRatio}
            meta={`${formatBytes(snapshot.heapUsed)} / ${formatBytes(snapshot.heapTotal)}`}
            tone={toneForLoad(heapRatio)}
            width={Math.max(16, Math.min(36, columns - 38))}
          />
          <ProgressLine
            label="RSS share of host"
            ratio={snapshot.rss / staticInfo.totalMemory}
            meta={`${formatPercent((snapshot.rss / staticInfo.totalMemory) * 100)} of system memory`}
            tone="assistant"
            width={Math.max(16, Math.min(36, columns - 38))}
          />
          <InfoRow label="External" value={formatBytes(snapshot.external)} />
          <InfoRow label="Array buffers" value={formatBytes(snapshot.arrayBuffers)} />
        </Box>
      </SectionFrame>

      <SectionFrame
        title="Runtime responsiveness"
        tone="warning"
        right={<ThemedText dimColor>{staticInfo.hostname}</ThemedText>}
      >
        <Box flexDirection="column" gap={1}>
          <MetricCard
            label="Process CPU"
            value={formatPercent(snapshot.processCpu)}
            note="single-process share of one core"
            tone={toneForLoad(snapshot.processCpu / 100)}
            trend={sparkline(snapshot.histories.processCpu)}
          />
          <MetricCard
            label="Event loop mean"
            value={formatMs(snapshot.eventLoopMean)}
            note={`max ${formatMs(snapshot.eventLoopMax)} during the last sample window`}
            tone={toneForLoad(snapshot.eventLoopMean / 40)}
            trend={sparkline(snapshot.histories.loopDelay)}
          />
        </Box>
      </SectionFrame>
    </Box>
  )
}

function DashboardApp() {
  const { exit } = useApp()
  const { columns, rows } = useTerminalSize()
  const [theme, setTheme] = useTheme()
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const scrollRef = useRef<ScrollBoxHandle>(null)
  const { staticInfo, snapshot } = useMachineMonitor(columns, rows)

  useEffect(() => {
    scrollRef.current?.scrollTo(0)
  }, [activeTab])

  useInput((input, key) => {
    const lower = input.toLowerCase()
    const pageStep = Math.max(8, rows - 10)

    if (lower === 'q') {
      exit()
      return
    }

    if (lower === 't') {
      setTheme(theme === 'dark' ? 'light' : 'dark')
      return
    }

    if (key.leftArrow) {
      setActiveTab(current => {
        const index = TAB_ORDER.indexOf(current)
        return TAB_ORDER[(index + TAB_ORDER.length - 1) % TAB_ORDER.length]!
      })
      return
    }

    if (key.rightArrow) {
      setActiveTab(current => {
        const index = TAB_ORDER.indexOf(current)
        return TAB_ORDER[(index + 1) % TAB_ORDER.length]!
      })
      return
    }

    if (lower === '1') setActiveTab('overview')
    if (lower === '2') setActiveTab('machine')
    if (lower === '3') setActiveTab('process')

    if (lower === 'j' || key.downArrow) {
      scrollRef.current?.scrollBy(2)
      return
    }

    if (lower === 'k' || key.upArrow) {
      scrollRef.current?.scrollBy(-2)
      return
    }

    if (key.wheelDown) {
      scrollRef.current?.scrollBy(3)
      return
    }

    if (key.wheelUp) {
      scrollRef.current?.scrollBy(-3)
      return
    }

    if (key.pageDown) {
      scrollRef.current?.scrollBy(pageStep)
      return
    }

    if (key.pageUp) {
      scrollRef.current?.scrollBy(-pageStep)
      return
    }

    if (key.home) {
      scrollRef.current?.scrollTo(0)
      return
    }

    if (key.end) {
      scrollRef.current?.scrollToBottom()
    }
  })

  const footerSegments = [
    { content: 'local monitor', color: 'cyan' as const },
    { content: TAB_LABEL[activeTab] },
    { content: theme === 'dark' ? 'midnight theme' : 'paper theme' },
    { content: '', flex: true },
    { content: 'j/k scroll · PgUp/PgDn · Home/End · wheel' },
  ]

  return (
    <AlternateScreen>
      <Box flexDirection="column" height="100%" paddingX={1} paddingY={0}>
        <Header snapshot={snapshot} />

        <Box marginTop={1}>
          <NavBar activeTab={activeTab} />
        </Box>

        <Box flexGrow={1} minHeight={0} marginTop={1}>
          <ScrollBox ref={scrollRef} flexDirection="column" flexGrow={1}>
            <Tabs
              hidden
              selectedTab={activeTab}
              onTabChange={tabId => setActiveTab(tabId as DashboardTab)}
            >
              <Tab id="overview" title="Overview">
                <OverviewTab
                  staticInfo={staticInfo}
                  snapshot={snapshot}
                  columns={columns}
                />
              </Tab>
              <Tab id="machine" title="Machine">
                <MachineTab
                  staticInfo={staticInfo}
                  snapshot={snapshot}
                  columns={columns}
                />
              </Tab>
              <Tab id="process" title="Process">
                <ProcessTab
                  staticInfo={staticInfo}
                  snapshot={snapshot}
                  columns={columns}
                />
              </Tab>
            </Tabs>
          </ScrollBox>
        </Box>

        <Box marginTop={1}>
          <StatusLine segments={footerSegments} />
        </Box>
      </Box>
    </AlternateScreen>
  )
}

function App() {
  return (
    <ThemeProvider initialState="dark">
      <DashboardApp />
    </ThemeProvider>
  )
}

render(<App />)
