import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 50_000;

/**
 * Check if a URL points to a private/internal network address.
 * Blocks SSRF attacks targeting localhost, private IPs, link-local, and cloud metadata endpoints.
 */
function isPrivateUrl(urlStr: string): boolean {
  const url = new URL(urlStr);
  const hostname = url.hostname;
  const blocked = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^169\.254\./, /^0\./, /^localhost$/i, /^::1$/, /^\[::1\]$/,
    /^metadata\.google/, /^169\.254\.169\.254$/,
  ];
  return blocked.some(re => re.test(hostname));
}

export const inputSchema = z.object({
  url: z.string().url().describe("URL to fetch"),
  method: z.string().optional().default("GET").describe("HTTP method"),
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers"),
  body: z.string().optional().describe("Request body"),
  prompt: z.string().optional().describe("Instructions for processing the fetched content"),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  // Block requests to private/internal network addresses (SSRF prevention)
  try {
    if (isPrivateUrl(input.url)) {
      return { content: `Error: request to private/internal address denied — ${input.url}`, isError: true };
    }
  } catch {
    return { content: `Error: invalid URL — ${input.url}`, isError: true };
  }

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

    const promptPrefix = input.prompt ? `[Prompt: ${input.prompt}]\n\n` : "";
    const content = `${promptPrefix}HTTP ${res.status} ${res.statusText}\n\n${truncated}${suffix}`;

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
  name: "WebFetch",
  description: `Fetches content from a specified URL and returns the response body.

  IMPORTANT: This tool WILL FAIL for authenticated or private URLs (e.g. pages behind login, internal services). Do not use it for those cases.

  Usage notes:
  - The URL must be a fully-formed, valid URL pointing to a publicly accessible resource
  - Use the prompt parameter to describe what information you want to extract from the page; the raw response body is returned along with the prompt prefix so you can process it yourself
  - Requests to private/internal network addresses are blocked (localhost, 10.x, 172.16-31.x, 192.168.x, link-local, cloud metadata endpoints) to prevent SSRF attacks
  - Response bodies are capped at ${MAX_RESULT_SIZE.toLocaleString()} characters; larger responses are truncated
  - HTTP 4xx/5xx responses are returned with isError=true so you can detect failures
  - For GitHub URLs, prefer using the gh CLI via Bash instead (e.g., gh pr view, gh issue view, gh api)
`,
  inputSchema,
  execute,
  isReadOnly: false,
  timeout: 30_000,
};
