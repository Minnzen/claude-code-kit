import { exec } from "node:child_process";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 100_000;

export const inputSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  cwd: z.string().optional().describe("Working directory for the command"),
  timeout: z.number().optional().default(30_000).describe("Timeout in milliseconds"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  const cwd = input.cwd ?? ctx.workingDirectory;
  const timeout = input.timeout;

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
  name: "bash",
  description: "Execute a shell command and return its stdout/stderr output",
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: 30_000,
};
