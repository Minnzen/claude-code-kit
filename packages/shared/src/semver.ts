/**
 * Semver comparison utilities.
 * Uses npm semver package with static ESM import to avoid CJS require() issues.
 */
import semver from "semver";

export function gt(a: string, b: string): boolean {
  return semver.gt(a, b, { loose: true }) ?? false;
}

export function gte(a: string, b: string): boolean {
  return semver.gte(a, b, { loose: true }) ?? false;
}

export function lt(a: string, b: string): boolean {
  return semver.lt(a, b, { loose: true }) ?? false;
}

export function lte(a: string, b: string): boolean {
  return semver.lte(a, b, { loose: true }) ?? false;
}

export function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range, { loose: true });
}

export function order(a: string, b: string): -1 | 0 | 1 {
  return semver.compare(a, b, { loose: true });
}
