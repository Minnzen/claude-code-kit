import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import { z } from "zod";

// ---------------------------------------------------------------------------
// LSP connection interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface for communicating with a Language Server.
 * The `request` method sends an LSP method with the given params and returns
 * the JSON-RPC result. Implementations may wrap a JSON-RPC transport, an MCP
 * bridge, or any other mechanism that speaks LSP.
 */
export interface LspConnection {
  request(method: string, params: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// LSP types (subset used in responses)
// ---------------------------------------------------------------------------

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspHoverResult {
  contents: unknown;
  range?: LspRange;
}

export interface LspSymbolInformation {
  name: string;
  kind: number;
  location: LspLocation;
  containerName?: string;
}

export interface LspDocumentSymbol {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const actionEnum = z.enum([
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
]);

const inputSchema = z
  .object({
    action: actionEnum.describe(
      "The LSP action to perform: goToDefinition, findReferences, hover, documentSymbol, or workspaceSymbol",
    ),
    file_path: z
      .string()
      .optional()
      .describe("Absolute path to the file (required for all actions except workspaceSymbol)"),
    line: z
      .number()
      .optional()
      .describe("0-based line number (required for goToDefinition, findReferences, hover)"),
    character: z
      .number()
      .optional()
      .describe("0-based character offset (required for goToDefinition, findReferences, hover)"),
    query: z.string().optional().describe("Search query for workspaceSymbol"),
  })
  .superRefine((data, ctx) => {
    const positionActions = ["goToDefinition", "findReferences", "hover"] as const;
    const needsPosition = (positionActions as readonly string[]).includes(data.action);

    if (data.action !== "workspaceSymbol" && !data.file_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "file_path is required for this action",
        path: ["file_path"],
      });
    }

    if (needsPosition && data.line === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "line is required for this action",
        path: ["line"],
      });
    }

    if (needsPosition && data.character === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "character is required for this action",
        path: ["character"],
      });
    }
  });

type Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// LSP method mapping
// ---------------------------------------------------------------------------

function filePathToUri(filePath: string): string {
  // Convert a file path to a file:// URI
  const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return `file://${normalized}`;
}

