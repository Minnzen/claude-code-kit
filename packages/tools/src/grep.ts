import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";
import fg from "fast-glob";

const MAX_RESULT_SIZE = 100_000;
const MAX_FILES = 5_000;

export const inputSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for in file contents"),
  path: z.string().optional().describe("Directory or file to search in"),
  glob: z.string().optional().describe("Glob filter for files (e.g. *.ts)"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const searchPath = input.path ? path.resolve(ctx.workingDirectory, input.path) : ctx.workingDirectory;
  const globPattern = input.glob ?? "**/*";

  try {
    const regex = new RegExp(input.pattern);

    // Check if searchPath is a file
    const stat = await fs.stat(searchPath);
    let files: string[];

    if (stat.isFile()) {
      files = [searchPath];
    } else {
      files = await fg(globPattern, {
        cwd: searchPath,
        absolute: true,
        onlyFiles: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/*.min.*"],
      });
      files = files.slice(0, MAX_FILES);
    }

    const matches: string[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (ctx.abortSignal.aborted) break;
      try {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const rel = path.relative(ctx.workingDirectory, file);
            const line = `${rel}:${i + 1}: ${lines[i]}`;
            totalSize += line.length;
            if (totalSize > MAX_RESULT_SIZE) break;
            matches.push(line);
          }
        }
      } catch {
        // skip binary or unreadable files
      }
      if (totalSize > MAX_RESULT_SIZE) break;
    }

    if (matches.length === 0) {
      return { content: "No matches found" };
    }

    return { content: matches.join("\n"), metadata: { matchCount: matches.length } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error searching: ${msg}`, isError: true };
  }
}

export const grepTool: ToolDefinition<Input> = {
  name: "Grep",
  description: "Search file contents using regex, returning matching lines with file:line format",
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 30_000,
};
