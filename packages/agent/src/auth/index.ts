export { AuthRegistry } from "./registry.js";
export type { ProviderInfo } from "./registry.js";
export { FileAuthStorage, MemoryAuthStorage } from "./storage.js";
export { PRESET_PROVIDERS } from "./presets.js";
export type {
  AuthType,
  AuthMethod,
  AuthMethodApiKey,
  AuthMethodOAuth,
  AuthMethodBaseUrlKey,
  AuthMethodNone,
  ProviderRegistration,
  AuthStorage,
  AuthOptions,
  AuthFlowStep,
  AuthFlowState,
  AuthFlowProviderOption,
} from "./types.js";

import type { AuthOptions } from "./types.js";
import { AuthRegistry } from "./registry.js";
import { PRESET_PROVIDERS } from "./presets.js";

/**
 * Create an AuthRegistry with all preset providers pre-registered.
 *
 * @example
 * ```ts
 * const auth = createAuth();
 * const provider = await auth.authenticate('anthropic');
 * // or register your own
 * auth.register('my-llm', { displayName: 'My LLM', authMethods: [...], ... });
 * ```
 */
export function createAuth(options?: AuthOptions): AuthRegistry {
  const registry = new AuthRegistry(options);
  for (const [name, reg] of Object.entries(PRESET_PROVIDERS)) {
    registry.register(name, reg);
  }
  return registry;
}
