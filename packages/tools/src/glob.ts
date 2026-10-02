import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import fg from "fast-glob";
import { z } from "zod";
import { resolveContainedPath, validateGlobScope } from "./path-safety.js";

const MAX_RESULT_SIZE = 100_000;

export const inputSchema = z.object({
  pattern: z.string().describe("Glob pattern to match files (e.g. **/*.ts)"),
  path: z.string().optional().describe("Directory to search in"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  try {
    const cwd = await resolveContainedPath(ctx.workingDirectory, input.path ?? ".");
    await validateGlobScope(input.pattern, cwd, ctx.workingDirectory);
    const files = await fg(input.pattern, {
      cwd,
      dot: false,
      ignore: ["**/node_modules/**", "**/.git/**"],
      onlyFiles: true,
      absolute: false,
      followSymbolicLinks: false,
    });

    // Sort by modification time (most recently modified first)
    const withStats = await Promise.all(
      files.map(async (f) => {
        try {
          const filePath = await resolveContainedPath(ctx.workingDirectory, path.resolve(cwd, f));
          const stat = await fs.stat(filePath);
          return { file: f, mtime: stat.mtimeMs };
        } catch {
          return undefined;
        }
      }),
    );
    const containedFiles = withStats.filter((entry) => entry !== undefined);
    containedFiles.sort((a, b) => b.mtime - a.mtime);
    const sorted = containedFiles.map((s) => s.file);

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
  description: `Fast file pattern matching tool that works with any codebase size.

# Glob patterns

Supports standard glob syntax. Examples:
- "**/*.js" — all JavaScript files recursively
- "src/**/*.ts" — all TypeScript files under src/
- "packages/*/src/index.ts" — index files in each package

# Result ordering

Returns matching file paths sorted by modification time (most recently modified first).

# When to use Glob vs other tools

- Finding files by name pattern: use Glob.
- Searching file contents for a string or regex: use Grep instead.
- Reading a specific file you already know the path to: use Read instead.
- For open-ended searches that require multiple rounds of globbing and grepping, chain multiple tool calls.

# Exclusions

node_modules and .git directories are automatically excluded from results.

# Search scope

The \`path\` parameter sets the root directory to search in. If omitted, the agent's working directory is used.`,
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 15_000,
};
