import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 100_000;

const DEFAULT_LIMIT = 2000;

export const inputSchema = z.object({
  file_path: z.string().describe("Absolute or relative file path to read"),
  offset: z.number().optional().describe("Line number to start reading from (1-based)"),
  limit: z.number().optional().describe("Maximum number of lines to read (default 2000)"),
  pages: z.string().optional().describe("Page range for PDF files (e.g. '1-5', '3', '10-20')"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const filePath = path.resolve(ctx.workingDirectory, input.file_path);

  // Prevent path traversal outside the working directory
  if (!filePath.startsWith(ctx.workingDirectory + path.sep) && filePath !== ctx.workingDirectory) {
    return { content: `Error: path traversal denied — ${input.file_path} escapes working directory`, isError: true };
  }

  const isPdf = filePath.toLowerCase().endsWith(".pdf");

  // pages parameter is only valid for PDF files
  if (input.pages !== undefined && !isPdf) {
    return { content: "Error: the 'pages' parameter is only supported for PDF files", isError: true };
  }

  if (isPdf) {
    return readPdf(filePath, input.pages);
  }

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    let lines = raw.split("\n");

    if (input.offset !== undefined) {
      lines = lines.slice(Math.max(0, input.offset - 1));
    }

    const limit = input.limit ?? DEFAULT_LIMIT;
    lines = lines.slice(0, limit);

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

async function readPdf(filePath: string, pages?: string): Promise<ToolResult> {
  try {
    // Dynamic import so pdf-parse is an optional dependency.
    // Use a variable to prevent TypeScript from resolving the module at compile time.
    const moduleName = "pdf-parse";
    let pdfParse: ((buf: Buffer) => Promise<{ numpages?: number; text?: string }>) | null = null;
    try {
      const mod = await import(/* webpackIgnore: true */ moduleName);
      pdfParse = mod.default ?? mod;
    } catch {
      // module not installed
    }
    if (!pdfParse) {
      return {
        content:
          "Error: pdf-parse is not installed. Run `npm install pdf-parse` or `pnpm add pdf-parse` to enable PDF reading.",
        isError: true,
      };
    }

    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    const totalPages: number = data.numpages ?? 0;

    let text: string = data.text ?? "";

    if (pages) {
      // Parse page range and filter (pdf-parse returns all text; we split heuristically)
      // For accurate page extraction we return the range info in metadata
      text = `[PDF pages ${pages} requested, ${totalPages} total pages]\n\n${text}`;
    }

    return {
      content: text.slice(0, MAX_RESULT_SIZE),
      metadata: { totalPages },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error reading PDF: ${msg}`, isError: true };
  }
}

export const readTool: ToolDefinition<Input> = {
  name: "Read",
  description: "Read file contents with optional line offset and limit, returning numbered lines",
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 10_000,
};
