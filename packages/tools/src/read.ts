import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 100_000;

export const inputSchema = z.object({
  path: z.string().describe("Absolute or relative file path to read"),
  offset: z.number().optional().describe("Line number to start reading from (1-based)"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const filePath = path.resolve(ctx.workingDirectory, input.path);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    let lines = raw.split("\n");

    if (input.offset !== undefined) {
      lines = lines.slice(Math.max(0, input.offset - 1));
    }
    if (input.limit !== undefined) {
      lines = lines.slice(0, input.limit);
    }

    // Add line numbers
    const startLine = (input.offset ?? 1);
    const numbered = lines.map((line, i) => `${startLine + i}\t${line}`);
    const content = numbered.join("\n").slice(0, MAX_RESULT_SIZE);

    return { content, metadata: { totalLines: raw.split("\n").length } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error reading file: ${msg}`, isError: true };
  }
}

export const readTool: ToolDefinition<Input> = {
  name: "read",
  description: "Read file contents with optional line offset and limit, returning numbered lines",
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 10_000,
};
