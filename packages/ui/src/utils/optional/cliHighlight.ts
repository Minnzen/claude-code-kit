/**
 * Stub for cli-highlight. Syntax highlighting is optional — returns null
 * when cli-highlight is not available, causing code blocks to render as
 * plain text.
 */
export type CliHighlight = {
  highlight: (code: string, options?: { language?: string }) => string;
  supportsLanguage: (lang: string) => boolean;
};

let cliHighlightPromise: Promise<CliHighlight | null> | undefined;

async function loadCliHighlight(): Promise<CliHighlight | null> {
  try {
    // Dynamic import of optional dependency. The `as string` cast on the module
    // specifier bypasses TypeScript's module resolution since cli-highlight may
    // not be installed and has no bundled type declarations.
    const mod = await import("cli-highlight" as string);
    const cliHighlight = mod as CliHighlight;
    return {
      highlight: cliHighlight.highlight,
      supportsLanguage: cliHighlight.supportsLanguage,
    };
  } catch {
    return null;
  }
}

export function getCliHighlightPromise(): Promise<CliHighlight | null> {
  cliHighlightPromise ??= loadCliHighlight();
  return cliHighlightPromise;
}
