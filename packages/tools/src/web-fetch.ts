import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 50_000;

export const inputSchema = z.object({
  url: z.string().url().describe("URL to fetch"),
  method: z.string().optional().default("GET").describe("HTTP method"),
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers"),
  body: z.string().optional().describe("Request body"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  try {
    const res = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: ctx.abortSignal,
    });

    const text = await res.text();
    const truncated = text.slice(0, MAX_RESULT_SIZE);
    const suffix = text.length > MAX_RESULT_SIZE ? "\n...(truncated)" : "";

    const content = `HTTP ${res.status} ${res.statusText}\n\n${truncated}${suffix}`;

    return {
      content,
      isError: res.status >= 400,
      metadata: { status: res.status, headers: Object.fromEntries(res.headers.entries()) },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Fetch error: ${msg}`, isError: true };
  }
}

export const webFetchTool: ToolDefinition<Input> = {
  name: "web_fetch",
  description: "Make HTTP requests and return the response body",
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 30_000,
};
