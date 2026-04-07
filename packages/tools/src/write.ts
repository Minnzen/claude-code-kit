import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import { z } from "zod";

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
    return {
      content: `Error: path traversal denied — ${input.file_path} escapes working directory`,
      isError: true,
    };
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
  description: `Writes a file to the local filesystem. Creates parent directories automatically if they do not exist.

# Overwrite behavior

This tool will overwrite the existing file if there is one at the provided path. Always read the file first with the Read tool before overwriting an existing file to avoid accidentally discarding content.

# Prefer Edit over Write for existing files

ALWAYS prefer using Edit to modify existing files — it only sends the diff and makes changes easier to review. Only use Write to create brand new files or for complete rewrites where you intend to replace the entire contents.

# Avoid unnecessary files

NEVER create documentation files (*.md) or README files unless explicitly requested. Do not create new files when editing an existing file would accomplish the same goal.`,
  inputSchema,
  execute,
  isReadOnly: false,
  isDestructive: false,
  requiresConfirmation: true,
  timeout: 10_000,
};
