import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import fg from "fast-glob";
import { z } from "zod";

const MAX_FILES = 5_000;
const DEFAULT_HEAD_LIMIT = 250;

// File type to extensions mapping (matches ripgrep conventions)
const FILE_TYPE_MAP: Record<string, string[]> = {
  js: [".js", ".mjs", ".cjs", ".jsx"],
  ts: [".ts", ".tsx", ".mts", ".cts"],
  py: [".py", ".pyi"],
  rust: [".rs"],
  go: [".go"],
  java: [".java"],
  c: [".c", ".h"],
  cpp: [".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h"],
  cs: [".cs"],
  rb: [".rb"],
  php: [".php"],
  swift: [".swift"],
  kt: [".kt", ".kts"],
  scala: [".scala"],
  html: [".html", ".htm"],
  css: [".css"],
  scss: [".scss"],
  less: [".less"],
  json: [".json"],
  yaml: [".yml", ".yaml"],
  toml: [".toml"],
  xml: [".xml"],
  md: [".md", ".markdown"],
  sh: [".sh", ".bash", ".zsh"],
  sql: [".sql"],
  graphql: [".graphql", ".gql"],
  proto: [".proto"],
  lua: [".lua"],
  r: [".r", ".R"],
  dart: [".dart"],
  ex: [".ex", ".exs"],
  zig: [".zig"],
  vue: [".vue"],
  svelte: [".svelte"],
  astro: [".astro"],
  txt: [".txt"],
};

export const inputSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for in file contents"),
  path: z.string().optional().describe("File or directory to search in"),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")'),
  output_mode: z
    .enum(["content", "files_with_matches", "count"])
    .optional()
    .default("files_with_matches")
    .describe(
      "Output mode: content (matching lines), files_with_matches (file paths), count (match counts)",
    ),
  "-A": z.number().optional().describe("Lines after each match (requires output_mode: content)"),
  "-B": z.number().optional().describe("Lines before each match (requires output_mode: content)"),
  "-C": z.number().optional().describe("Alias for context"),
  context: z
    .number()
    .optional()
    .describe("Lines before and after each match (requires output_mode: content)"),
  head_limit: z
    .number()
    .optional()
    .default(DEFAULT_HEAD_LIMIT)
    .describe("Limit output entries. Defaults to 250."),
  offset: z
    .number()
    .optional()
    .default(0)
    .describe("Skip first N entries before applying head_limit"),
  multiline: z
    .boolean()
    .optional()
    .default(false)
    .describe("Enable multiline mode (dotAll flag, patterns can span lines)"),
  type: z.string().optional().describe("File type filter (js, ts, py, etc.)"),
  "-i": z.boolean().optional().describe("Case insensitive search"),
  "-n": z
    .boolean()
    .optional()
    .default(true)
    .describe("Show line numbers (content mode only). Defaults to true."),
});

type Input = z.infer<typeof inputSchema>;

interface MatchRange {
  lineStart: number; // 0-indexed
  lineEnd: number; // 0-indexed, inclusive
}

/**
 * Map a character offset to its 0-indexed line number using binary search.
 * `offsets` is a sorted array where offsets[i] is the character position
 * where line i begins.
 */
function offsetToLine(offsets: number[], charOffset: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offsets[mid] <= charOffset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Find all match ranges in file content. For single-line mode, each match
 * range spans a single line. For multiline mode, a match may span multiple lines.
 */
function findMatchRanges(
  lines: string[],
  fullContent: string,
  regex: RegExp,
  multiline: boolean,
): MatchRange[] {
  const ranges: MatchRange[] = [];

  if (multiline) {
    // Build a line offset table for mapping character positions to line numbers
    const lineOffsets: number[] = [];
    let offset = 0;
    for (const line of lines) {
      lineOffsets.push(offset);
      offset += line.length + 1; // +1 for the \n
    }

    // Use a fresh regex with global flag to find all matches
    const globalRegex = new RegExp(regex.source, `${regex.flags.replace("g", "")}g`);
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
    while ((match = globalRegex.exec(fullContent)) !== null) {
      const startChar = match.index;
      const endChar = startChar + match[0].length - 1;

      const startLine = offsetToLine(lineOffsets, startChar);
      const endLine = offsetToLine(lineOffsets, endChar);

      ranges.push({ lineStart: startLine, lineEnd: endLine });

      // Prevent infinite loop for zero-length matches
      if (match[0].length === 0) {
        globalRegex.lastIndex++;
      }
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        ranges.push({ lineStart: i, lineEnd: i });
      }
    }
  }

  return ranges;
}

