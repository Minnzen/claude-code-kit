import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  webFetchTool,
  htmlToMarkdown,
  clearCache,
  getCacheMap,
} from '../packages/tools/src/web-fetch.ts'
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

function mockFetch(opts: {
  status?: number
  statusText?: string
  body?: string
  contentType?: string
}): () => void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    text: () => Promise.resolve(opts.body ?? ''),
    headers: new Headers(
      opts.contentType ? { 'content-type': opts.contentType } : {},
    ),
  })
  return () => {
    globalThis.fetch = originalFetch
  }
}

// Clear cache between every test to avoid cross-test pollution
beforeEach(() => {
  clearCache()
})

// ---------------------------------------------------------------------------
// 1. HTML to Markdown conversion
// ---------------------------------------------------------------------------

describe('htmlToMarkdown', () => {
  it('converts headings h1-h6', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title')
    expect(htmlToMarkdown('<h2>Sub</h2>')).toBe('## Sub')
    expect(htmlToMarkdown('<h3>Deep</h3>')).toBe('### Deep')
    expect(htmlToMarkdown('<h4>H4</h4>')).toBe('#### H4')
    expect(htmlToMarkdown('<h5>H5</h5>')).toBe('##### H5')
    expect(htmlToMarkdown('<h6>H6</h6>')).toBe('###### H6')
  })

  it('converts paragraphs to double newlines', () => {
    const result = htmlToMarkdown('<p>First</p><p>Second</p>')
    expect(result).toContain('First')
    expect(result).toContain('Second')
    // Paragraphs should be separated
    expect(result).toMatch(/First\n\nSecond/)
  })

  it('converts links', () => {
    expect(htmlToMarkdown('<a href="https://example.com">Click</a>')).toBe(
      '[Click](https://example.com)',
    )
  })

  it('converts bold (strong and b)', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toBe('**bold**')
    expect(htmlToMarkdown('<b>bold</b>')).toBe('**bold**')
  })

  it('converts italic (em and i)', () => {
    expect(htmlToMarkdown('<em>italic</em>')).toBe('*italic*')
    expect(htmlToMarkdown('<i>italic</i>')).toBe('*italic*')
  })

  it('converts inline code', () => {
    expect(htmlToMarkdown('<code>const x = 1</code>')).toBe('`const x = 1`')
  })

  it('converts pre blocks to fenced code blocks', () => {
    const result = htmlToMarkdown('<pre>function hello() {}</pre>')
    expect(result).toContain('```')
    expect(result).toContain('function hello() {}')
  })

  it('converts pre>code blocks to fenced code blocks', () => {
    const result = htmlToMarkdown('<pre><code>const x = 1;\nconsole.log(x);</code></pre>')
    expect(result).toContain('```')
    expect(result).toContain('const x = 1;')
    expect(result).toContain('console.log(x);')
  })

  it('converts list items', () => {
    const result = htmlToMarkdown('<ul><li>First</li><li>Second</li></ul>')
    expect(result).toContain('- First')
    expect(result).toContain('- Second')
  })

  it('converts br tags to newlines', () => {
    const result = htmlToMarkdown('Line 1<br>Line 2<br/>Line 3')
    expect(result).toContain('Line 1\nLine 2\nLine 3')
  })

  it('strips remaining HTML tags', () => {
    const result = htmlToMarkdown('<div><span>hello</span></div>')
    expect(result).toBe('hello')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('decodes HTML entities', () => {
    expect(htmlToMarkdown('&amp; &lt; &gt; &quot;')).toBe('& < > "')
  })

  it('decodes numeric entities', () => {
    expect(htmlToMarkdown('&#169; &#x2014;')).toBe('\u00A9 \u2014')
  })

  it('removes script and style tags', () => {
    const html = '<p>hello</p><script>alert("xss")</script><style>.x{color:red}</style><p>world</p>'
    const result = htmlToMarkdown(html)
    expect(result).not.toContain('alert')
    expect(result).not.toContain('color:red')
    expect(result).toContain('hello')
    expect(result).toContain('world')
  })

  it('handles a complex HTML document', () => {
    const html = `
      <html><body>
        <h1>Welcome</h1>
        <p>This is a <strong>bold</strong> and <em>italic</em> paragraph.</p>
        <p>Visit <a href="https://example.com">our site</a> for more.</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
        <pre><code>const x = 42;</code></pre>
      </body></html>
    `
    const result = htmlToMarkdown(html)
    expect(result).toContain('# Welcome')
    expect(result).toContain('**bold**')
    expect(result).toContain('*italic*')
    expect(result).toContain('[our site](https://example.com)')
    expect(result).toContain('- Item 1')
    expect(result).toContain('- Item 2')
    expect(result).toContain('```')
    expect(result).toContain('const x = 42;')
  })
})

