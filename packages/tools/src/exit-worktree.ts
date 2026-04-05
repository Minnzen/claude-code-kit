import { exec } from "node:child_process";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const DEFAULT_TIMEOUT = 30_000;

export const inputSchema = z.object({
  path: z.string().describe("Filesystem path of the worktree to exit"),
  keep: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, keep the worktree on disk (only unregister from git). If false (default), remove the worktree directory entirely"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  const worktreePath = path.resolve(ctx.workingDirectory, input.path);

  if (input.keep) {
    return {
      content: `Worktree kept at: ${worktreePath}\nThe worktree directory and branch remain intact. Use \`git worktree remove <path>\` later to clean up, or \`git worktree prune\` after manually deleting the directory.`,
      metadata: { path: worktreePath, kept: true },
    };
  }

  const cmd = `git worktree remove ${JSON.stringify(worktreePath)} --force`;

  return new Promise((resolve) => {
    exec(cmd, { cwd: ctx.workingDirectory, timeout: DEFAULT_TIMEOUT }, (err, stdout, stderr) => {
      const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
      if (err) {
        resolve({ content: output || err.message, isError: true });
        return;
      }
      resolve({
        content: `Worktree removed: ${worktreePath}`,
        metadata: { path: worktreePath, kept: false },
      });
    });
  });
}

export const exitWorktreeTool: ToolDefinition<Input> = {
  name: "ExitWorktree",
  description: `Removes or keeps a git worktree that was previously created with EnterWorktree.

# Behavior

- \`keep=false\` (default): Runs \`git worktree remove\` to delete the worktree directory and unregister it from git. Any uncommitted changes in the worktree will be lost.
- \`keep=true\`: Leaves the worktree directory and branch intact. Returns a reminder of how to clean up manually later.

# Inputs

- \`path\`: The filesystem path of the worktree (as returned by EnterWorktree).
- \`keep\`: Whether to preserve the worktree on disk (default: false).

# Notes

- The branch created by EnterWorktree is NOT deleted — only the worktree checkout is removed. Delete the branch separately with \`git branch -d <name>\` if no longer needed.
- If the worktree has uncommitted changes and \`keep=false\`, the removal is forced.`,
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: DEFAULT_TIMEOUT,
};
