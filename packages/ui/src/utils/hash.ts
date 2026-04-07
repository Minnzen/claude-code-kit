/**
 * Hash arbitrary content for change detection.
 * Uses a fast string hash (FNV-1a variant) to avoid Node.js crypto dependency
 * in ESM bundles. This is used only for cache keying, not security.
 */
export function hashContent(content: string): string {
  // FNV-1a 52-bit hash — good distribution, fast, no native dependency.
  // 52-bit fits in JS safe integer range; hex output is 13 chars.
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Second pass with different seed for 52-bit output
  let h2 = 0x62b821756 | 0;
  for (let i = 0; i < content.length; i++) {
    h2 ^= content.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return ((h >>> 0) * 0x100000 + (h2 >>> 0)).toString(36) + content.length.toString(36);
}
