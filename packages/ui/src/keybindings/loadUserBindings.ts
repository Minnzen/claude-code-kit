/**
 * User keybinding configuration loader with hot-reload support.
 *
 * Loads keybindings from ~/.claude/keybindings.json and watches
 * for changes to reload them automatically.
 */

import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { DEFAULT_BINDINGS } from "./defaultBindings";
import { parseBindings } from "./parser";
import type { KeybindingBlock, ParsedBinding } from "./types";
import { checkDuplicateKeysInJson, type KeybindingWarning, validateBindings } from "./validate";

// Inline stubs for internal utilities not available in this package
function logForDebugging(msg: string): void {
  if (process.env.DEBUG_KEYBINDINGS) console.error(msg);
}

function getClaudeConfigHomeDir(): string {
  return join(process.env.HOME ?? "~", ".claude");
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonParse(text: string): unknown {
  return JSON.parse(text);
}

type SignalListener<T extends unknown[]> = (...args: T) => void;

function createSignal<T extends unknown[]>() {
  const listeners = new Set<SignalListener<T>>();
  return {
    subscribe: (listener: SignalListener<T>): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (...args: T): void => {
      for (const listener of listeners) listener(...args);
    },
    clear: (): void => listeners.clear(),
  };
}

/**
 * Check if keybinding customization is enabled.
 */
export function isKeybindingCustomizationEnabled(): boolean {
  // Always enabled in kit — no feature gate
  return true;
}

/**
 * Time in milliseconds to wait for file writes to stabilize.
 */
const FILE_STABILITY_THRESHOLD_MS = 500;

/**
 * Polling interval for checking file stability.
 */
const FILE_STABILITY_POLL_INTERVAL_MS = 200;

/**
 * Result of loading keybindings, including any validation warnings.
 */
export type KeybindingsLoadResult = {
  bindings: ParsedBinding[];
  warnings: KeybindingWarning[];
};

let watcher: FSWatcher | null = null;
let initialized = false;
let disposed = false;
let cachedBindings: ParsedBinding[] | null = null;
let cachedWarnings: KeybindingWarning[] = [];
const keybindingsChanged = createSignal<[result: KeybindingsLoadResult]>();

/**
 * Type guard to check if an object is a valid KeybindingBlock.
 */
function isKeybindingBlock(obj: unknown): obj is KeybindingBlock {
  if (typeof obj !== "object" || obj === null) return false;
  const b = obj as Record<string, unknown>;
  return typeof b.context === "string" && typeof b.bindings === "object" && b.bindings !== null;
}

/**
 * Type guard to check if an array contains only valid KeybindingBlocks.
 */
function isKeybindingBlockArray(arr: unknown): arr is KeybindingBlock[] {
  return Array.isArray(arr) && arr.every(isKeybindingBlock);
}

/**
 * Get the path to the user keybindings file.
 */
export function getKeybindingsPath(): string {
  return join(getClaudeConfigHomeDir(), "keybindings.json");
}

/**
 * Parse default bindings (cached for performance).
 */
function getDefaultParsedBindings(): ParsedBinding[] {
  return parseBindings(DEFAULT_BINDINGS);
}

/**
 * Load and parse keybindings from user config file.
 * Returns merged default + user bindings along with validation warnings.
 */
export async function loadKeybindings(): Promise<KeybindingsLoadResult> {
  const defaultBindings = getDefaultParsedBindings();

  if (!isKeybindingCustomizationEnabled()) {
    return { bindings: defaultBindings, warnings: [] };
  }

  const userPath = getKeybindingsPath();

  try {
    const content = await readFile(userPath, "utf-8");
    const parsed: unknown = jsonParse(content);

    let userBlocks: unknown;
    if (typeof parsed === "object" && parsed !== null && "bindings" in parsed) {
      userBlocks = (parsed as { bindings: unknown }).bindings;
    } else {
      const msg = 'keybindings.json must have a "bindings" array';
      const suggestion = 'Use format: { "bindings": [ ... ] }';
      logForDebugging(`[keybindings] Invalid keybindings.json: ${msg}`);
      return {
        bindings: defaultBindings,
        warnings: [{ type: "parse_error", severity: "error", message: msg, suggestion }],
      };
    }

    if (!isKeybindingBlockArray(userBlocks)) {
      const msg = !Array.isArray(userBlocks)
        ? '"bindings" must be an array'
        : "keybindings.json contains invalid block structure";
      const suggestion = !Array.isArray(userBlocks)
        ? 'Set "bindings" to an array of keybinding blocks'
        : 'Each block must have "context" (string) and "bindings" (object)';
      logForDebugging(`[keybindings] Invalid keybindings.json: ${msg}`);
      return {
        bindings: defaultBindings,
        warnings: [{ type: "parse_error", severity: "error", message: msg, suggestion }],
      };
    }

    const userParsed = parseBindings(userBlocks);
    logForDebugging(`[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`);

    const mergedBindings = [...defaultBindings, ...userParsed];

    const duplicateKeyWarnings = checkDuplicateKeysInJson(content);
    const warnings = [...duplicateKeyWarnings, ...validateBindings(userBlocks, mergedBindings)];

    if (warnings.length > 0) {
      logForDebugging(`[keybindings] Found ${warnings.length} validation issue(s)`);
    }

    return { bindings: mergedBindings, warnings };
  } catch (error) {
    if (isENOENT(error)) {
      return { bindings: defaultBindings, warnings: [] };
    }
    logForDebugging(`[keybindings] Error loading ${userPath}: ${errorMessage(error)}`);
    return {
      bindings: defaultBindings,
      warnings: [
        {
          type: "parse_error",
          severity: "error",
          message: `Failed to parse keybindings.json: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Load keybindings synchronously (for initial render).
 * Uses cached value if available.
 */
export function loadKeybindingsSync(): ParsedBinding[] {
  if (cachedBindings) {
    return cachedBindings;
  }

  const result = loadKeybindingsSyncWithWarnings();
  return result.bindings;
}

/**
 * Load keybindings synchronously with validation warnings.
 * Uses cached values if available.
 */
export function loadKeybindingsSyncWithWarnings(): KeybindingsLoadResult {
  if (cachedBindings) {
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }

  const defaultBindings = getDefaultParsedBindings();

  if (!isKeybindingCustomizationEnabled()) {
    cachedBindings = defaultBindings;
    cachedWarnings = [];
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }

  const userPath = getKeybindingsPath();

  try {
    const content = readFileSync(userPath, "utf-8");
    const parsed: unknown = jsonParse(content);

    let userBlocks: unknown;
    if (typeof parsed === "object" && parsed !== null && "bindings" in parsed) {
      userBlocks = (parsed as { bindings: unknown }).bindings;
    } else {
      cachedBindings = defaultBindings;
      cachedWarnings = [
        {
          type: "parse_error",
          severity: "error",
          message: 'keybindings.json must have a "bindings" array',
          suggestion: 'Use format: { "bindings": [ ... ] }',
        },
      ];
      return { bindings: cachedBindings, warnings: cachedWarnings };
    }

    if (!isKeybindingBlockArray(userBlocks)) {
      const msg = !Array.isArray(userBlocks)
        ? '"bindings" must be an array'
        : "keybindings.json contains invalid block structure";
      const suggestion = !Array.isArray(userBlocks)
        ? 'Set "bindings" to an array of keybinding blocks'
        : 'Each block must have "context" (string) and "bindings" (object)';
      cachedBindings = defaultBindings;
      cachedWarnings = [{ type: "parse_error", severity: "error", message: msg, suggestion }];
      return { bindings: cachedBindings, warnings: cachedWarnings };
    }

    const userParsed = parseBindings(userBlocks);
    logForDebugging(`[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`);
    cachedBindings = [...defaultBindings, ...userParsed];

    const duplicateKeyWarnings = checkDuplicateKeysInJson(content);
    cachedWarnings = [...duplicateKeyWarnings, ...validateBindings(userBlocks, cachedBindings)];
    if (cachedWarnings.length > 0) {
      logForDebugging(`[keybindings] Found ${cachedWarnings.length} validation issue(s)`);
    }

    return { bindings: cachedBindings, warnings: cachedWarnings };
  } catch {
    cachedBindings = defaultBindings;
    cachedWarnings = [];
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }
}

/**
 * Initialize file watching for keybindings.json.
 * Call this once when the app starts.
 */
export async function initializeKeybindingWatcher(): Promise<void> {
  if (initialized || disposed) return;

  if (!isKeybindingCustomizationEnabled()) {
    logForDebugging("[keybindings] Skipping file watcher - user customization disabled");
    return;
  }

  const userPath = getKeybindingsPath();
  const watchDir = dirname(userPath);

  try {
    const stats = await stat(watchDir);
    if (!stats.isDirectory()) {
      logForDebugging(`[keybindings] Not watching: ${watchDir} is not a directory`);
      return;
    }
  } catch {
    logForDebugging(`[keybindings] Not watching: ${watchDir} does not exist`);
    return;
  }

  initialized = true;

  logForDebugging(`[keybindings] Watching for changes to ${userPath}`);

  watcher = chokidar.watch(userPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
      pollInterval: FILE_STABILITY_POLL_INTERVAL_MS,
    },
    ignorePermissionErrors: true,
    usePolling: false,
    atomic: true,
  });

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleDelete);
}

/**
 * Clean up the file watcher.
 */
export function disposeKeybindingWatcher(): void {
  disposed = true;
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  keybindingsChanged.clear();
}

/**
 * Subscribe to keybinding changes.
 * The listener receives the new parsed bindings when the file changes.
 */
export const subscribeToKeybindingChanges = keybindingsChanged.subscribe;

async function handleChange(path: string): Promise<void> {
  logForDebugging(`[keybindings] Detected change to ${path}`);

  try {
    const result = await loadKeybindings();
    cachedBindings = result.bindings;
    cachedWarnings = result.warnings;

    keybindingsChanged.emit(result);
  } catch (error) {
    logForDebugging(`[keybindings] Error reloading: ${errorMessage(error)}`);
  }
}

function handleDelete(path: string): void {
  logForDebugging(`[keybindings] Detected deletion of ${path}`);

  const defaultBindings = getDefaultParsedBindings();
  cachedBindings = defaultBindings;
  cachedWarnings = [];

  keybindingsChanged.emit({ bindings: defaultBindings, warnings: [] });
}

/**
 * Get the cached keybinding warnings.
 * Returns empty array if no warnings or bindings haven't been loaded yet.
 */
export function getCachedKeybindingWarnings(): KeybindingWarning[] {
  return cachedWarnings;
}

/**
 * Reset internal state for testing.
 */
export function resetKeybindingLoaderForTesting(): void {
  initialized = false;
  disposed = false;
  cachedBindings = null;
  cachedWarnings = [];
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
  keybindingsChanged.clear();
}
