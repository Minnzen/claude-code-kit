import type { LLMProvider } from "../types.js";
import { FileAuthStorage } from "./storage.js";
import type { AuthOptions, AuthStorage, ProviderRegistration } from "./types.js";

export interface ProviderInfo {
  name: string;
  registration: ProviderRegistration;
  hasCredential: boolean;
}

/**
 * Open provider registry — register any LLM provider with any auth method,
 * then authenticate and get a configured LLMProvider instance.
 *
 * Credential resolution order:
 * 1. Environment variable (if `envVar` is set)
 * 2. Stored credential (from AuthStorage)
 * 3. Error (credential required but not found)
 */
export class AuthRegistry {
  private providers = new Map<string, ProviderRegistration>();
  private storage: AuthStorage;

  constructor(options?: AuthOptions) {
    this.storage =
      options?.storage ?? new FileAuthStorage(options?.storagePath);
  }

  /**
   * Register a provider. Open — any provider, any auth type.
   * Overwrites existing registration with the same name.
   */
  register(name: string, registration: ProviderRegistration): void {
    this.providers.set(name, registration);
  }

  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  getRegistration(name: string): ProviderRegistration | undefined {
    return this.providers.get(name);
  }

  /**
   * Authenticate and get a configured LLMProvider.
   *
   * Resolution order:
   * 1. Environment variable (if `envVar` is defined on registration)
   * 2. Stored credential (from AuthStorage)
   * 3. Throws if no credential found
   *
   * For providers with `type: 'none'` (e.g. Ollama), no credential is required.
   */
  async authenticate(name: string): Promise<LLMProvider> {
    const reg = this.providers.get(name);
    if (!reg) {
      throw new Error(
        `Provider "${name}" is not registered. Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    if (reg.type === "none") {
      return reg.createProvider("");
    }

    if (reg.envVar) {
      const envValue = process.env[reg.envVar];
      if (envValue) {
        return reg.createProvider(envValue);
      }
    }

    const stored = await this.storage.get(name);
    if (stored) {
      return reg.createProvider(stored);
    }

    const hint = reg.envVar ? ` Set ${reg.envVar} or call registry.storeCredential("${name}", key).` : "";
    throw new Error(`No credential found for provider "${name}".${hint}`);
  }

  /**
   * Get a provider using only environment variables — no storage, no prompts.
   * Throws if the env var is not set (or provider type is 'none').
   */
  fromEnv(name: string): LLMProvider {
    const reg = this.providers.get(name);
    if (!reg) {
      throw new Error(
        `Provider "${name}" is not registered. Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    if (reg.type === "none") {
      return reg.createProvider("");
    }

    if (!reg.envVar) {
      throw new Error(`Provider "${name}" has no envVar configured for env-only auth.`);
    }

    const envValue = process.env[reg.envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${reg.envVar} is not set for provider "${name}".`);
    }

    return reg.createProvider(envValue);
  }

  async storeCredential(name: string, credential: string): Promise<void> {
    await this.storage.set(name, credential);
  }

  async listProviders(): Promise<ProviderInfo[]> {
    const stored = await this.storage.list();
    const storedSet = new Set(stored);

    const result: ProviderInfo[] = [];
    for (const [name, registration] of this.providers) {
      let hasCredential = registration.type === "none";

      if (!hasCredential && registration.envVar && process.env[registration.envVar]) {
        hasCredential = true;
      }

      if (!hasCredential && storedSet.has(name)) {
        hasCredential = true;
      }

      result.push({ name, registration, hasCredential });
    }

    return result;
  }

  async logout(name: string): Promise<void> {
    await this.storage.delete(name);
  }
}