// ---------------------------------------------------------------------------
// 2. HTML response auto-conversion in execute
// ---------------------------------------------------------------------------

describe('WebFetch HTML to Markdown in execute', () => {
  it('converts HTML response to Markdown when content-type is text/html', async () => {
    const restore = mockFetch({
      body: '<h1>Hello</h1><p>World</p>',
      contentType: 'text/html; charset=utf-8',
    })
    try {
      const result = await webFetchTool.execute!(
        { url: 'https://example.com' },
        makeCtx(),
      )
      expect(result.isError).toBeFalsy()
      expect(result.content).toContain('# Hello')
      expect(result.content).toContain('World')
      // Should not contain raw HTML tags
      expect(result.content).not.toContain('<h1>')
      expect(result.content).not.toContain('<p>')
    } finally {
      restore()
    }
  })

  it('does not convert non-HTML responses', async () => {
    const restore = mockFetch({
      body: '{"key": "value"}',
      contentType: 'application/json',
    })
    try {
      const result = await webFetchTool.execute!(
        { url: 'https://api.example.com/data' },
        makeCtx(),
      )
      expect(result.isError).toBeFalsy()
      expect(result.content).toContain('{"key": "value"}')
    } finally {
      restore()
    }
  })

  it('does not convert when content-type header is missing', async () => {
    const restore = mockFetch({
      body: '<h1>Raw HTML</h1>',
    })
    try {
      const result = await webFetchTool.execute!(
        { url: 'https://example.com/data' },
        makeCtx(),
      )
      expect(result.isError).toBeFalsy()
      // No content-type header means no conversion
      expect(result.content).toContain('<h1>Raw HTML</h1>')
    } finally {
      restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 3. HTTP -> HTTPS auto-upgrade
// ---------------------------------------------------------------------------

describe('WebFetch HTTP to HTTPS upgrade', () => {
  it('upgrades http:// to https:// in the request', async () => {
    const restore = mockFetch({ body: 'OK' })
    try {
      await webFetchTool.execute!(
        { url: 'http://example.com/page' },
        makeCtx(),
      )
      // Verify fetch was called with https URL
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/page',
        expect.any(Object),
      )
    } finally {
      restore()
    }
  })

  it('leaves https:// URLs unchanged', async () => {
    const restore = mockFetch({ body: 'OK' })
    try {
      await webFetchTool.execute!(
        { url: 'https://example.com/page' },
        makeCtx(),
      )
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/page',
        expect.any(Object),
      )
    } finally {
      restore()
    }
  })

  it('SSRF check uses the upgraded URL', async () => {
    // http://localhost should still be blocked after upgrade to https://localhost
    const result = await webFetchTool.execute!(
      { url: 'http://localhost:8080/secret' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
    // The error message should contain the upgraded URL
    expect(result.content).toContain('https://localhost:8080/secret')
  })
})

// ---------------------------------------------------------------------------
// 4. Simple cache
// ---------------------------------------------------------------------------

describe('WebFetch caching', () => {
  it('returns cached response on second call', async () => {
    const restore = mockFetch({ body: 'Hello World' })
    try {
      // First call — populates cache
      const result1 = await webFetchTool.execute!(
        { url: 'https://cache-test.com/page' },
        makeCtx(),
      )
      expect(result1.content).toContain('Hello World')
      expect(result1.content).not.toContain('[Cached]')

      // Second call — should hit cache
      const result2 = await webFetchTool.execute!(
        { url: 'https://cache-test.com/page' },
        makeCtx(),
      )
      expect(result2.content).toContain('[Cached]')
      expect(result2.content).toContain('Hello World')
      expect(result2.metadata?.cached).toBe(true)

      // fetch should only have been called once
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })

  it('includes prompt prefix on cached responses', async () => {
    const restore = mockFetch({ body: 'Data' })
    try {
      // Populate cache without prompt
      await webFetchTool.execute!(
        { url: 'https://prompt-cache-test.com' },
        makeCtx(),
      )

      // Hit cache with prompt
      const result = await webFetchTool.execute!(
        { url: 'https://prompt-cache-test.com', prompt: 'Summarize' },
        makeCtx(),
      )
      expect(result.content).toContain('[Prompt: Summarize]')
      expect(result.content).toContain('[Cached]')
    } finally {
      restore()
    }
  })

  it('does not cache POST requests', async () => {
    const restore = mockFetch({ body: 'Response' })
    try {
      await webFetchTool.execute!(
        { url: 'https://post-test.com', method: 'POST', body: '{}' },
        makeCtx(),
      )
      await webFetchTool.execute!(
        { url: 'https://post-test.com', method: 'POST', body: '{}' },
        makeCtx(),
      )
      // Both calls should have fetched
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    } finally {
      restore()
    }
  })

  it('expires cache entries after TTL', async () => {
    const restore = mockFetch({ body: 'Fresh data' })
    try {
      // Populate cache
      await webFetchTool.execute!(
        { url: 'https://expire-test.com' },
        makeCtx(),
      )

      // Manually set the cache timestamp to 16 minutes ago
      const entry = getCacheMap().get('https://expire-test.com')
      expect(entry).toBeDefined()
      entry!.timestamp = Date.now() - 16 * 60 * 1000

      // Next call should miss cache and fetch again
      const result = await webFetchTool.execute!(
        { url: 'https://expire-test.com' },
        makeCtx(),
      )
      expect(result.content).not.toContain('[Cached]')
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    } finally {
      restore()
    }
  })

  it('clearCache removes all entries', async () => {
    const restore = mockFetch({ body: 'data' })
    try {
      await webFetchTool.execute!(
        { url: 'https://clear-test.com' },
        makeCtx(),
      )
      expect(getCacheMap().size).toBe(1)

      clearCache()
      expect(getCacheMap().size).toBe(0)

      // Next call should fetch again
      await webFetchTool.execute!(
        { url: 'https://clear-test.com' },
        makeCtx(),
      )
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    } finally {
      restore()
    }
  })

  it('caches with the HTTPS-upgraded URL as key', async () => {
    const restore = mockFetch({ body: 'Upgraded' })
    try {
      // Fetch with http:// — gets upgraded to https://
      await webFetchTool.execute!(
        { url: 'http://upgrade-cache.com/page' },
        makeCtx(),
      )

      // Fetch with https:// — should hit cache from the upgraded URL
      const result = await webFetchTool.execute!(
        { url: 'https://upgrade-cache.com/page' },
        makeCtx(),
      )
      expect(result.content).toContain('[Cached]')
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Existing behavior preserved
// ---------------------------------------------------------------------------

describe('WebFetch existing behavior', () => {
  it('prepends prompt annotation when prompt is provided', async () => {
    const restore = mockFetch({ body: 'Hello World' })
    try {
      const result = await webFetchTool.execute!(
        { url: 'https://example.com', prompt: 'Summarize this page' },
        makeCtx(),
      )
      expect(result.isError).toBeFalsy()
      expect(result.content).toContain('[Prompt: Summarize this page]')
      expect(result.content).toContain('Hello World')
    } finally {
      restore()
    }
  })

  it('does not prepend anything when prompt is omitted', async () => {
    const restore = mockFetch({ body: 'Hello World' })
    try {
      const result = await webFetchTool.execute!(
        { url: 'https://example.com' },
        makeCtx(),
      )
      expect(result.isError).toBeFalsy()
      expect(result.content).not.toContain('[Prompt:')
      expect(result.content).toMatch(/^HTTP 200/)
    } finally {
      restore()
    }
  })

  it('blocks private addresses', async () => {
    const result = await webFetchTool.execute!(
      { url: 'https://127.0.0.1/admin' },
      makeCtx(),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/private\/internal address denied/)
  })

  it('returns Aborted when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await webFetchTool.execute!(
      { url: 'https://example.com' },
      makeCtx({ abortSignal: controller.signal }),
    )
    expect(result.isError).toBe(true)
    expect(result.content).toBe('Aborted')
  })

  it('is not read-only', () => {
    expect(webFetchTool.isReadOnly).toBe(false)
  })

  it('description mentions HTML to Markdown, HTTPS upgrade, and caching', () => {
    expect(webFetchTool.description).toContain('Markdown')
    expect(webFetchTool.description).toContain('HTTPS')
    expect(webFetchTool.description).toContain('cached')
  })
})
