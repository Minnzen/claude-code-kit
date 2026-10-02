import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../packages/agent/src/types.ts";
import { bashTool } from "../packages/tools/src/bash.ts";
import { editTool } from "../packages/tools/src/edit.ts";
import { globTool } from "../packages/tools/src/glob.ts";
import { grepTool } from "../packages/tools/src/grep.ts";
import { notebookEditTool } from "../packages/tools/src/notebook-edit.ts";
import { readTool } from "../packages/tools/src/read.ts";
import { writeTool } from "../packages/tools/src/write.ts";

let temporaryDirectory: string;
let workspace: string;
let outside: string;

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workingDirectory: workspace,
    abortSignal: new AbortController().signal,
    env: {},
    ...overrides,
  };
}

beforeEach(async () => {
  temporaryDirectory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cck-security-")));
  workspace = path.join(temporaryDirectory, "workspace");
  outside = path.join(temporaryDirectory, "outside");
  await fs.mkdir(workspace);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.txt"), "outside-only-marker");
  await fs.writeFile(
    path.join(outside, "secret.ipynb"),
    JSON.stringify({
      nbformat: 4,
      metadata: {},
      cells: [{ cell_type: "code", source: ["secret"], metadata: {} }],
    }),
  );
  await fs.symlink(outside, path.join(workspace, "escape"));
  await fs.symlink(path.join(outside, "secret.txt"), path.join(workspace, "secret-link.txt"));
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

describe("file tool containment", () => {
  it("does not read a file through a directory symlink outside the workspace", async () => {
    const result = await readTool.execute({ file_path: "escape/secret.txt" }, context());
    expect(result.isError).toBe(true);
    expect(result.content).not.toContain("outside-only-marker");
  });

  it("does not overwrite an existing symlink target outside the workspace", async () => {
    const result = await writeTool.execute(
      { file_path: "secret-link.txt", content: "overwritten" },
      context(),
    );
    expect(result.isError).toBe(true);
    expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside-only-marker");
  });

  it("does not create missing descendants through an escaping parent symlink", async () => {
    const result = await writeTool.execute(
      { file_path: "escape/new/deep/file.txt", content: "escaped" },
      context(),
    );
    expect(result.isError).toBe(true);
    await expect(fs.stat(path.join(outside, "new"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not create a target through a dangling external symlink", async () => {
    await fs.symlink(path.join(outside, "missing.txt"), path.join(workspace, "dangling.txt"));
    const result = await writeTool.execute(
      { file_path: "dangling.txt", content: "escaped" },
      context(),
    );
    expect(result.isError).toBe(true);
    await expect(fs.stat(path.join(outside, "missing.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not edit an external symlink target", async () => {
    const result = await editTool.execute(
      {
        file_path: "secret-link.txt",
        old_string: "outside",
        new_string: "changed",
        replace_all: false,
      },
      context(),
    );
    expect(result.isError).toBe(true);
    expect(await fs.readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside-only-marker");
  });

  it("does not edit an external notebook through a directory symlink", async () => {
    const result = await notebookEditTool.execute(
      { notebook_path: "escape/secret.ipynb", edit_mode: "delete", cell_number: 0 },
      context(),
    );
    expect(result.isError).toBe(true);
    expect(
      JSON.parse(await fs.readFile(path.join(outside, "secret.ipynb"), "utf8")).cells,
    ).toHaveLength(1);
  });

  it("allows an internal symlink and newly created internal parent directories", async () => {
    await fs.mkdir(path.join(workspace, "actual"));
    await fs.symlink(path.join(workspace, "actual"), path.join(workspace, "alias"));
    const result = await writeTool.execute(
      { file_path: "alias/new/file.txt", content: "inside" },
      context(),
    );
    expect(result.isError).toBeFalsy();
    expect(await fs.readFile(path.join(workspace, "actual/new/file.txt"), "utf8")).toBe("inside");
  });

  it("allows a canonical absolute path when the working directory is a symlink", async () => {
    const workspaceAlias = path.join(temporaryDirectory, "workspace-alias");
    await fs.symlink(workspace, workspaceAlias);
    await fs.writeFile(path.join(workspace, "inside.txt"), "inside");
    const result = await readTool.execute(
      { file_path: path.join(workspace, "inside.txt") },
      context({ workingDirectory: workspaceAlias }),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("inside");
  });

  it("allows normalized working directories with a trailing separator", async () => {
    await fs.writeFile(path.join(workspace, "inside.txt"), "inside");
    const result = await readTool.execute(
      { file_path: "inside.txt" },
      context({ workingDirectory: `${workspace}${path.sep}` }),
    );
    expect(result.isError).toBeFalsy();
  });
});

describe("search tool containment", () => {
  it("rejects an explicit Grep search outside the workspace", async () => {
    const result = await grepTool.execute(
      { pattern: "outside-only-marker", path: "../outside", output_mode: "content" },
      context(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).not.toContain("outside-only-marker");
  });

  it("rejects an explicit Glob root outside the workspace", async () => {
    const result = await globTool.execute({ pattern: "*.txt", path: outside }, context());
    expect(result.isError).toBe(true);
    expect(result.content).not.toContain("secret.txt");
  });

  it("resolves relative Glob roots against the workspace", async () => {
    await fs.mkdir(path.join(workspace, "sub"));
    await fs.writeFile(path.join(workspace, "sub/inside.txt"), "inside");
    const result = await globTool.execute({ pattern: "*.txt", path: "sub" }, context());
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe("inside.txt");
  });

  it("rejects a Glob pattern with a static prefix outside the workspace", async () => {
    const result = await globTool.execute({ pattern: "../outside/*.txt" }, context());
    expect(result.isError).toBe(true);
    expect(result.content).not.toContain("secret.txt");
  });

  it("rejects a Grep file filter with a static prefix outside the workspace", async () => {
    const result = await grepTool.execute(
      { pattern: "outside-only-marker", glob: "../outside/*.txt", output_mode: "content" },
      context(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).not.toContain("outside-only-marker");
  });

  it("does not return external symlink matches during recursive Glob", async () => {
    await fs.writeFile(path.join(workspace, "inside.txt"), "inside");
    const result = await globTool.execute({ pattern: "**/*.txt" }, context());
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe("inside.txt");
  });

  it("does not read external symlink matches during recursive Grep", async () => {
    const result = await grepTool.execute(
      { pattern: "outside-only-marker", output_mode: "content" },
      context(),
    );
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe("No matches found");
  });

  it("rejects explicitly searching an escaping symlink", async () => {
    const result = await grepTool.execute(
      { pattern: "outside-only-marker", path: "secret-link.txt", output_mode: "content" },
      context(),
    );
    expect(result.isError).toBe(true);
    expect(result.content).not.toContain("outside-only-marker");
  });
});

describe("Bash cancellation", () => {
  it.each([
    false,
    true,
  ])("does not launch a pre-aborted command (background=%s)", async (background) => {
    const controller = new AbortController();
    controller.abort();
    const result = await bashTool.execute(
      {
        command: "printf escaped > aborted.txt",
        description: "Write an abort marker",
        run_in_background: background,
      },
      context({ abortSignal: controller.signal }),
    );
    expect(result.isError).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(fs.stat(path.join(workspace, "aborted.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("terminates shell descendants when an executing command is aborted", async () => {
    const controller = new AbortController();
    const pending = bashTool.execute(
      {
        command: "printf ready > ready.txt; (sleep 0.5; printf escaped > escaped.txt) & wait",
        description: "Run a cancellable child process",
      },
      context({ abortSignal: controller.signal }),
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await fs.stat(path.join(workspace, "ready.txt")).then(
          () => true,
          () => false,
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort();
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/aborted/i);
    await new Promise((resolve) => setTimeout(resolve, 650));
    await expect(fs.stat(path.join(workspace, "escaped.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
