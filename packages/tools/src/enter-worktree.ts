import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const DEFAULT_TIMEOUT = 30_000;

export const inputSchema = z.object({
  branch: z
    .string()
    .optional()
    .describe("Branch name for the worktree. Auto-generated if omitted (e.g. worktree-<timestamp>)"),
  path: z
    .string()
    .optional()
    .describe("Filesystem path for the worktree. Defaults to .worktrees/<branch> relative to the repo root"),
});

type Input = z.infer<typeof inputSchema>;

function generateBranchName(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `worktree-${ts}-${rand}`;
}

/** Resolve the git top-level directory for the given cwd. */
function getRepoRoot(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec("git rev-parse --show-toplevel", { cwd }, (err, stdout) => {
      if (err) {
        reject(new Error("Not inside a git repository"));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  const cwd = ctx.workingDirectory;

  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot(cwd);
  } catch {
    return { content: "Not inside a git repository", isError: true };
  }

  const branch = input.branch ?? generateBranchName();
  const worktreePath = input.path
    ? path.resolve(cwd, input.path)
    : path.join(repoRoot, ".worktrees", branch);

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  const cmd = `git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(branch)}`;

  return new Promise((resolve) => {
    exec(cmd, { cwd: repoRoot, timeout: DEFAULT_TIMEOUT }, (err, stdout, stderr) => {
      const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
      if (err) {
        resolve({ content: output || err.message, isError: true });
        return;
      }
      resolve({
        content: `Worktree created.\nBranch: ${branch}\nPath: ${worktreePath}`,
        metadata: { branch, path: worktreePath },
      });
    });
  });
}

export const enterWorktreeTool: ToolDefinition<Input> = {
  name: "EnterWorktree",
  description: `Creates an isolated git worktree so the agent can work in a separate directory without affecting the main working tree.

A worktree is a linked checkout of the same repository at a different path, on its own branch. This is useful for:
- Running experimental changes without touching the current branch
- Parallel work on multiple features
- Safe exploration that can be discarded cleanly

The tool creates a new branch and checks it out in the worktree directory. Use ExitWorktree to clean up when done.

# Inputs

- \`branch\`: Name for the new branch. Auto-generated if omitted.
- \`path\`: Filesystem path for the worktree. Defaults to \`.worktrees/<branch>\` under the repo root.

# Notes

- The worktree shares the same git object store as the main repo — commits, stashes, and refs are visible across all worktrees.
- You cannot check out a branch that is already checked out in another worktree.
- After creation, use the returned path as the working directory for subsequent tool calls.`,
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: DEFAULT_TIMEOUT,
};
