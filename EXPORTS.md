# Public API contract

This describes the unpublished `0.4.0` release candidate. The last verified npm version is `0.3.1`; the candidate's added APIs and runtime requirements do not apply to that stable release. Package-root exports and declared subpaths are public; source-file and `dist` deep imports are internal. `0.x` APIs may change, so pin package versions and review migration notes in [RELEASE.md](./RELEASE.md).

Runtime baseline: Node.js 22+, React 19.2.x and react-reconciler 0.33.x for UI/rendering. Packages expose ESM `import` and CommonJS `require` entry points with TypeScript declarations. React peers do not apply to the headless agent/tools packages.

Repository development requires Node.js 22.12+; that build-tool floor is separate from the packed packages' Node.js 22.0+ runtime floor. React 19.2.4 and react-reconciler 0.33.0 are the tested pairing.

## Supported core surface

| Package | Exports | Contract |
|---|---|---|
| `shared` | `gt`, `gte`, `lt`, `lte`, `order`, `satisfies`, `sliceAnsi`, `env`, `isEnvTruthy`, `isEnvDefinedFalsy`, `execFileNoThrow`, debug/log helpers, Intl segmenters | Shared runtime utilities; no React dependency |
| `shared/yoga-layout` | Yoga layout port and its exported types | The sole declared shared subpath; no native binding |
| `ink-renderer` | `render`, `renderSync`, `createRoot`, `Box`, `Text`, `Spacer`, `Newline`, `Link`, `Button`, `ScrollBox`, `AlternateScreen`, `RawAnsi`, `Ansi`, `ErrorOverview`, `NoSelect` | Terminal rendering and primitives |
| `ink-renderer` | `useInput`, `useApp`, `useStdin`, terminal/selection/cursor hooks, animation hooks, color/layout helpers, contexts and associated types | Public renderer helpers; timer hooks require the renderer clock context |
| `ui` | Renderer re-exports, `REPL`, `MessageList`, `PromptInput`, `Select`, `MultiSelect`, `Spinner`, `StreamingText`, `ProgressBar`, `StatusIcon`, `StatusLine`, `Divider`, `Markdown`, `StreamingMarkdown`, `MarkdownTable`, `DiffView`, `SearchOverlay`, `WelcomeScreen`, `ClawdLogo` | Composable terminal UI; display-oriented `Message` differs from agent `Message` |
| `ui` | `ThemeProvider`, `useTheme`, `useThemeSetting`, `usePreviewTheme`, `getTheme`, `color`, `Dialog`, `Tabs`, `Tab`, `Pane`, `FuzzyPicker`, `ThemedBox`, `ThemedText`, `Byline`, `KeyboardShortcutHint`, `ListItem`, `LoadingState`, `Ratchet` | Theme/design-system components; `useTheme` belongs to UI |
| `ui` | Commands and command registry, keybinding setup/hooks/defaults, `useTerminalSize`, `useDoublePress`, `useVirtualScroll`, `VirtualList`, associated types | Input and viewport helpers; complete prop contracts live in source and component docs |
| `agent` | `Agent`, `AnthropicProvider`, `OpenAIProvider`, `MockProvider`, `ToolRegistry`, permission handlers, `ContextManager`, token estimators | Headless agent core; providers load optional SDKs |
| `agent` | `InMemorySession`, `FileSession`, `FileSessionStore`, `NoopCompaction`, `MicroCompaction`, `SummarizationCompaction`, `SlidingWindowCompaction`, `LayeredCompaction`, compaction constants and associated types | Explicit persistence and configurable best-effort context reduction |
| `tools` | `builtinTools`, `bashTool`, `readTool`, `editTool`, `writeTool`, `globTool`, `grepTool`, `webFetchTool`, `webSearchTool`, `enterWorktreeTool`, `exitWorktreeTool` | Ten local ready-to-use tools; Agent permissions govern execution |

The named core APIs are the supported surface of the candidate. This table groups type exports with their APIs; the exact export lists are the package `src/index.ts` files and `package.json` export maps.

`PermissionResult` has `decision: 'allow' | 'deny'`, optional `reason`, and optional `approvalRequired`. The flag allows an interactive host to request approval for a missing-approval denial; it does not permit headless execution or UI override of explicit denial. `REPL.onError` may return `void` or `Promise<void>`.

## Evolving integrations

| Package | Exports | Required integration |
|---|---|---|
| `agent` | `MCPClient`, MCP configuration types | Caller-installed MCP SDK and server; stdio/Streamable HTTP tools are discovered dynamically |
| `agent` | `AuthRegistry`, `createAuth`, `FileAuthStorage`, `MemoryAuthStorage`, `PRESET_PROVIDERS`, `startOAuthFlow`, `openBrowser`, auth/OAuth types | Provider-specific registration, credentials, and OAuth endpoints |
| `ui` | `useAgent`, `AgentProvider`, `AgentContext`, `useAgentContext`, `AgentREPL`, `AuthFlowUI`, bridge/auth types | Optional `@claude-code-kit/agent` peer; cancellation/permission bridge owns lifecycle wiring |
| `tools` | `createLspTool`, `LspConnection` | Caller-provided LSP transport |
| `tools` | `createSubagentTool`, subagent types | Caller-provided child-agent factory; not a built-in coordinator |
| `tools` | `createTaskTool`, task types | In-memory task CRUD and listings |
| `tools` | `notebookEditTool` | JSON notebook editing |

These APIs are opt-in and experimental during `0.x`; their existence does not imply a hosted service, working server transport, or live OAuth acceptance.

## Internal and removed APIs

- Undeclared subpaths, private source modules, reconciler internals, and internal caches are unsupported deep imports.
- The renderer's no-op `useTheme` export is removed. Use the UI hook with `ThemeProvider`.
- The project does not expose a multi-agent coordinator, MessageBus, framework-level retry policy, or structured-output schema contract.
