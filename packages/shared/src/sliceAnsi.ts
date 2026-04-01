import {
  type AnsiCode,
  ansiCodesToString,
  reduceAnsiCodes,
  tokenize,
  undoAnsiCodes,
} from '@alcalzone/ansi-tokenize'
import { eastAsianWidth } from 'get-east-asian-width'

function charWidth(codePoint: number): number {
  return eastAsianWidth(codePoint, { ambiguousAsWide: false })
}

function simpleStringWidth(str: string): number {
  let width = 0
  for (const char of str) {
    const cp = char.codePointAt(0)!
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) continue
    width += charWidth(cp)
  }
  return width
}

function isEndCode(code: AnsiCode): boolean {
  return code.code === code.endCode
}

function filterStartCodes(codes: AnsiCode[]): AnsiCode[] {
  return codes.filter(c => !isEndCode(c))
}

/**
 * Slice a string containing ANSI escape codes by display width.
 */
export default function sliceAnsi(
  str: string,
  start: number,
  end?: number,
): string {
  const tokens = tokenize(str)
  let activeCodes: AnsiCode[] = []
  let position = 0
  let result = ''
  let include = false

  for (const token of tokens) {
    if (token.type === 'ansi') {
      activeCodes.push(token)
      if (include) {
        result += token.code
      }
      continue
    }

    if (token.type === 'control') {
      // control codes (e.g. \r, \n) — treat as zero width, pass through if in range
      if (include) result += token.code
      continue
    }

    // token.type === 'char'
    const width = token.fullWidth ? 2 : simpleStringWidth(token.value)

    if (end !== undefined && position >= end) {
      if (width > 0 || !include) break
    }

    if (!include && position >= start) {
      if (start > 0 && width === 0) continue
      include = true
      activeCodes = filterStartCodes(reduceAnsiCodes(activeCodes))
      result = ansiCodesToString(activeCodes)
    }

    if (include) {
      result += token.value
    }

    position += width
  }

  const activeStartCodes = filterStartCodes(reduceAnsiCodes(activeCodes))
  result += ansiCodesToString(undoAnsiCodes(activeStartCodes))
  return result
}