/**
 * Build context blocks from match ranges with before/after context lines.
 * Adjacent or overlapping blocks are merged. Blocks are separated by "--".
 */
function buildContextBlocks(
  lines: string[],
  ranges: MatchRange[],
  beforeCtx: number,
  afterCtx: number,
  showLineNumbers: boolean,
  relPath: string,
): string[] {
  if (ranges.length === 0) return [];

  // Expand each range with context and merge overlapping
  interface Block {
    start: number;
    end: number;
    matchLines: Set<number>; // lines that are actual matches (for future highlighting)
  }

  const blocks: Block[] = [];

  for (const range of ranges) {
    const start = Math.max(0, range.lineStart - beforeCtx);
    const end = Math.min(lines.length - 1, range.lineEnd + afterCtx);

    const matchLines = new Set<number>();
    for (let i = range.lineStart; i <= range.lineEnd; i++) {
      matchLines.add(i);
    }

    // Try to merge with previous block
    const prev = blocks[blocks.length - 1];
    if (prev && start <= prev.end + 1) {
      prev.end = Math.max(prev.end, end);
      for (const ml of matchLines) prev.matchLines.add(ml);
    } else {
      blocks.push({ start, end, matchLines });
    }
  }

  // Format each block
  const output: string[] = [];
  for (let bi = 0; bi < blocks.length; bi++) {
    if (bi > 0) output.push("--");
    const block = blocks[bi];
    for (let i = block.start; i <= block.end; i++) {
      // Use ":" for match lines, "-" for context lines (ripgrep convention)
      const separator = block.matchLines.has(i) ? ":" : "-";
      if (showLineNumbers) {
        output.push(`${relPath}${separator}${i + 1}${separator}${lines[i]}`);
      } else {
        output.push(`${relPath}${separator}${lines[i]}`);
      }
    }
  }

  return output;
}

function resolveTypeGlobs(fileType: string): string[] {
  const extensions = FILE_TYPE_MAP[fileType.toLowerCase()];
  if (!extensions) return [];
  return extensions.map((ext) => `**/*${ext}`);
}

