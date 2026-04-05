import { describe, expect, it, vi } from 'vitest'
import {
  webSearchTool,
  inputSchema,
  parseSearchResults,
  stripHtmlTags,
  decodeRedirectUrl,
} from '../packages/tools/src/web-search.ts'
import type { ToolContext } from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDirectory: '/tmp',
    abortSignal: new AbortController().signal,
    env: {},
    ...overrides,
  }
}

/**
 * Build a mock DuckDuckGo HTML response with the given results.
 */
function buildMockHtml(
  results: Array<{ title: string; url: string; snippet: string }>,
): string {
  const blocks = results
    .map(
      (r) => `
      <div class="result results_links results_links_deep web-result">
        <div class="links_main links_deep result__body">
          <h2 class="result__title">
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(r.url)}&amp;rut=abc">${r.title}</a>
          </h2>
          <a class="result__url" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(r.url)}&amp;rut=abc">
            ${r.url}
          </a>
          <a class="result__snippet" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(r.url)}&amp;rut=abc">${r.snippet}</a>
        </div>
      </div>
    `,
    )
    .join('\n')

  return `<!DOCTYPE html><html><body>${blocks}</body></html>`
}

// ---------------------------------------------------------------------------
// Input schema validation
// ---------------------------------------------------------------------------

describe('webSearchTool input schema', () => {
  it('accepts a valid query', () => {
    const result = inputSchema.safeParse({ query: 'hello world' })
    expect(result.success).toBe(true)
  })

  it('accepts query with max_results', () => {
    const result = inputSchema.safeParse({ query: 'test', max_results: 10 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.max_results).toBe(10)
    }
  })

  it('defaults max_results to 5', () => {
    const result = inputSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.max_results).toBe(5)
    }
  })

  it('rejects empty query', () => {
    const result = inputSchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing query', () => {
    const result = inputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects max_results below 1', () => {
    const result = inputSchema.safeParse({ query: 'test', max_results: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects max_results above 20', () => {
    const result = inputSchema.safeParse({ query: 'test', max_results: 21 })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer max_results', () => {
    const result = inputSchema.safeParse({ query: 'test', max_results: 2.5 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// HTML parsing
// ---------------------------------------------------------------------------

describe('parseSearchResults', () => {
  it('extracts results from mock HTML', () => {
    const html = buildMockHtml([
      { title: 'Example Page', url: 'https://example.com', snippet: 'An example page.' },
      { title: 'Another Result', url: 'https://another.com/page', snippet: 'Another snippet here.' },
    ])

    const results = parseSearchResults(html, 5)
    expect(results).toHaveLength(2)

    expect(results[0].title).toBe('Example Page')
    expect(results[0].url).toBe('https://example.com')
    expect(results[0].snippet).toBe('An example page.')

    expect(results[1].title).toBe('Another Result')
    expect(results[1].url).toBe('https://another.com/page')
    expect(results[1].snippet).toBe('Another snippet here.')
  })

  it('respects max_results limit', () => {
    const html = buildMockHtml([
      { title: 'Result 1', url: 'https://r1.com', snippet: 'Snippet 1' },
      { title: 'Result 2', url: 'https://r2.com', snippet: 'Snippet 2' },
      { title: 'Result 3', url: 'https://r3.com', snippet: 'Snippet 3' },
      { title: 'Result 4', url: 'https://r4.com', snippet: 'Snippet 4' },
    ])

    const results = parseSearchResults(html, 2)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Result 1')
    expect(results[1].title).toBe('Result 2')
  })

  it('returns empty array for HTML with no results', () => {
    const html = '<!DOCTYPE html><html><body><p>No results</p></body></html>'
    const results = parseSearchResults(html, 5)
    expect(results).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    const results = parseSearchResults('', 5)
    expect(results).toHaveLength(0)
  })

  it('handles HTML entities in title and snippet', () => {
    const html = buildMockHtml([
      {
        title: 'Tom &amp; Jerry &lt;show&gt;',
        url: 'https://example.com',
        snippet: 'A &quot;classic&quot; cartoon &amp; more',
      },
    ])

    const results = parseSearchResults(html, 5)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Tom & Jerry <show>')
    expect(results[0].snippet).toBe('A "classic" cartoon & more')
  })
})

// ---------------------------------------------------------------------------
// stripHtmlTags
// ---------------------------------------------------------------------------

describe('stripHtmlTags', () => {
  it('strips simple tags', () => {
    expect(stripHtmlTags('<b>bold</b> text')).toBe('bold text')
  })

  it('handles nested tags', () => {
    expect(stripHtmlTags('<div><span>inner</span></div>')).toBe('inner')
  })

  it('decodes HTML entities', () => {
    expect(stripHtmlTags('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'')
  })

  it('decodes decimal numeric entities', () => {
    expect(stripHtmlTags('&#169; &#8212;')).toBe('\u00A9 \u2014')
  })

  it('decodes hex numeric entities', () => {
    expect(stripHtmlTags('&#x27; &#xA9; &#x2014;')).toBe("' \u00A9 \u2014")
  })

  it('collapses whitespace', () => {
    expect(stripHtmlTags('  hello   world  ')).toBe('hello world')
  })

  it('returns empty string for empty input', () => {
    expect(stripHtmlTags('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// decodeRedirectUrl
// ---------------------------------------------------------------------------

describe('decodeRedirectUrl', () => {
  it('extracts URL from DuckDuckGo redirect', () => {
    const wrapped = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath&rut=abc'
    expect(decodeRedirectUrl(wrapped)).toBe('https://example.com/path')
  })

  it('passes through direct https URL', () => {
    expect(decodeRedirectUrl('https://example.com')).toBe('https://example.com')
  })

  it('passes through direct http URL', () => {
    expect(decodeRedirectUrl('http://example.com')).toBe('http://example.com')
  })

  it('adds https to protocol-relative URL', () => {
    expect(decodeRedirectUrl('//example.com/path')).toBe('https://example.com/path')
  })

  it('handles encoded special characters in uddg param', () => {
    const wrapped = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F%3Fq%3Dhello%26lang%3Den&rut=abc'
    expect(decodeRedirectUrl(wrapped)).toBe('https://example.com/?q=hello&lang=en')
  })
})

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

describe('webSearchTool metadata', () => {
  it('is marked as read-only', () => {
    expect(webSearchTool.isReadOnly).toBe(true)
  })

  it('is not destructive', () => {
    expect(webSearchTool.isDestructive).toBeFalsy()
  })

  it('has the correct name', () => {
    expect(webSearchTool.name).toBe('WebSearch')
  })

  it('has a description', () => {
    expect(webSearchTool.description).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Execute with mocked fetch
// ---------------------------------------------------------------------------

describe('webSearchTool execute', () => {
  it('returns formatted results from a successful search', async () => {
    const mockHtml = buildMockHtml([
      { title: 'TypeScript Docs', url: 'https://typescriptlang.org', snippet: 'TypeScript is a typed superset of JavaScript.' },
      { title: 'TS Playground', url: 'https://typescriptlang.org/play', snippet: 'Try TypeScript in the browser.' },
    ])

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockHtml),
    })

    try {
      const result = await webSearchTool.execute(
        { query: 'typescript', max_results: 5 },
        makeCtx(),
      )

      expect(result.isError).toBeFalsy()
      expect(result.content).toContain('TypeScript Docs')
      expect(result.content).toContain('https://typescriptlang.org')
      expect(result.content).toContain('TS Playground')
      expect(result.metadata?.resultCount).toBe(2)
      expect(result.metadata?.query).toBe('typescript')

      // Verify fetch was called with correct URL
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('html.duckduckgo.com/html/?q=typescript'),
        expect.objectContaining({ method: 'GET' }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns "No search results found." for small empty response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><body>No results</body></html>'),
    })

    try {
      const result = await webSearchTool.execute(
        { query: 'xyzNonexistentQuery123456', max_results: 5 },
        makeCtx(),
      )

      expect(result.isError).toBe(false)
      expect(result.content).toBe('No search results found.')
      expect(result.metadata?.resultCount).toBe(0)
      // Small body should NOT include the structure warning
      expect(result.content).not.toContain('[Warning')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('warns about possible HTML structure change when body is large but 0 results', async () => {
    // Build a large HTML body (>5KB) that has no parseable results
    const largeBody = '<html><body>' + 'x'.repeat(6000) + '</body></html>'
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(largeBody),
    })

    try {
      const result = await webSearchTool.execute(
        { query: 'test', max_results: 5 },
        makeCtx(),
      )

      expect(result.isError).toBe(false)
      expect(result.content).toContain('No search results found.')
      expect(result.content).toContain('[Warning')
      expect(result.content).toContain('HTML structure may have changed')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('truncates oversized response body', async () => {
    // Build a response larger than 200KB
    const hugeHtml = '<html><body>' + 'a'.repeat(250_000) + '</body></html>'
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(hugeHtml),
    })

    try {
      const result = await webSearchTool.execute(
        { query: 'test', max_results: 5 },
        makeCtx(),
      )

      // Should not throw or OOM — just return with 0 results + warning
      expect(result.isError).toBe(false)
      expect(result.metadata?.resultCount).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('handles HTTP error response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })

    try {
      const result = await webSearchTool.execute(
        { query: 'test', max_results: 5 },
        makeCtx(),
      )

      expect(result.isError).toBe(true)
      expect(result.content).toContain('503')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('handles network error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

    try {
      const result = await webSearchTool.execute(
        { query: 'test', max_results: 5 },
        makeCtx(),
      )

      expect(result.isError).toBe(true)
      expect(result.content).toContain('Network error')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns "Aborted" when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await webSearchTool.execute(
      { query: 'test', max_results: 5 },
      makeCtx({ abortSignal: controller.signal }),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toBe('Aborted')
  })

  it('encodes special characters in query', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><body></body></html>'),
    })

    try {
      await webSearchTool.execute(
        { query: 'hello world & "quotes" <tags>', max_results: 5 },
        makeCtx(),
      )

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain('q=hello%20world%20%26%20%22quotes%22%20%3Ctags%3E')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('limits results to max_results even if more are available', async () => {
    const mockHtml = buildMockHtml([
      { title: 'R1', url: 'https://r1.com', snippet: 's1' },
      { title: 'R2', url: 'https://r2.com', snippet: 's2' },
      { title: 'R3', url: 'https://r3.com', snippet: 's3' },
    ])

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockHtml),
    })

    try {
      const result = await webSearchTool.execute(
        { query: 'test', max_results: 1 },
        makeCtx(),
      )

      expect(result.isError).toBeFalsy()
      expect(result.metadata?.resultCount).toBe(1)
      expect(result.content).toContain('R1')
      expect(result.content).not.toContain('R2')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
