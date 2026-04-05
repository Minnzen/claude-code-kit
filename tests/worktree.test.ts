import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enterWorktreeTool } from "../packages/tools/src/enter-worktree.ts";
import { exitWorktreeTool } from "../packages/tools/src/exit-worktree.ts";
import type { ToolContext } from "../packages/agent/src/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let repoDir: string;

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDirectory: repoDir,
    abortSignal: new AbortController().signal,
    env: {},
    ...overrides,
  };
}

/** Create a temporary git repo with one commit so worktrees can branch from it. */
function initRepo(): string {
  const dir = path.join(tmpDir, "repo");
  fs.mkdirSync(dir, { recursive: true });
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "init");
  execSync("git add . && git commit -m init", { cwd: dir });
  // Resolve symlinks (macOS /var -> /private/var) to match git rev-parse output
  return fs.realpathSync(dir);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cck-worktree-test-"));
  repoDir = initRepo();
});

afterEach(() => {
  // Clean up worktrees before removing the temp dir to avoid git lock issues
  try {
    execSync("git worktree prune", { cwd: repoDir });
  } catch {
    // ignore — repo may already be gone
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// EnterWorktree
// ---------------------------------------------------------------------------

describe("enterWorktreeTool", () => {
  it("creates a worktree with an explicit branch and path", async () => {
    const wtPath = path.join(tmpDir, "my-wt");
    const result = await enterWorktreeTool.execute!(
      { branch: "feat-test", path: wtPath },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("feat-test");
    expect(result.content).toContain(wtPath);
    expect(result.metadata).toEqual({ branch: "feat-test", path: wtPath });

    // The worktree directory should exist and be a git checkout
    expect(fs.existsSync(path.join(wtPath, ".git"))).toBe(true);

    // The branch should exist
    const branches = execSync("git branch", { cwd: repoDir, encoding: "utf-8" });
    expect(branches).toContain("feat-test");
  });

  it("auto-generates branch name when omitted", async () => {
    const result = await enterWorktreeTool.execute!({}, makeCtx());

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("worktree-");
    expect(result.metadata).toHaveProperty("branch");
    expect(result.metadata).toHaveProperty("path");

    const branch = result.metadata!.branch as string;
    expect(branch).toMatch(/^worktree-/);

    // Worktree should exist at default location (.worktrees/<branch>)
    const wtPath = result.metadata!.path as string;
    expect(wtPath).toContain(".worktrees");
    expect(fs.existsSync(wtPath)).toBe(true);
  });

  it("uses default path under .worktrees when path is omitted", async () => {
    const result = await enterWorktreeTool.execute!(
      { branch: "default-path-test" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const expectedPath = path.join(repoDir, ".worktrees", "default-path-test");
    expect(result.metadata!.path).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it("returns an error when not inside a git repo", async () => {
    const nonGitDir = path.join(tmpDir, "not-a-repo");
    fs.mkdirSync(nonGitDir, { recursive: true });

    const result = await enterWorktreeTool.execute!(
      { branch: "will-fail" },
      makeCtx({ workingDirectory: nonGitDir }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/not inside a git repository/i);
  });

  it("returns an error when branch already exists", async () => {
    // Create first worktree
    await enterWorktreeTool.execute!({ branch: "dup-branch" }, makeCtx());

    // Try to create another with the same branch
    const result = await enterWorktreeTool.execute!(
      { branch: "dup-branch", path: path.join(tmpDir, "dup-wt") },
      makeCtx(),
    );

    expect(result.isError).toBe(true);
  });

  it("isReadOnly is false", () => {
    expect(enterWorktreeTool.isReadOnly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExitWorktree
// ---------------------------------------------------------------------------

describe("exitWorktreeTool", () => {
  it("removes a worktree when keep=false", async () => {
    const wtPath = path.join(tmpDir, "to-remove");
    await enterWorktreeTool.execute!(
      { branch: "remove-me", path: wtPath },
      makeCtx(),
    );
    expect(fs.existsSync(wtPath)).toBe(true);

    const result = await exitWorktreeTool.execute!(
      { path: wtPath, keep: false },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("removed");
    expect(result.metadata).toEqual({ path: wtPath, kept: false });
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  it("keeps a worktree when keep=true", async () => {
    const wtPath = path.join(tmpDir, "to-keep");
    await enterWorktreeTool.execute!(
      { branch: "keep-me", path: wtPath },
      makeCtx(),
    );

    const result = await exitWorktreeTool.execute!(
      { path: wtPath, keep: true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("kept");
    expect(result.metadata).toEqual({ path: wtPath, kept: true });
    // Directory should still exist
    expect(fs.existsSync(wtPath)).toBe(true);
  });

  it("defaults keep to false", async () => {
    const wtPath = path.join(tmpDir, "default-remove");
    await enterWorktreeTool.execute!(
      { branch: "default-rm", path: wtPath },
      makeCtx(),
    );

    const result = await exitWorktreeTool.execute!(
      { path: wtPath },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("removed");
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  it("returns an error for a non-existent worktree path", async () => {
    const result = await exitWorktreeTool.execute!(
      { path: path.join(tmpDir, "does-not-exist") },
      makeCtx(),
    );

    expect(result.isError).toBe(true);
  });

  it("isReadOnly is false", () => {
    expect(exitWorktreeTool.isReadOnly).toBe(false);
  });
});
