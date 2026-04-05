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
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  const cwd = input.cwd ?? ctx.workingDirectory;
  const timeout = Math.min(input.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

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
      metadata: { pid, outputFile: outFile },
    };
  }

  return new Promise((resolve) => {
    const onAbort = () => {
      child.kill("SIGTERM");
      resolve({ content: "Command aborted", isError: true });
    };

    const child = exec(input.command, { cwd, timeout, env: { ...process.env, ...ctx.env } }, (err, stdout, stderr) => {
      // Clean up abort listener to avoid leaking event handlers
      ctx.abortSignal.removeEventListener("abort", onAbort);

      const output = (stdout + (stderr ? `\n${stderr}` : "")).slice(0, MAX_RESULT_SIZE);
      if (err && err.killed) {
        resolve({ content: `Command timed out after ${timeout}ms\n${output}`, isError: true });
        return;
      }
      if (err) {
        resolve({ content: output || err.message, isError: true, metadata: { exitCode: err.code } });
        return;
      }
      resolve({ content: output || "(no output)" });
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
  description: "Execute a shell command and return its stdout/stderr output",
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: DEFAULT_TIMEOUT,
};
