/**
 * Stub for cli-highlight. Syntax highlighting is optional — returns null
 * when cli-highlight is not available, causing code blocks to render as
 * plain text.
 */
export type CliHighlight = {
  highlight: (code: string, options?: { language?: string }) => string
  supportsLanguage: (lang: string) => boolean
}

let cliHighlightPromise: Promise<CliHighlight | null> | undefined

async function loadCliHighlight(): Promise<CliHighlight | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cliHighlight = await import('cli-highlight' as any) as any
    return {
      highlight: cliHighlight.highlight as CliHighlight['highlight'],
      supportsLanguage: cliHighlight.supportsLanguage as CliHighlight['supportsLanguage'],
    }
  } catch {
    return null
  }
}

export function getCliHighlightPromise(): Promise<CliHighlight | null> {
  cliHighlightPromise ??= loadCliHighlight()
  return cliHighlightPromise
}
