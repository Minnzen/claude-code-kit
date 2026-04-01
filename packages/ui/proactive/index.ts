/**
 * Stub for proactive module.
 * In Claude Code source, this is conditionally loaded behind feature flags.
 */

export function isProactiveActive(): boolean {
  return false
}

export function subscribeToProactiveChanges(_cb: () => void): () => void {
  return () => {}
}

export function getNextTickAt(): null {
  return null
}
