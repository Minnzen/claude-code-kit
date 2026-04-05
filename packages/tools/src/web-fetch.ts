import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULT_SIZE = 50_000;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: "\u00A0", mdash: "\u2014", ndash: "\u2013",
  laquo: "\u00AB", raquo: "\u00BB", copy: "\u00A9",
  reg: "\u00AE", trade: "\u2122", hellip: "\u2026",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name) => NAMED_ENTITIES[name] ?? full);
}

// ---------------------------------------------------------------------------
// HTML to Markdown converter (no external dependencies)
// ---------------------------------------------------------------------------

export function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove <script> and <style> blocks entirely
  md = md.replace(/<script[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Headings h1-h6
  for (let i = 1; i <= 6; i++) {
    const prefix = "#".repeat(i);
    const re = new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, "gi");
    md = md.replace(re, (_, inner) => `\n\n${prefix} ${inner.trim()}\n\n`);
  }

  // <pre> blocks (code blocks) — must come before inline <code> handling
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, inner) => `\n\n\`\`\`\n${decodeHtmlEntities(inner.replace(/<[^>]*>/g, "").trim())}\n\`\`\`\n\n`);
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => `\n\n\`\`\`\n${decodeHtmlEntities(inner.replace(/<[^>]*>/g, "").trim())}\n\`\`\`\n\n`);

  // Inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => `\`${inner.replace(/<[^>]*>/g, "").trim()}\``);

  // Bold — word boundary (\b) prevents matching <body>, <blockquote>, etc.
  md = md.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, inner) => `**${inner.trim()}**`);

  // Italic — word boundary prevents matching <img>, <input>, etc.
  md = md.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, inner) => `*${inner.trim()}*`);

  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${text.replace(/<[^>]*>/g, "").trim()}](${href})`);

  // Images
  md = md.replace(/<img[^>]+alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, (_, alt, src) => `![${alt}](${src})`);
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, (_, src, alt) => `![${alt}](${src})`);
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, (_, src) => `![](${src})`);

  // List items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `- ${inner.replace(/<[^>]*>/g, "").trim()}\n`);

  // <br> / <br/>
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Paragraphs and divs — add double newlines
  md = md.replace(/<\/p>/gi, "\n\n");
  md = md.replace(/<\/div>/gi, "\n\n");
  md = md.replace(/<\/blockquote>/gi, "\n\n");

  // Horizontal rules
  md = md.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Strip all remaining HTML tags
  md = md.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  md = decodeHtmlEntities(md);

  // Normalize whitespace: collapse runs of 3+ newlines to 2, trim lines
  md = md.replace(/[ \t]+$/gm, "");
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim();

  return md;
}

// ---------------------------------------------------------------------------
// HTTP -> HTTPS upgrade
// ---------------------------------------------------------------------------

function upgradeToHttps(url: string): string {
  if (url.startsWith("http://")) {
    return `https://${url.slice(7)}`;
  }
  return url;
}

// ---------------------------------------------------------------------------
// Simple in-memory cache (15-minute TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  content: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(url: string): CacheEntry | undefined {
  const entry = cache.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(url);
    return undefined;
  }
  return entry;
}

function setCache(url: string, result: ToolResult): void {
  cache.set(url, {
    content: result.content,
    isError: result.isError,
    metadata: result.metadata,
    timestamp: Date.now(),
  });
}

/** Exposed for testing — clears the entire fetch cache. */
export function clearCache(): void {
  cache.clear();
}

/** Exposed for testing — returns the raw cache Map. */
export function getCacheMap(): Map<string, CacheEntry> {
  return cache;
}

// ---------------------------------------------------------------------------
// Schema and execute
// ---------------------------------------------------------------------------

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

  // Upgrade http:// to https://
  const url = upgradeToHttps(input.url);

  // Block requests to private/internal network addresses (SSRF prevention)
  try {
    if (isPrivateUrl(url)) {
      return { content: `Error: request to private/internal address denied — ${url}`, isError: true };
    }
  } catch {
    return { content: `Error: invalid URL — ${url}`, isError: true };
  }

  // Check cache (only for GET requests with no custom body)
  if ((!input.method || input.method === "GET") && !input.body) {
    const cached = getCached(url);
    if (cached) {
      const promptPrefix = input.prompt ? `[Prompt: ${input.prompt}]\n\n` : "";
      return {
        content: `${promptPrefix}[Cached] ${cached.content}`,
        isError: cached.isError,
        metadata: { ...cached.metadata, cached: true },
      };
    }
  }

  try {
    const res = await fetch(url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: ctx.abortSignal,
    });

    let text = await res.text();

    // Convert HTML responses to Markdown
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      text = htmlToMarkdown(text);
    }

    const truncated = text.slice(0, MAX_RESULT_SIZE);
    const suffix = text.length > MAX_RESULT_SIZE ? "\n...(truncated)" : "";

    const rawContent = `HTTP ${res.status} ${res.statusText}\n\n${truncated}${suffix}`;

    // Cache successful GET responses
    const result: ToolResult = {
      content: rawContent,
      isError: res.status >= 400,
      metadata: { status: res.status, headers: Object.fromEntries(res.headers.entries()) },
    };

    if ((!input.method || input.method === "GET") && !input.body) {
      setCache(url, result);
    }

    const promptPrefix = input.prompt ? `[Prompt: ${input.prompt}]\n\n` : "";
    return {
      ...result,
      content: `${promptPrefix}${rawContent}`,
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
  - HTML responses (Content-Type: text/html) are automatically converted to Markdown for easier reading
  - HTTP URLs are automatically upgraded to HTTPS
  - Successful GET responses are cached in memory for 15 minutes; cached responses are marked with [Cached]
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
