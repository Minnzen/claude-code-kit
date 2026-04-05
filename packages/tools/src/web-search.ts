import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const MAX_RESULTS_LIMIT = 20;
const DEFAULT_MAX_RESULTS = 5;
/** Cap response body to prevent unbounded memory usage (same pattern as web-fetch) */
const MAX_RESPONSE_SIZE = 200_000;
/** If HTML body exceeds this but yields 0 results, warn about possible structure change */
const STRUCTURE_WARNING_THRESHOLD = 5_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; ClaudeCodeKit/1.0; +https://github.com/minnzen/claude-code-kit)";

export const inputSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS_LIMIT)
    .optional()
    .default(DEFAULT_MAX_RESULTS)
    .describe("Maximum number of results to return (default 5, max 20)"),
});

type Input = z.infer<typeof inputSchema>;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Parse DuckDuckGo HTML search results page into structured results.
 * Uses regex to extract result blocks — no full HTML parser needed.
 */
export function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML results are in <div class="result ..."> blocks
  // Each contains:
  //   - <a class="result__a" href="...">title</a>
  //   - <a class="result__snippet" ...>snippet text</a>
  //   - The actual URL is in <a class="result__url" href="...">

  // Match each result block
  const resultBlockRegex = /<div[^>]*class="[^"]*result\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    const block = blockMatch[1];

    // Extract title from <a class="result__a">
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;

    // Extract URL from <a class="result__url" href="...">
    const urlMatch = block.match(/<a[^>]*class="result__url"[^>]*href="([^"]*)"[^>]*>/);
    // Fallback: extract href from result__a
    const urlFallback = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>/);

    // Extract snippet from <a class="result__snippet">
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    const rawUrl = urlMatch?.[1] || urlFallback?.[1] || "";
    // DuckDuckGo wraps URLs in a redirect; extract the actual URL
    const actualUrl = decodeRedirectUrl(rawUrl);

    const title = stripHtmlTags(titleMatch[1]).trim();
    const snippet = stripHtmlTags(snippetMatch?.[1] || "").trim();

    if (title && actualUrl) {
      results.push({ title, url: actualUrl, snippet });
    }
  }

  return results;
}

/** Strip HTML tags and decode common HTML entities */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    // Decode numeric entities: &#123; (decimal) and &#x1A; (hex)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract actual URL from DuckDuckGo redirect wrapper */
export function decodeRedirectUrl(url: string): string {
  // DuckDuckGo uses //duckduckgo.com/l/?uddg=<encoded_url>&... format
  if (url.includes("duckduckgo.com/l/?")) {
    const match = url.match(/[?&]uddg=([^&]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  // If it's already a direct URL, return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  // Handle protocol-relative URLs
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  return url;
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No search results found.";
  }

  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`,
    )
    .join("\n\n");
}

async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

  // No SSRF check needed: URL is hardcoded to duckduckgo.com, not user-supplied.
  // Unlike web-fetch where the user provides an arbitrary URL, the search endpoint
  // is a fixed, trusted origin.
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;

  try {
    const res = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctx.abortSignal,
    });

    if (!res.ok) {
      return {
        content: `Search request failed: HTTP ${res.status} ${res.statusText}`,
        isError: true,
      };
    }

    const fullHtml = await res.text();
    // Cap response body to prevent unbounded memory usage
    const html = fullHtml.slice(0, MAX_RESPONSE_SIZE);

    const results = parseSearchResults(html, input.maxResults);
    let formatted = formatResults(results);

    // Distinguish "genuinely no results" from "HTML structure changed and parsing broke"
    if (results.length === 0 && html.length > STRUCTURE_WARNING_THRESHOLD) {
      formatted +=
        "\n\n[Warning: received a large HTML response but extracted 0 results. " +
        "DuckDuckGo's HTML structure may have changed.]";
    }

    return {
      content: formatted,
      isError: false,
      metadata: { resultCount: results.length, query: input.query },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Search error: ${msg}`, isError: true };
  }
}

export const webSearchTool: ToolDefinition<Input> = {
  name: "web_search",
  description:
    "Search the web using DuckDuckGo and return a list of results with titles, URLs, and snippets",
  inputSchema,
  execute,
  isReadOnly: true,
  timeout: 30_000,
};
