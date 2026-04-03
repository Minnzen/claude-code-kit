import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

export const inputSchema = z.object({
  path: z.string().describe("Absolute or relative file path to edit"),
  oldString: z.string().describe("Exact string to find and replace (must be unique in file)"),
  newString: z.string().describe("Replacement string"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const filePath = path.resolve(ctx.workingDirectory, input.path);

  // Prevent path traversal outside the working directory
  if (!filePath.startsWith(ctx.workingDirectory + path.sep) && filePath !== ctx.workingDirectory) {
    return { content: `Error: path traversal denied — ${input.path} escapes working directory`, isError: true };
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");

    const occurrences = content.split(input.oldString).length - 1;
    if (occurrences === 0) {
      return { content: "Error: oldString not found in file", isError: true };
    }
    if (occurrences > 1) {
      return {
        content: `Error: oldString found ${occurrences} times — must be unique. Provide more context to disambiguate.`,
        isError: true,
      };
    }

    const updated = content.replace(input.oldString, input.newString);
    await fs.writeFile(filePath, updated, "utf-8");

    return { content: `Successfully edited ${filePath}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error editing file: ${msg}`, isError: true };
  }
}

export const editTool: ToolDefinition<Input> = {
  name: "edit",
  description: "Edit a file by replacing a unique string occurrence with a new string",
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: 10_000,
};
