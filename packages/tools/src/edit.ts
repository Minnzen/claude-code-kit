import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import { z } from "zod";

export const inputSchema = z.object({
  file_path: z.string().describe("Absolute or relative file path to edit"),
  old_string: z
    .string()
    .describe(
      "Exact string to find and replace (must be unique in file unless replace_all is true)",
    ),
  new_string: z.string().describe("Replacement string"),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace all occurrences of old_string (default false)"),
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
    return {
      content: `Successfully edited ${filePath} (${replacedCount} replacement${replacedCount > 1 ? "s" : ""})`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error editing file: ${msg}`, isError: true };
  }
}

export const editTool: ToolDefinition<Input> = {
  name: "Edit",
  description: `Performs exact string replacements in files.

# Reading before editing

You MUST use the Read tool at least once before editing a file. This tool will error if you attempt an edit on a file you have not read. Reading the file first ensures you match the exact content including indentation and whitespace.

# old_string must be unique

The edit will FAIL if \`old_string\` is not unique in the file. Either:
- Provide a larger string with more surrounding context to make it unique, or
- Use \`replace_all: true\` to change every instance of \`old_string\`.

# Preserve indentation

When editing text from Read tool output, preserve the exact indentation (tabs/spaces) as it appears after the line number prefix. The line number prefix format is: line number + tab. Never include any part of the line number prefix in \`old_string\` or \`new_string\`.

# Prefer Edit over Write

ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.

# replace_all for global renaming

Use \`replace_all: true\` for replacing and renaming strings across the entire file — for example, renaming a variable or updating a repeated string pattern.`,
  inputSchema,
  execute,
  isReadOnly: false,
  isDestructive: false,
  requiresConfirmation: true,
  timeout: 10_000,
};
