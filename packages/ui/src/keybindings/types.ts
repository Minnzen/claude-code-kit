/**
 * Core types for the keybinding system.
 */

import type { KEYBINDING_CONTEXTS } from "./schema";

export type KeybindingContextName = (typeof KEYBINDING_CONTEXTS)[number];

export type ParsedKeystroke = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  super: boolean;
};

export type Chord = ParsedKeystroke[];

export type KeybindingBlock = {
  context: KeybindingContextName;
  bindings: Record<string, string | null>;
};

export type ParsedBinding = {
  chord: Chord;
  action: string | null;
  context: KeybindingContextName;
};
