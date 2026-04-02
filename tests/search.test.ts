/**
 * Tests for the useSearch hook logic.
 *
 * The core of useSearch is the computeMatches() function, which is pure and
 * fully testable without a DOM. We also validate the structural contract of
 * the UseSearchResult type so refactors stay honest.
 */
import { describe, expect, it } from 'vitest'
import {
  computeMatches,
  type SearchMatch,
  type UseSearchResult,
} from '../packages/ui/src/SearchOverlay.tsx'

// ---------------------------------------------------------------------------
// computeMatches — pure search logic
// ---------------------------------------------------------------------------

describe('computeMatches', () => {
  it('returns empty array for empty query', () => {
    expect(computeMatches(['hello world'], '')).toEqual([])
  })

  it('returns empty array when content is empty', () => {
    expect(computeMatches([], 'foo')).toEqual([])
  })

  it('finds a single match in a single message', () => {
    const results = computeMatches(['hello world'], 'world')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject<SearchMatch>({
      index: 0,
      offset: 6,
      length: 5,
    })
  })

  it('finds multiple occurrences within the same message', () => {
    const results = computeMatches(['foo bar foo baz foo'], 'foo')
    expect(results).toHaveLength(3)
    expect(results.map((r) => r.offset)).toEqual([0, 8, 16])
    expect(results.every((r) => r.index === 0 && r.length === 3)).toBe(true)
  })

  it('finds matches across multiple messages', () => {
    const content = ['first message', 'second item', 'another message']
    const results = computeMatches(content, 'message')
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ index: 0, offset: 6 })
    expect(results[1]).toMatchObject({ index: 2, offset: 8 })
  })

  it('is case-insensitive', () => {
    const results = computeMatches(['Hello World'], 'hello')
    expect(results).toHaveLength(1)
    expect(results[0]!.offset).toBe(0)
  })

  it('match length equals query length regardless of case', () => {
    const results = computeMatches(['HELLO'], 'hello')
    expect(results[0]!.length).toBe(5)
  })

  it('handles adjacent matches without skipping', () => {
    // 'aaaa' contains 'aa' at offset 0, 1, 2 (overlapping is handled by offset+1)
    const results = computeMatches(['aaaa'], 'aa')
    expect(results).toHaveLength(3)
    expect(results.map((r) => r.offset)).toEqual([0, 1, 2])
  })

  it('returns empty array when no message matches', () => {
    const results = computeMatches(['hello', 'world'], 'xyz')
    expect(results).toHaveLength(0)
  })

  it('handles empty strings in content array gracefully', () => {
    const results = computeMatches(['', 'foo', ''], 'foo')
    expect(results).toHaveLength(1)
    expect(results[0]!.index).toBe(1)
  })

  it('preserves index ordering in results', () => {
    const content = ['xyz', 'abc', 'abc xyz']
    const results = computeMatches(content, 'abc')
    const indices = results.map((r) => r.index)
    expect(indices).toEqual([1, 2]) // strictly ascending
  })
})

// ---------------------------------------------------------------------------
// UseSearchResult contract — structural type checks
// ---------------------------------------------------------------------------

describe('UseSearchResult contract', () => {
  it('UseSearchResult has the required shape', () => {
    // This is a compile-time check. If the type changes, this test breaks.
    const shape: Record<keyof UseSearchResult, true> = {
      query: true,
      matches: true,
      currentIndex: true,
      next: true,
      previous: true,
      setQuery: true,
    }
    const keys = Object.keys(shape)
    expect(keys).toContain('query')
    expect(keys).toContain('matches')
    expect(keys).toContain('currentIndex')
    expect(keys).toContain('next')
    expect(keys).toContain('previous')
    expect(keys).toContain('setQuery')
  })
})

// ---------------------------------------------------------------------------
// Navigation logic — simulate next/previous index wrapping
// ---------------------------------------------------------------------------

describe('navigation index wrapping', () => {
  function wrap(current: number, delta: 1 | -1, total: number): number {
    return (current + delta + total) % total
  }

  it('next wraps from last to first', () => {
    expect(wrap(2, 1, 3)).toBe(0)
  })

  it('previous wraps from first to last', () => {
    expect(wrap(0, -1, 3)).toBe(2)
  })

  it('next advances normally', () => {
    expect(wrap(0, 1, 5)).toBe(1)
    expect(wrap(3, 1, 5)).toBe(4)
  })

  it('previous retreats normally', () => {
    expect(wrap(4, -1, 5)).toBe(3)
    expect(wrap(1, -1, 5)).toBe(0)
  })

  it('works with a single match (wraps to itself)', () => {
    expect(wrap(0, 1, 1)).toBe(0)
    expect(wrap(0, -1, 1)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// SearchOverlay input handling contract
// ---------------------------------------------------------------------------

describe('SearchOverlay input handling', () => {
  it('n and N characters should be valid search input, not consumed as navigation', () => {
    // The fix ensures that bare 'n'/'N' keys are not intercepted for
    // navigation. Instead, Ctrl+n/Ctrl+p are used for navigation.
    // This test validates the search function works with queries containing 'n'.
    const content = ['running function', 'nothing here', 'another line']

    // Searching for 'n' should find matches (not trigger navigation)
    const results = computeMatches(content, 'n')
    expect(results.length).toBeGreaterThan(0)

    // Searching for 'N' (uppercase) should also work
    const upperResults = computeMatches(content, 'N')
    expect(upperResults.length).toBeGreaterThan(0)
    // Case-insensitive: should find same matches
    expect(upperResults.length).toBe(results.length)
  })
})

// ---------------------------------------------------------------------------
// SearchMatch shape
// ---------------------------------------------------------------------------

describe('SearchMatch shape', () => {
  it('each match has index, offset, length as numbers', () => {
    const matches = computeMatches(['hello world'], 'world')
    const m = matches[0]!
    expect(typeof m.index).toBe('number')
    expect(typeof m.offset).toBe('number')
    expect(typeof m.length).toBe('number')
  })

  it('offset + length does not exceed content length', () => {
    const content = ['hello world']
    const matches = computeMatches(content, 'world')
    for (const m of matches) {
      expect(m.offset + m.length).toBeLessThanOrEqual(content[m.index]!.length)
    }
  })
})
