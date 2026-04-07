import { logForDebugging } from "@claude-code-kit/shared";

export function ifNotInteger(value: number | undefined, name: string): void {
  if (value === undefined) return;
  if (Number.isInteger(value)) return;
  logForDebugging(`${name} should be an integer, got ${value}`, {
    level: "warn",
  });
}
