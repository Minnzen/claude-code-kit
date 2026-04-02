# cck-agent

A mini coding assistant built with claude-code-kit -- a tiny Claude Code in ~120 lines.

## What it does

- Reads, searches, and edits files using real tools from `@claude-code-kit/tools`
- Auto-detects API keys from environment variables (Anthropic, OpenAI, DeepSeek, SiliconFlow, Groq, Ollama)
- Falls back to a realistic mock demo when no API key is found
- Read-only tools (glob, grep, read) auto-approve; destructive tools (bash, edit, write) prompt for permission

## Run

```bash
pnpm install
pnpm --filter agent-cli-example start
```

## Connect a real LLM

Set any supported provider's API key:

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# DeepSeek
export DEEPSEEK_API_KEY=sk-...

# SiliconFlow
export SILICONFLOW_API_KEY=sk-...

# Groq
export GROQ_API_KEY=gsk_...

# Ollama (no key needed, just run ollama locally)
```

The CLI checks providers in order and uses the first one with a valid env var. No key found = demo mode with mock responses.

## Tools

| Tool  | Permission   | Description          |
| ----- | ------------ | -------------------- |
| glob  | Auto-approve | Find files by pattern |
| grep  | Auto-approve | Search file contents  |
| read  | Auto-approve | Read file contents    |
| bash  | Ask user     | Run shell commands    |
| edit  | Ask user     | Edit existing files   |
| write | Ask user     | Write new files       |

## How it works

```
createAuth() -> try env vars -> fall back to MockProvider
                    |
                    v
          Agent({ provider, tools, permissionHandler })
                    |
                    v
              AgentREPL (interactive TUI)
```

All the auth, tools, permission, and UI come from claude-code-kit packages. The example just wires them together.
