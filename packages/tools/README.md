# @claude-code-kit/tools

Built-in tool collection for the [claude-code-kit](https://github.com/Minnzen/claude-code-kit) agent framework.

This package has two layers:

- `builtinTools`: 10 ready-to-use tools that form the default stable surface in `v0.3.x`
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
  model: "claude-sonnet-4-20250514",
  tools: builtinTools,
});
```

`builtinTools` includes only the ready-to-use core toolset. Advanced factories are opt-in and should be added explicitly when you want those workflows.

Or import individual tools:

```ts
import { bashTool, readTool, editTool } from "@claude-code-kit/tools";
```

## License

MIT
