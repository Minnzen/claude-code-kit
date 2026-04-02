import type { z } from "zod";

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

/** Minimal filesystem interface for tool sandboxing. */
export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  exec(command: string, options?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/** Runtime context passed to every tool execution. */
export interface ToolContext {
  workingDirectory: string;
  abortSignal: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
  env?: Record<string, string>;
  fs?: FileSystem;
}

/** Progress update emitted during long-running tool executions. */
export interface ToolProgress {
  /** 0-1 fraction, or undefined for indeterminate. */
  percent?: number;
  message?: string;
}

/** Result returned from a tool execution. */
export interface ToolResult {
  content: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

/** Validation result returned by `validateInput`. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * A tool that an agent can invoke.
 *
 * @typeParam TInput - The Zod-inferred input type for this tool.
 */
export interface ToolDefinition<TInput = unknown> {
  /** Unique tool name (snake_case recommended). */
  name: string;
  /** Human-readable description shown to the LLM. */
  description: string;
  /** Zod schema used for input validation and JSON Schema generation. */
  inputSchema: z.ZodType<TInput>;

  /** Execute the tool and return a result. */
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;

  // -- Optional metadata & hooks -------------------------------------------

  /** Additional prompt text injected into the system prompt for this tool. */
  prompt?: string;
  /** Whether this tool is safe to run concurrently with other tools. */
  isConcurrencySafe?: boolean;
  /** Whether the tool only reads state (no mutations). */
  isReadOnly?: boolean;
  /** Whether the tool performs irreversible operations. */
  isDestructive?: boolean;
  /** Custom input validation beyond the Zod schema. */
  validateInput?: (input: TInput) => ValidationResult;
  /** Maximum execution time in milliseconds. */
  timeout?: number;
  /** Maximum result size in characters (large results get truncated). */
  maxResultSize?: number;
  /** Whether this tool requires explicit user confirmation before execution. */
  requiresConfirmation?: boolean;
  /** If true, the tool result is returned directly to the user without further LLM processing. */
  returnDirect?: boolean;
}