function matchesType(filePath: string, fileType: string): boolean {
  const extensions = FILE_TYPE_MAP[fileType.toLowerCase()];
  if (!extensions) return false;
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  const searchPath = input.path
    ? path.resolve(ctx.workingDirectory, input.path)
    : ctx.workingDirectory;
  const outputMode = input.output_mode ?? "files_with_matches";
  const headLimit = input.head_limit ?? DEFAULT_HEAD_LIMIT;
  const offsetSkip = input.offset ?? 0;
  const isMultiline = input.multiline ?? false;
  const caseInsensitive = input["-i"] ?? false;
  const showLineNumbers = input["-n"] ?? true;

  // Resolve context parameters: -C is alias for context, -A/-B override
  const contextVal = input["-C"] ?? input.context ?? 0;
  const beforeCtx = input["-B"] ?? contextVal;
  const afterCtx = input["-A"] ?? contextVal;

  try {
    // Build regex flags
    let flags = "";
    if (isMultiline) flags += "s"; // dotAll
    if (caseInsensitive) flags += "i";
    const regex = new RegExp(input.pattern, flags);

    // Resolve file list
    const stat = await fs.stat(searchPath);
    let files: string[];

    if (stat.isFile()) {
      files = [searchPath];
    } else {
      // Build glob patterns based on type and glob parameters
      let globPatterns: string[];
      if (input.type) {
        const typeGlobs = resolveTypeGlobs(input.type);
        if (typeGlobs.length === 0) {
          return { content: `Unknown file type: ${input.type}`, isError: true };
        }
        if (input.glob) {
          // Both type and glob: intersect by using type globs and filtering by glob later
          globPatterns = typeGlobs;
        } else {
          globPatterns = typeGlobs;
        }
      } else {
        globPatterns = [input.glob ?? "**/*"];
      }

      files = await fg(globPatterns, {
        cwd: searchPath,
        absolute: true,
        onlyFiles: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/*.min.*"],
      });

      // If both type and glob are specified, filter files by glob match
      if (input.type && input.glob) {
        const globFilter = await fg([input.glob], {
          cwd: searchPath,
          absolute: true,
          onlyFiles: true,
          ignore: ["**/node_modules/**", "**/.git/**", "**/*.min.*"],
        });
        const globSet = new Set(globFilter);
        files = files.filter((f) => globSet.has(f));
      }

      files.sort();
      files = files.slice(0, MAX_FILES);
    }

    // Process files based on output mode
    const entries: string[] = [];
    let entryIndex = 0;
    const endIndex = headLimit > 0 ? offsetSkip + headLimit : Number.MAX_SAFE_INTEGER;

    for (const file of files) {
      if (ctx.abortSignal.aborted) break;
      if (entryIndex >= endIndex) break;

      // Type filter for single-file mode (when searchPath is a file)
      if (input.type && stat.isFile() && !matchesType(file, input.type)) {
        continue;
      }

      try {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");
        const relPath = path.relative(ctx.workingDirectory, file);

        const matchRanges = findMatchRanges(lines, content, regex, isMultiline);
        if (matchRanges.length === 0) continue;

        if (outputMode === "files_with_matches") {
          if (entryIndex >= offsetSkip && entryIndex < endIndex) {
            entries.push(relPath);
          }
          entryIndex++;
        } else if (outputMode === "count") {
          if (entryIndex >= offsetSkip && entryIndex < endIndex) {
            entries.push(`${relPath}:${matchRanges.length}`);
          }
          entryIndex++;
        } else {
          // content mode
          const hasContext = beforeCtx > 0 || afterCtx > 0;

          if (hasContext) {
            const blockLines = buildContextBlocks(
              lines,
              matchRanges,
              beforeCtx,
              afterCtx,
              showLineNumbers,
              relPath,
            );
            for (const line of blockLines) {
              if (entryIndex >= offsetSkip && entryIndex < endIndex) {
                entries.push(line);
              }
              // Only count non-separator lines as entries for limit purposes
              if (line !== "--") {
                entryIndex++;
              }
            }
          } else {
            // No context: just matching lines
            for (const range of matchRanges) {
              for (let li = range.lineStart; li <= range.lineEnd; li++) {
                if (entryIndex >= offsetSkip && entryIndex < endIndex) {
                  if (showLineNumbers) {
                    entries.push(`${relPath}:${li + 1}:${lines[li]}`);
                  } else {
                    entries.push(`${relPath}:${lines[li]}`);
                  }
                }
                entryIndex++;
              }
            }
          }
        }
      } catch {
        // skip binary or unreadable files
      }
    }

    if (entries.length === 0) {
      return { content: "No matches found" };
    }

    return {
      content: entries.join("\n"),
      metadata: { matchCount: entries.filter((e) => e !== "--").length },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error searching: ${msg}`, isError: true };
  }
}

export const grepTool: ToolDefinition<Input> = {
  name: "Grep",
  description: `A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".
  - Use Agent tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep conventions — literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`,
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 30_000,
};
