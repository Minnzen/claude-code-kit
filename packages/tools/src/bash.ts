import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import { z } from "zod";

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
    .describe(
      "Set to true to disable sandbox restrictions. Use with caution — bypasses security constraints.",
    ),
});

type Input = z.infer<typeof inputSchema>;

function terminate(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    // Shell-only termination leaves its children running after cancellation.
    if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Command aborted", isError: true };
  const cwd = input.cwd ?? ctx.workingDirectory;
  const timeout = Math.min(input.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
  const sandboxed = !input.dangerously_disable_sandbox;

  if (input.run_in_background) {
    const outFile = path.join(
      os.tmpdir(),
      `cck-bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`,
    );
    const out = fs.openSync(outFile, "wx", 0o600);
    const child = spawn("sh", ["-c", input.command], {
      cwd,
      env: { ...process.env, ...ctx.env },
      detached: true,
      stdio: ["ignore", out, out],
    });
    fs.closeSync(out);
    return new Promise((resolve) => {
      const onAbort = () => terminate(child);
      const cleanup = () => ctx.abortSignal.removeEventListener("abort", onAbort);
      ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
      child.once("exit", cleanup);
      child.once("error", (error) => {
        cleanup();
        resolve({
          content: ctx.abortSignal.aborted ? "Command aborted" : error.message,
          isError: true,
          metadata: { sandboxed },
        });
      });
      child.once("spawn", () => {
        if (ctx.abortSignal.aborted) {
          terminate(child);
          resolve({ content: "Command aborted", isError: true, metadata: { sandboxed } });
          return;
        }
        child.unref();
        const pid = child.pid;
        resolve({
          content: `Background process started (PID: ${pid})\nOutput file: ${outFile}`,
          metadata: { pid, outputFile: outFile, sandboxed },
        });
      });
    });
  }

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", input.command], {
      cwd,
      env: { ...process.env, ...ctx.env },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(0, MAX_RESULT_SIZE);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, MAX_RESULT_SIZE);
    });
    const onAbort = () => terminate(child);
    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            terminate(child);
          }, timeout)
        : undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      ctx.abortSignal.removeEventListener("abort", onAbort);
    };
    child.once("error", (error) => {
      cleanup();
      resolve({ content: error.message, isError: true, metadata: { sandboxed } });
    });
    child.once("close", (exitCode) => {
      cleanup();
      const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.slice(0, MAX_RESULT_SIZE);
      if (ctx.abortSignal.aborted) {
        resolve({ content: "Command aborted", isError: true, metadata: { sandboxed } });
      } else if (timedOut) {
        resolve({
          content: `Command timed out after ${timeout}ms\n${output}`,
          isError: true,
          metadata: { sandboxed },
        });
      } else if (exitCode !== 0) {
        resolve({
          content: output || `Command exited with code ${exitCode}`,
          isError: true,
          metadata: { exitCode, sandboxed },
        });
      } else {
        resolve({ content: output || "(no output)", metadata: { sandboxed } });
      }
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

Commands run with a \`sandboxed\` metadata flag (default: true). Set \`dangerously_disable_sandbox: true\` to mark a command as running outside the sandbox boundary. Note: this is currently a policy flag for permission systems and audit trails — actual OS-level sandboxing (Docker/nsjail) is not yet implemented. The flag allows permission handlers to apply different rules for sandboxed vs unsandboxed commands.

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
  isDestructive: true,
  requiresConfirmation: true,
  timeout: DEFAULT_TIMEOUT,
};
