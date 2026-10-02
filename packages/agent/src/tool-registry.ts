import { toolToProviderFormat } from "./tool-formatter.js";
import type { ProviderTool, ToolContext, ToolDefinition, ToolResult } from "./types.js";

/**
 * Registry that holds tool definitions and provides lookup + execution.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Returns all tools in the provider-ready format (name, description, JSON Schema).
   */
  toProviderFormat(): ProviderTool[] {
    return this.list().map(toolToProviderFormat);
  }

  /**
   * Execute a tool by name with the given input.
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Unknown tool: ${name}`, isError: true };
    }

    // Validate input against schema
    const parsed = tool.inputSchema.safeParse(structuredClone(input));
    if (!parsed.success) {
      return {
        content: `Invalid input for tool "${name}": ${parsed.error.message}`,
        isError: true,
      };
    }

    if (context.abortSignal.aborted) {
      return { content: `Tool "${name}" aborted`, isError: true };
    }

    const timeout = tool.timeout ?? 120_000;
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 2_147_483_647) {
      return { content: `Invalid timeout for tool "${name}"`, isError: true };
    }
    const timeoutController = new AbortController();
    const combinedSignal = AbortSignal.any([context.abortSignal, timeoutController.signal]);
    const toolContext: ToolContext = {
      ...context,
      abortSignal: combinedSignal,
      // A timed-out tool may still run physically, but must not publish stale progress.
      onProgress: context.onProgress
        ? (progress) => {
            if (!combinedSignal.aborted) context.onProgress?.(progress);
          }
        : undefined,
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const interrupted = new Promise<ToolResult>((resolve) => {
      onAbort = () =>
        resolve({
          content:
            timeoutController.signal.aborted && !context.abortSignal.aborted
              ? `Tool "${name}" timed out after ${timeout}ms; execution may still be running`
              : `Tool "${name}" aborted; execution may still be running`,
          isError: true,
        });
      combinedSignal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => timeoutController.abort(), timeout);
    });

    try {
      const execution = Promise.resolve()
        .then(() => {
          if (combinedSignal.aborted) return interrupted;
          return tool.execute(parsed.data, toolContext);
        })
        .catch((error: unknown) => ({
          content: `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        }));
      const result = await Promise.race([execution, interrupted]);
      return combinedSignal.aborted ? await interrupted : result;
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) combinedSignal.removeEventListener("abort", onAbort);
    }
  }

  clear(): void {
    this.tools.clear();
  }
}
