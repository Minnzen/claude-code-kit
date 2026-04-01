/**
 * Semver comparison utilities.
 * Uses npm semver package (no Bun.semver).
 */

let _npmSemver: typeof import('semver') | undefined

function getNpmSemver(): typeof import('semver') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _npmSemver ??= require('semver') as typeof import('semver')
  return _npmSemver
}

export function gt(a: string, b: string): boolean {
  return getNpmSemver().gt(a, b, { loose: true })
}

export function gte(a: string, b: string): boolean {
  return getNpmSemver().gte(a, b, { loose: true })
}

export function lt(a: string, b: string): boolean {
  return getNpmSemver().lt(a, b, { loose: true })
}

export function lte(a: string, b: string): boolean {
  return getNpmSemver().lte(a, b, { loose: true })
}

export function satisfies(version: string, range: string): boolean {
  return getNpmSemver().satisfies(version, range, { loose: true })
}

export function order(a: string, b: string): -1 | 0 | 1 {
  return getNpmSemver().compare(a, b, { loose: true })
}
