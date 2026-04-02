import { z } from "zod";
import type { ProviderTool, ToolDefinition } from "./types.js";

/**
 * Convert a Zod schema to a JSON Schema object suitable for LLM API calls.
 *
 * Uses Zod v4's built-in `toJSONSchema()`. Falls back to basic
 * `zod-to-json-schema` for Zod v3 if available.
 */
export function zodToInputSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod v4 has built-in toJSONSchema
  if (typeof z.toJSONSchema === "function") {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    const { $schema: _, ...rest } = jsonSchema;
    return rest;
  }

  // Fallback: try zod-to-json-schema (for Zod v3)
  try {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic import fallback
    const { zodToJsonSchema } = require("zod-to-json-schema") as any;
    const jsonSchema = zodToJsonSchema(schema, { target: "openApi3" }) as Record<string, unknown>;
    const { $schema: _, ...rest } = jsonSchema;
    return rest;
  } catch {
    // Last resort: return a permissive schema
    return { type: "object" };
  }
}

/**
 * Convert a ToolDefinition into the canonical ProviderTool format
 * used by provider adapters.
 */
export function toolToProviderFormat(tool: ToolDefinition): ProviderTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToInputSchema(tool.inputSchema),
  };
}
