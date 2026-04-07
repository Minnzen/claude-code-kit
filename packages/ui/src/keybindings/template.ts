/**
 * Keybindings template generator.
 * Generates a well-documented template file for ~/.claude/keybindings.json
 */

import { DEFAULT_BINDINGS } from "./defaultBindings";
import { NON_REBINDABLE, normalizeKeyForComparison } from "./reservedShortcuts";
import type { KeybindingBlock } from "./types";

/**
 * Filter out reserved shortcuts that cannot be rebound.
 * These would cause /doctor to warn, so we exclude them from the template.
 */
function filterReservedShortcuts(blocks: KeybindingBlock[]): KeybindingBlock[] {
  const reservedKeys = new Set(NON_REBINDABLE.map((r) => normalizeKeyForComparison(r.key)));

  return blocks
    .map((block) => {
      const filteredBindings: Record<string, string | null> = {};
      for (const [key, action] of Object.entries(block.bindings)) {
        if (!reservedKeys.has(normalizeKeyForComparison(key))) {
          filteredBindings[key] = action;
        }
      }
      return { context: block.context, bindings: filteredBindings };
    })
    .filter((block) => Object.keys(block.bindings).length > 0);
}

/**
 * Generate a template keybindings.json file content.
 * Creates a fully valid JSON file with all default bindings that users can customize.
 */
export function generateKeybindingsTemplate(): string {
  const bindings = filterReservedShortcuts(DEFAULT_BINDINGS);

  const config = {
    $schema: "https://www.schemastore.org/claude-code-keybindings.json",
    $docs: "https://code.claude.com/docs/en/keybindings",
    bindings,
  };

  return `${JSON.stringify(config, null, 2)}\n`;
}
