import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

export const inputSchema = z.object({
  file_path: z.string().describe("Absolute or relative file path to edit"),
  old_string: z.string().describe("Exact string to find and replace (must be unique in file unless replace_all is true)"),
  new_string: z.string().describe("Replacement string"),
  replace_all: z.boolean().optional().default(false).describe("Replace all occurrences of old_string (default false)"),
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
    const content = await fs.readFile(filePath, "utf-8");

    const occurrences = content.split(input.old_string).length - 1;
    if (occurrences === 0) {
      return { content: "Error: old_string not found in file", isError: true };
    }
    if (!input.replace_all && occurrences > 1) {
      return {
        content: `Error: old_string found ${occurrences} times — must be unique. Provide more context to disambiguate, or use replace_all.`,
        isError: true,
      };
    }

    let updated: string;
    if (input.replace_all) {
      updated = content.split(input.old_string).join(input.new_string);
    } else {
      updated = content.replace(input.old_string, input.new_string);
    }
    await fs.writeFile(filePath, updated, "utf-8");

    const replacedCount = input.replace_all ? occurrences : 1;
    return { content: `Successfully edited ${filePath} (${replacedCount} replacement${replacedCount > 1 ? "s" : ""})` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error editing file: ${msg}`, isError: true };
  }
}

export const editTool: ToolDefinition<Input> = {
  name: "Edit",
  description: "Edit a file by replacing a unique string occurrence with a new string",
  inputSchema,
  execute,
  isReadOnly: false,
  requiresConfirmation: true,
  timeout: 10_000,
};
