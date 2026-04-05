import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

export const inputSchema = z.object({
  file_path: z.string().describe("Absolute or relative file path to write"),
  content: z.string().describe("Content to write to the file"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const filePath = path.resolve(ctx.workingDirectory, input.file_path);

  // Prevent path traversal outside the working directory
  if (!filePath.startsWith(ctx.workingDirectory + path.sep) && filePath !== ctx.workingDirectory) {
    return { content: `Error: path traversal denied — ${input.file_path} escapes working directory`, isError: true };
  }

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.content, "utf-8");

    return {
      content: `Successfully wrote ${Buffer.byteLength(input.content)} bytes to ${filePath}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error writing file: ${msg}`, isError: true };
  }
}

export const writeTool: ToolDefinition<Input> = {
  name: "Write",
  description: "Write content to a file, creating parent directories as needed",
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: 10_000,
};