function buildLspRequest(input: Input): { method: string; params: unknown } {
  const uri = input.file_path ? filePathToUri(input.file_path) : undefined;

  switch (input.action) {
    case "goToDefinition":
      return {
        method: "textDocument/definition",
        params: {
          textDocument: { uri },
          position: { line: input.line, character: input.character },
        },
      };

    case "findReferences":
      return {
        method: "textDocument/references",
        params: {
          textDocument: { uri },
          position: { line: input.line, character: input.character },
          context: { includeDeclaration: true },
        },
      };

    case "hover":
      return {
        method: "textDocument/hover",
        params: {
          textDocument: { uri },
          position: { line: input.line, character: input.character },
        },
      };

    case "documentSymbol":
      return {
        method: "textDocument/documentSymbol",
        params: {
          textDocument: { uri },
        },
      };

    case "workspaceSymbol":
      return {
        method: "workspace/symbol",
        params: {
          query: input.query ?? "",
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Symbol kind mapping (LSP SymbolKind enum -> human-readable)
// ---------------------------------------------------------------------------

const SYMBOL_KIND_MAP: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

function symbolKindName(kind: number): string {
  return SYMBOL_KIND_MAP[kind] ?? `Kind(${kind})`;
}

// ---------------------------------------------------------------------------
// Response formatting
// ---------------------------------------------------------------------------

function formatLocation(loc: LspLocation): string {
  const path = loc.uri.replace(/^file:\/\//, "");
  return `${path}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
}

function formatLocations(result: unknown): string {
  if (!result) return "No results found";

  // Single location
  if (
    !Array.isArray(result) &&
    typeof result === "object" &&
    "uri" in (result as Record<string, unknown>)
  ) {
    return formatLocation(result as LspLocation);
  }

  // Array of locations
  if (Array.isArray(result)) {
    if (result.length === 0) return "No results found";
    return result.map((loc) => formatLocation(loc as LspLocation)).join("\n");
  }

  return JSON.stringify(result, null, 2);
}

function formatHover(result: unknown): string {
  if (!result) return "No hover information available";

  const hover = result as LspHoverResult;
  const contents = hover.contents;

  if (typeof contents === "string") return contents;
  if (typeof contents === "object" && contents !== null) {
    // MarkupContent { kind, value }
    if ("value" in (contents as Record<string, unknown>)) {
      return (contents as { value: string }).value;
    }
    // MarkedString[] or MarkupContent[]
    if (Array.isArray(contents)) {
      return contents
        .map((c) =>
          typeof c === "string" ? c : ((c as { value?: string }).value ?? JSON.stringify(c)),
        )
        .join("\n\n");
    }
  }

  return JSON.stringify(contents, null, 2);
}

function formatDocumentSymbols(result: unknown, indent = 0): string {
  if (!result || (Array.isArray(result) && result.length === 0)) {
    return "No symbols found";
  }

  if (!Array.isArray(result)) return JSON.stringify(result, null, 2);

  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const sym of result) {
    // DocumentSymbol (has range, selectionRange, may have children)
    if ("range" in (sym as Record<string, unknown>)) {
      const ds = sym as LspDocumentSymbol;
      lines.push(
        `${prefix}${symbolKindName(ds.kind)} ${ds.name}  (L${ds.range.start.line + 1}-${ds.range.end.line + 1})`,
      );
      if (ds.children && ds.children.length > 0) {
        lines.push(formatDocumentSymbols(ds.children, indent + 1));
      }
    } else {
      // SymbolInformation (has location)
      const si = sym as LspSymbolInformation;
      const loc = formatLocation(si.location);
      const container = si.containerName ? ` [${si.containerName}]` : "";
      lines.push(`${prefix}${symbolKindName(si.kind)} ${si.name}${container}  ${loc}`);
    }
  }

  return lines.join("\n");
}

function formatResult(action: string, result: unknown): string {
  switch (action) {
    case "goToDefinition":
    case "findReferences":
      return formatLocations(result);

    case "hover":
      return formatHover(result);

    case "documentSymbol":
    case "workspaceSymbol":
      return formatDocumentSymbols(result);

    default:
      return JSON.stringify(result, null, 2);
  }
}

// ---------------------------------------------------------------------------
// No-connection fallback message
// ---------------------------------------------------------------------------

const NO_CONNECTION_MESSAGE =
  "LSP not available. Start a language server and pass its connection to the tool via createLspTool(connection).";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an LSP tool that communicates with a language server through the
 * provided connection. If no connection is supplied, all actions return a
 * helpful fallback message explaining how to set one up.
 */
export function createLspTool(connection?: LspConnection): ToolDefinition<Input> {
  async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) {
      return { content: "Aborted", isError: true };
    }

    if (!connection) {
      return { content: NO_CONNECTION_MESSAGE, isError: true };
    }

    const { method, params } = buildLspRequest(input);

    try {
      const result = await connection.request(method, params);
      const formatted = formatResult(input.action, result);
      return {
        content: formatted,
        metadata: { action: input.action, method, raw: result },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `LSP request failed: ${msg}`, isError: true };
    }
  }

  return {
    name: "LSP",
    description: `Interacts with a Language Server via the Language Server Protocol (LSP) to navigate and understand code.

Supported actions:

- **goToDefinition** — Jump to the definition of the symbol at the given position. Returns file path and location of the definition. Useful for navigating to function implementations, type definitions, variable declarations, and imported symbols.

- **findReferences** — Find all references to the symbol at the given position across the workspace. Returns a list of file locations where the symbol is used. Useful for understanding impact before renaming or refactoring, and for tracing how a function or variable is consumed.

- **hover** — Get type information and documentation for the symbol at the given position. Returns type signatures, JSDoc/docstrings, and inferred types. Useful for understanding what a symbol is without navigating away from the current context.

- **documentSymbol** — List all symbols (functions, classes, variables, interfaces, etc.) defined in a file. Returns a hierarchical tree of symbols with their kinds and line ranges. Useful for getting an overview of a file's structure and finding specific declarations.

- **workspaceSymbol** — Search for symbols across the entire workspace by name. Returns matching symbols with their file locations. Useful for finding where a type, function, or class is defined when you don't know which file it's in.

# Position parameters

For goToDefinition, findReferences, and hover, provide the exact cursor position using 0-based \`line\` and \`character\` offsets. These correspond to the position in the file where the symbol of interest is located.

# File path

Provide the absolute file path for all actions except workspaceSymbol. The tool converts it to a file:// URI for the LSP request.

# When LSP is not available

If no language server connection has been configured, the tool returns an error explaining how to set one up. The connection is provided at tool creation time via \`createLspTool(connection)\`.`,
    inputSchema,
    execute,
    isReadOnly: true,
    isDestructive: false,
    timeout: 30_000,
  };
}
