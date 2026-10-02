# @claude-code-kit/tools

Built-in tool collection for the [claude-code-kit](https://github.com/Minnzen/claude-code-kit) agent framework.

## Installation

```bash
pnpm add @claude-code-kit/tools@0.4.0 @claude-code-kit/agent@0.4.0
```

Version `0.4.0` requires Node.js 22+. Install the relevant optional provider SDK separately (`@anthropic-ai/sdk` or `openai`) when using that provider.

This package has two layers:

- `builtinTools`: 10 ready-to-use tools that form the supported default tool surface
- Advanced factories: opt-in orchestration and integration helpers that are still evolving during `0.x`

## Ready-to-use built-ins

| Tool | Description | Read-only |
|------|-------------|-----------|
| `Bash` | Execute shell commands | No |
| `Read` | Read file contents with line numbers | Yes |
| `Edit` | Edit files via unique string replacement | No |
| `Write` | Write/create files with auto-mkdir | No |
| `Glob` | Find files by glob pattern | Yes |
| `Grep` | Search file contents with regex | Yes |
| `WebFetch` | Make HTTP requests | Yes (GET) |
| `WebSearch` | Search the public web with domain allow/block filters | Yes |
| `EnterWorktree` | Create and enter a git worktree | No |
| `ExitWorktree` | Clean up and exit a git worktree | No |

## Advanced factories

| Export | Produces | Status | Description |
|--------|----------|--------|-------------|
| `createLspTool` | `LSP` | Experimental | Language Server Protocol queries against a caller-provided transport |
| `createSubagentTool` | `Agent` | Experimental | Delegates isolated work to a child agent |
| `createTaskTool` | `TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList` | Experimental | In-memory task orchestration toolset |
| `notebookEditTool` | `NotebookEdit` | Experimental | Edit Jupyter notebook cells |

## Usage

```ts
import { Agent, AnthropicProvider } from "@claude-code-kit/agent";
import { builtinTools } from "@claude-code-kit/tools";

const agent = new Agent({
  provider: new AnthropicProvider({ apiKey: "..." }),
  model: process.env.ANTHROPIC_MODEL!,
  tools: builtinTools,
});
```

`builtinTools` includes only the ready-to-use core toolset. Advanced factories are opt-in and should be added explicitly when you want those workflows.

The Agent default permits safe read-only tools and denies writes. Supply an explicit approval callback or allow list for Bash, edits, writes, and worktree changes. A tool's read-only metadata is a permission input, not a process sandbox. File/search tools enforce lexical and real-path containment within `workingDirectory`; this closes static traversal/symlink escapes but is not an OS sandbox against another process swapping ancestors between validation and IO. WebFetch pins the validated DNS address, validates each redirect destination, and bypasses shared caching when custom headers are present. Background Bash commands remain caller-owned after launch.

Or import individual tools:

```ts
import { bashTool, readTool, editTool } from "@claude-code-kit/tools";
```

## License

MIT
