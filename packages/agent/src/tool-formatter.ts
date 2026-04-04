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
    // toJSONSchema returns a JSON Schema object; cast to Record for destructuring
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    const { $schema: _, ...rest } = jsonSchema;
    return rest;
  }

  // Fallback: try zod-to-json-schema (for Zod v3).
  // Install `zod-to-json-schema` as an optional peer dependency when using Zod v3.
  try {
    const mod = require("zod-to-json-schema") as { zodToJsonSchema: (schema: z.ZodType, opts?: Record<string, unknown>) => Record<string, unknown> };
    const jsonSchema = mod.zodToJsonSchema(schema, { target: "openApi3" });
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
 *
 * MCP tools carry their original JSON Schema (via rawInputSchema) to avoid
 * a lossy Zod -> JSON Schema round-trip.
 */
export function toolToProviderFormat(tool: ToolDefinition): ProviderTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.rawInputSchema ?? zodToInputSchema(tool.inputSchema),
  };
}
