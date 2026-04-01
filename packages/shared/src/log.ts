/**
 * Error logging for @cck packages.
 * Simplified version — logs to stderr, no sinks or queues.
 */

export function logError(error: unknown): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const errorStr = err.stack || err.message
    process.stderr.write(`[ERROR] ${errorStr}\n`)
  } catch {
    // pass
  }
}
