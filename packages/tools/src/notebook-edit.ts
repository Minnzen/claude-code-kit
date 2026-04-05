import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

export const inputSchema = z.object({
  notebook_path: z.string().describe("Absolute or relative path to a .ipynb notebook file"),
  edit_mode: z.enum(["insert", "replace", "delete"]).describe("Action to perform on the cell"),
  cell_number: z.number().int().min(0).describe("0-based cell index (insert position or target cell)"),
  cell_type: z.enum(["code", "markdown"]).optional()
    .describe("Cell type for insert/replace (default: code for insert, preserves original for replace)"),
  new_source: z.string().optional().describe("Cell content for insert/replace"),
});

type Input = z.infer<typeof inputSchema>;

interface NotebookCell {
  cell_type: string;
  source: string[];
  metadata: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
}

interface Notebook {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

/** Split a string into the line-array format notebooks expect. */
function sourceToLines(source: string): string[] {
  if (source === "") return [];
  const lines = source.split("\n");
  // Each line except the last gets a trailing newline
  const result = lines.map((line, i) => (i < lines.length - 1 ? `${line}\n` : line));
  // A trailing newline in the input produces an empty string at the end — remove it
  if (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }
  return result;
}

function makeCell(cellType: string, source: string): NotebookCell {
  const cell: NotebookCell = {
    cell_type: cellType,
    source: sourceToLines(source),
    metadata: {},
  };
  if (cellType === "code") {
    cell.outputs = [];
    cell.execution_count = null;
  }
  return cell;
}

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const filePath = path.resolve(ctx.workingDirectory, input.notebook_path);

  // Path traversal check
  if (!filePath.startsWith(ctx.workingDirectory + path.sep) && filePath !== ctx.workingDirectory) {
    return { content: `Error: path traversal denied — ${input.notebook_path} escapes working directory`, isError: true };
  }

  // Extension check
  if (path.extname(filePath).toLowerCase() !== ".ipynb") {
    return { content: "Error: only .ipynb files are allowed", isError: true };
  }

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    let notebook: Notebook;
    try {
      notebook = JSON.parse(raw) as Notebook;
    } catch {
      return { content: "Error: file is not valid JSON", isError: true };
    }

    if (typeof notebook.nbformat !== "number") {
      return { content: "Error: invalid notebook format — missing nbformat field", isError: true };
    }

    const cells = notebook.cells;
    if (!Array.isArray(cells)) {
      return { content: "Error: invalid notebook format — missing cells array", isError: true };
    }

    const { edit_mode: action, cell_number: cellIndex, cell_type: cellType, new_source: source } = input;

    switch (action) {
      case "insert": {
        if (cellIndex < 0 || cellIndex > cells.length) {
          return {
            content: `Error: cellIndex ${cellIndex} out of range — valid insert range is 0..${cells.length}`,
            isError: true,
          };
        }
        if (source === undefined) {
          return { content: "Error: source is required for insert action", isError: true };
        }
        const newCell = makeCell(cellType ?? "code", source);
        cells.splice(cellIndex, 0, newCell);
        break;
      }

      case "replace": {
        if (cellIndex < 0 || cellIndex >= cells.length) {
          return {
            content: `Error: cellIndex ${cellIndex} out of range — valid range is 0..${cells.length - 1}`,
            isError: true,
          };
        }
        if (source === undefined) {
          return { content: "Error: source is required for replace action", isError: true };
        }
        const original = cells[cellIndex];
        const effectiveCellType = cellType ?? original.cell_type;
        // Preserve original cell's metadata, outputs, and execution_count
        cells[cellIndex] = {
          ...original,
          cell_type: effectiveCellType,
          source: sourceToLines(source),
        };
        break;
      }

      case "delete": {
        if (cellIndex < 0 || cellIndex >= cells.length) {
          return {
            content: `Error: cellIndex ${cellIndex} out of range — valid range is 0..${cells.length - 1}`,
            isError: true,
          };
        }
        cells.splice(cellIndex, 1);
        break;
      }
    }

    await fs.writeFile(filePath, JSON.stringify(notebook, null, 1) + "\n", "utf-8");

    const totalCells = cells.length;
    switch (action) {
      case "insert":
        return { content: `Inserted ${cellType} cell at index ${cellIndex} in ${filePath} (${totalCells} cells total)` };
      case "replace":
        return { content: `Replaced cell at index ${cellIndex} with ${cellType} cell in ${filePath} (${totalCells} cells total)` };
      case "delete":
        return { content: `Deleted cell at index ${cellIndex} from ${filePath} (${totalCells} cells total)` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error editing notebook: ${msg}`, isError: true };
  }
}

export const notebookEditTool: ToolDefinition<Input> = {
  name: "NotebookEdit",
  description: "Edit a Jupyter Notebook (.ipynb) by inserting, replacing, or deleting cells",
  inputSchema,
  execute,
  isReadOnly: false,
  isDestructive: false,
  requiresConfirmation: true,
  timeout: 10_000,
};
