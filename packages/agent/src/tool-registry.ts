import type { ProviderTool, ToolContext, ToolDefinition, ToolResult } from "./types.js";
import { toolToProviderFormat } from "./tool-formatter.js";

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
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        content: `Invalid input for tool "${name}": ${parsed.error.message}`,
        isError: true,
      };
    }

    // Execute with optional timeout
    const timeout = tool.timeout ?? 120_000;
    const timeoutSignal = AbortSignal.timeout(timeout);
    const combinedSignal = AbortSignal.any([context.abortSignal, timeoutSignal]);

    const toolContext: ToolContext = { ...context, abortSignal: combinedSignal };

    try {
      return await tool.execute(parsed.data, toolContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: `Tool "${name}" failed: ${message}`, isError: true };
    }
  }

  clear(): void {
    this.tools.clear();
  }
}
