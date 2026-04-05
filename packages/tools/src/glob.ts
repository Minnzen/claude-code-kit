import * as fs from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 100_000;

export const inputSchema = z.object({
  pattern: z.string().describe("Glob pattern to match files (e.g. **/*.ts)"),
  path: z.string().optional().describe("Directory to search in"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const cwd = input.path ?? ctx.workingDirectory;

  try {
    const files = await fg(input.pattern, {
      cwd,
      dot: false,
      ignore: ["**/node_modules/**", "**/.git/**"],
      onlyFiles: true,
      absolute: false,
    });

    // Sort by modification time (most recently modified first)
    const withStats = await Promise.all(
      files.map(async (f) => {
        try {
          const stat = await fs.stat(path.resolve(cwd, f));
          return { file: f, mtime: stat.mtimeMs };
        } catch {
          return { file: f, mtime: 0 };
        }
      }),
    );
    withStats.sort((a, b) => b.mtime - a.mtime);
    const sorted = withStats.map((s) => s.file);

    if (sorted.length === 0) {
      return { content: "No files matched the pattern" };
    }

    const content = sorted.join("\n").slice(0, MAX_RESULT_SIZE);
    return { content, metadata: { matchCount: sorted.length } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error searching files: ${msg}`, isError: true };
  }
}

export const globTool: ToolDefinition<Input> = {
  name: "Glob",
  description: "Find files matching a glob pattern, excluding node_modules and .git",
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 15_000,
};
