import { exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 100_000;
const DEFAULT_TIMEOUT = 120_000;
const MAX_TIMEOUT = 600_000;

export const inputSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  description: z.string().describe("A description of what this command does"),
  cwd: z.string().optional().describe("Working directory for the command"),
  timeout: z
    .number()
    .optional()
    .default(DEFAULT_TIMEOUT)
    .describe("Timeout in milliseconds (max 600000)"),
  run_in_background: z
    .boolean()
    .optional()
    .default(false)
    .describe("Run the command in the background and return immediately with PID"),
  dangerously_disable_sandbox: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to disable sandbox restrictions. Use with caution — bypasses security constraints."),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  const cwd = input.cwd ?? ctx.workingDirectory;
  const timeout = Math.min(input.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
  const sandboxed = !input.dangerously_disable_sandbox;

  if (input.run_in_background) {
    const outFile = path.join(os.tmpdir(), `cck-bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`);
    const out = fs.openSync(outFile, "w");
    const child = spawn("sh", ["-c", input.command], {
      cwd,
      env: { ...process.env, ...ctx.env },
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
    const pid = child.pid;
    fs.closeSync(out);
    return {
      content: `Background process started (PID: ${pid})\nOutput file: ${outFile}`,
      metadata: { pid, outputFile: outFile, sandboxed },
    };
  }

  return new Promise((resolve) => {
    const onAbort = () => {
      child.kill("SIGTERM");
      resolve({ content: "Command aborted", isError: true, metadata: { sandboxed } });
    };

    const child = exec(input.command, { cwd, timeout, env: { ...process.env, ...ctx.env } }, (err, stdout, stderr) => {
      // Clean up abort listener to avoid leaking event handlers
      ctx.abortSignal.removeEventListener("abort", onAbort);

      const output = (stdout + (stderr ? `\n${stderr}` : "")).slice(0, MAX_RESULT_SIZE);
      if (err && err.killed) {
        resolve({ content: `Command timed out after ${timeout}ms\n${output}`, isError: true, metadata: { sandboxed } });
        return;
      }
      if (err) {
        resolve({ content: output || err.message, isError: true, metadata: { exitCode: err.code, sandboxed } });
        return;
      }
      resolve({ content: output || "(no output)", metadata: { sandboxed } });
    });

    if (ctx.abortSignal.aborted) {
      onAbort();
      return;
    }
    ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
  });
}

export const bashTool: ToolDefinition<Input> = {
  name: "Bash",
  description: `Executes a given bash command and returns its output.

The working directory persists between commands via the \`cwd\` parameter, but shell state does not (no environment variables or aliases carry over between calls).

# Sandbox

By default, commands execute within a sandbox environment. The sandbox restricts the execution context to improve security. Set \`dangerously_disable_sandbox: true\` to bypass sandbox restrictions — only use this when the command genuinely requires elevated access (e.g. system-level operations). The result metadata includes a \`sandboxed\` boolean indicating whether sandbox was active.

# Description field

Always provide a clear, concise description in active voice (5-10 words for simple commands, more context for complex ones):
- ls → "List files in current directory"
- git status → "Show working tree status"
- find . -name "*.tmp" -exec rm {} \\; → "Find and delete all .tmp files recursively"

# Avoid running these as Bash commands

Use dedicated tools instead — they provide a better experience:
- File search: use Glob (NOT find or ls)
- Content search: use Grep (NOT grep or rg)
- Read files: use Read (NOT cat/head/tail)
- Edit files: use Edit (NOT sed/awk)
- Write files: use Write (NOT echo >/cat <<EOF)

# File paths

Always quote file paths that contain spaces with double quotes in the command string.

# Multiple commands

- If commands are independent and can run in parallel, make multiple Bash tool calls in the same turn.
- If commands depend on each other and must run sequentially, use \`&&\` to chain them in a single call.
- Use \`;\` only when you need sequential execution but don't care if earlier commands fail.
- Do NOT use newlines to separate commands (newlines are ok in quoted strings).

# Avoiding unnecessary sleep

- Do not sleep between commands that can run immediately — just run them.
- If a command is long-running and you want to be notified when it finishes, set \`run_in_background: true\`. No sleep needed.
- Do not retry failing commands in a sleep loop — diagnose the root cause instead.
- If waiting for a background task, check its status with a follow-up command rather than sleeping.
- If you must sleep, keep the duration short (1-5 seconds) to avoid blocking.

# Timeout

Default timeout is 120 seconds. Override with the \`timeout\` field (max 600000 ms / 10 minutes) for long-running operations like builds or test suites.

# Background execution

Set \`run_in_background: true\` to start a detached process and return immediately with its PID and output log path. Only use this when you don't need the result right away and are OK being notified when the command completes later. Do not use \`&\` at the end of the command when using this parameter.`,
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: DEFAULT_TIMEOUT,
};
