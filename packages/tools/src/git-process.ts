import { execFile } from "node:child_process";
import type { ToolContext } from "@claude-code-kit/agent";

export function runGit(args: string[], cwd: string, ctx: ToolContext): Promise<string> {
  ctx.abortSignal.throwIfAborted();
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 30_000,
        signal: ctx.abortSignal,
        env: { ...process.env, ...ctx.env },
      },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
        if (error) reject(new Error(ctx.abortSignal.aborted ? "Aborted" : output || error.message));
        else resolve(output);
      },
    );
  });
}
