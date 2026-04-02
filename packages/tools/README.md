# @claude-code-kit/tools

Built-in tool collection for the [claude-code-kit](https://github.com/Minnzen/claude-code-kit) agent framework.

## Tools

| Tool | Description | Read-only |
|------|-------------|-----------|
| `bash` | Execute shell commands | No |
| `read` | Read file contents with line numbers | Yes |
| `edit` | Edit files via unique string replacement | No |
| `write` | Write/create files with auto-mkdir | No |
| `glob` | Find files by glob pattern | Yes |
| `grep` | Search file contents with regex | Yes |
| `web_fetch` | Make HTTP requests | Yes (GET) |

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

Or import individual tools:

```ts
import { bashTool, readTool, editTool } from "@claude-code-kit/tools";
```

## License

MIT
