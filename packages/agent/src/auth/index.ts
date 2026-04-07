export type { OAuthFlowResult, OAuthTokenResponse } from "./oauth.js";
export {
  generateCodeChallenge,
  generateCodeVerifier,
  openBrowser,
  startOAuthFlow,
} from "./oauth.js";
export { PRESET_PROVIDERS } from "./presets.js";
export type { ProviderInfo } from "./registry.js";
export { AuthRegistry } from "./registry.js";
export { FileAuthStorage, MemoryAuthStorage } from "./storage.js";
export type {
  AuthFlowProviderOption,
  AuthFlowState,
  AuthFlowStep,
  AuthMethod,
  AuthMethodApiKey,
  AuthMethodBaseUrlKey,
  AuthMethodNone,
  AuthMethodOAuth,
  AuthOptions,
  AuthStorage,
  AuthType,
  ProviderRegistration,
} from "./types.js";

import { PRESET_PROVIDERS } from "./presets.js";
import { AuthRegistry } from "./registry.js";
import type { AuthOptions } from "./types.js";

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
