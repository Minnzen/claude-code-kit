import { hashContent } from "./hash";

export function getStableKeys<T>(
  items: readonly T[],
  getFingerprint: (item: T) => string,
): string[] {
  const seen = new Map<string, number>();

  return items.map((item) => {
    const baseKey = hashContent(getFingerprint(item));
    const occurrence = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occurrence + 1);
    return occurrence === 0 ? baseKey : `${baseKey}:${occurrence}`;
  });
}

export function getStableLineEntries(
  text: string,
  scope: string,
): Array<{ key: string; line: string }> {
  let offset = 0;

  return text.split("\n").map((line) => {
    const key = `${scope}:${offset}:${hashContent(line)}`;
    offset += line.length + 1;
    return { key, line };
  });
}
