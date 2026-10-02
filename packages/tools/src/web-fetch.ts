import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import type { ToolContext, ToolDefinition, ToolResult } from "@claude-code-kit/agent";
import { Agent } from "undici";
import { z } from "zod";

const MAX_RESULT_SIZE = 50_000;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Check if a URL points to a private/internal network address.
 * Blocks SSRF attacks targeting localhost, private IPs, link-local, and cloud metadata endpoints.
 */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) !== 6) return true;
  const normalized = address
    .toLowerCase()
    .replace(
      /(\d+)\.(\d+)\.(\d+)\.(\d+)$/,
      (_, a, b, c, d) =>
        `${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`,
    );
  const [left, right] = normalized.split("::");
  const first = left ? left.split(":") : [];
  const last = right ? right.split(":") : [];
  const words =
    right === undefined
      ? first
      : [...first, ...Array(8 - first.length - last.length).fill("0"), ...last];
  const values = words.map((word) => parseInt(word, 16));
  if (values.slice(0, 5).every((value) => value === 0) && values[5] === 0xffff) {
    return isPrivateAddress(
      `${values[6] >> 8}.${values[6] & 255}.${values[7] >> 8}.${values[7] & 255}`,
    );
  }
  // Only global unicast addresses are eligible, excluding documentation ranges.
  return (values[0] & 0xe000) !== 0x2000 || (values[0] === 0x2001 && values[1] === 0xdb8);
}

interface PublicTarget {
  hostname: string;
  addresses: LookupAddress[];
}

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

async function validatePublicUrl(urlStr: string, signal: AbortSignal): Promise<PublicTarget> {
  const url = new URL(urlStr);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`unsupported URL protocol — ${url.protocol}`);
  }
  const hostname = normalizeHostname(url.hostname);
  const denied = () => new Error(`request to private/internal address denied — ${urlStr}`);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^metadata\.google(?:\.|$)/.test(hostname)
  )
    throw denied();
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw denied();
    return { hostname, addresses: [{ address: hostname, family: isIP(hostname) }] };
  }
  signal.throwIfAborted();
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("Aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    lookup(hostname, { all: true, verbatim: true })
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", onAbort);
      });
  });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address)))
    throw denied();
  return { hostname, addresses: addresses.map(({ address, family }) => ({ address, family })) };
}

function createPinnedDispatcher(target: PublicTarget): Agent {
  const pinnedLookup: LookupFunction = (hostname, options, callback) => {
    const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    const addresses = target.addresses.filter((entry) => !family || entry.family === family);
    queueMicrotask(() => {
      if (normalizeHostname(hostname) !== target.hostname || addresses.length === 0) {
        callback(new Error("Connection hostname or address family was not validated"), "", 0);
      } else if (options.all) {
        callback(
          null,
          addresses.map((entry) => ({ ...entry })),
        );
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
  // Pin DNS without replacing the URL hostname used for TLS and certificate checks.
  return new Agent({ connect: { lookup: pinnedLookup } });
}

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  mdash: "\u2014",
  ndash: "\u2013",
  laquo: "\u00AB",
  raquo: "\u00BB",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  hellip: "\u2026",
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
  md = md.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_, inner) =>
      `\n\n\`\`\`\n${decodeHtmlEntities(inner.replace(/<[^>]*>/g, "").trim())}\n\`\`\`\n\n`,
  );
  md = md.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, inner) =>
      `\n\n\`\`\`\n${decodeHtmlEntities(inner.replace(/<[^>]*>/g, "").trim())}\n\`\`\`\n\n`,
  );

  // Inline code
  md = md.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    (_, inner) => `\`${inner.replace(/<[^>]*>/g, "").trim()}\``,
  );

  // Bold — word boundary (\b) prevents matching <body>, <blockquote>, etc.
  md = md.replace(
    /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi,
    (_, inner) => `**${inner.trim()}**`,
  );

  // Italic — word boundary prevents matching <img>, <input>, etc.
  md = md.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, inner) => `*${inner.trim()}*`);

  // Links
  md = md.replace(
    /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => `[${text.replace(/<[^>]*>/g, "").trim()}](${href})`,
  );

  // Images
  md = md.replace(
    /<img[^>]+alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi,
    (_, alt, src) => `![${alt}](${src})`,
  );
  md = md.replace(
    /<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
    (_, src, alt) => `![${alt}](${src})`,
  );
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, (_, src) => `![](${src})`);

  // List items
  md = md.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_, inner) => `- ${inner.replace(/<[^>]*>/g, "").trim()}\n`,
  );

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
  let target: PublicTarget;
  try {
    target = await validatePublicUrl(url, ctx.abortSignal);
  } catch (error) {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };
    return { content: `Error: ${(error as Error).message}`, isError: true };
  }

  const cacheable =
    (!input.method || input.method === "GET") &&
    !input.body &&
    Object.keys(input.headers ?? {}).length === 0;
  // Custom headers can identify a different user or select a different response.
  if (cacheable) {
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

  const dispatchers: Agent[] = [];
  try {
    let currentUrl = url;
    let method = input.method ?? "GET";
    const headers = new Headers(input.headers);
    let body = input.body;
    let res: Response;
    for (let redirects = 0; ; redirects++) {
      if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };
      if (redirects > 0) target = await validatePublicUrl(currentUrl, ctx.abortSignal);
      if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };
      const dispatcher = createPinnedDispatcher(target);
      dispatchers.push(dispatcher);
      const requestOptions: RequestInit = {
        method,
        headers,
        body,
        signal: ctx.abortSignal,
        redirect: "manual",
        // Node's bundled dispatcher types vary independently of this compatible API.
        dispatcher: dispatcher as unknown as RequestInit["dispatcher"],
      };
      res = await fetch(currentUrl, requestOptions);
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      const location = res.headers.get("location");
      if (!location) break;
      await res.body?.cancel();
      if (redirects >= 10) throw new Error("Too many redirects");
      const nextUrl = upgradeToHttps(new URL(location, currentUrl).href);
      if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
        headers.delete("authorization");
        headers.delete("cookie");
        headers.delete("proxy-authorization");
      }
      if (
        (res.status === 303 && method !== "HEAD") ||
        ([301, 302].includes(res.status) && method === "POST")
      ) {
        method = "GET";
        body = undefined;
        headers.delete("content-type");
        headers.delete("content-length");
      }
      currentUrl = nextUrl;
    }

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

    if (cacheable) {
      setCache(url, result);
    }

    const promptPrefix = input.prompt ? `[Prompt: ${input.prompt}]\n\n` : "";
    return {
      ...result,
      content: `${promptPrefix}${rawContent}`,
    };
  } catch (err: unknown) {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Fetch error: ${msg}`, isError: true };
  } finally {
    await Promise.allSettled(dispatchers.map((dispatcher) => dispatcher.destroy()));
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
  requiresConfirmation: true,
  timeout: 30_000,
};
