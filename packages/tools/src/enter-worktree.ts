import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import { z } from "zod";
import { runGit } from "./git-process.js";
import { resolveContainedPath } from "./path-safety.js";

const DEFAULT_TIMEOUT = 30_000;

export const inputSchema = z.object({
  branch: z
    .string()
    .optional()
    .describe(
      "Branch name for the worktree. Auto-generated if omitted (e.g. worktree-<timestamp>)",
    ),
  path: z
    .string()
    .optional()
    .describe(
      "Filesystem path for the worktree. Defaults to .worktrees/<branch> relative to the repo root",
    ),
});

type Input = z.infer<typeof inputSchema>;

function generateBranchName(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `worktree-${ts}-${rand}`;
}

/** Resolve the git top-level directory for the given cwd. */
function getRepoRoot(cwd: string, ctx: ToolContext): Promise<string> {
  return runGit(["rev-parse", "--show-toplevel"], cwd, ctx);
}

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };
  const cwd = ctx.workingDirectory;

  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot(cwd, ctx);
  } catch {
    return {
      content: ctx.abortSignal.aborted ? "Aborted" : "Not inside a git repository",
      isError: true,
    };
  }

  const branch = input.branch ?? generateBranchName();
  try {
    await runGit(["check-ref-format", "--branch", branch], repoRoot, ctx);
    if (input.path !== undefined && (!input.path.trim() || input.path.includes("\0"))) {
      return { content: "Error: invalid worktree path", isError: true };
    }
    const worktreePath =
      input.path !== undefined
        ? path.resolve(cwd, input.path)
        : await resolveContainedPath(repoRoot, path.join(".worktrees", branch));
    ctx.abortSignal.throwIfAborted();
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    await runGit(["worktree", "add", "-b", branch, "--", worktreePath], repoRoot, ctx);
    return {
      content: `Worktree created.\nBranch: ${branch}\nPath: ${worktreePath}`,
      metadata: { branch, path: worktreePath },
    };
  } catch (error) {
    return {
      content: ctx.abortSignal.aborted ? "Aborted" : (error as Error).message,
      isError: true,
    };
  }
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
  isDestructive: false,
  requiresConfirmation: true,
  timeout: DEFAULT_TIMEOUT,
};
