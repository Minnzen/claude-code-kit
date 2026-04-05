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

    files.sort();

    if (files.length === 0) {
      return { content: "No files matched the pattern" };
    }

    const content = files.join("\n").slice(0, MAX_RESULT_SIZE);
    return { content, metadata: { matchCount: files.length } };
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
