import type { LLMProvider } from "../types.js";
import { decodeSavedAuth, encodeSavedAuth } from "./credentials.js";
import type { OAuthFlowResult } from "./oauth.js";
import { refreshOAuthToken, startOAuthFlow } from "./oauth.js";
import { FileAuthStorage } from "./storage.js";
import type {
  AuthFlowState,
  AuthMethod,
  AuthMethodOAuth,
  AuthOptions,
  AuthStorage,
  ProviderRegistration,
} from "./types.js";

export interface ProviderInfo {
  name: string;
  registration: ProviderRegistration;
  hasCredential: boolean;
}

/**
 * Open provider registry — register any LLM provider with multiple auth methods,
 * then authenticate and get a configured LLMProvider instance.
 *
 * Supports an interactive step-by-step flow:
 *   select-provider → select-auth-method → input-credentials → select-model → done
 *
 * Credential resolution order (for automatic auth):
 * 1. Environment variable (if any auth method has `envVar`)
 * 2. Stored credential (from AuthStorage)
 * 3. Error (credential required but not found)
 */
export class AuthRegistry {
  private providers = new Map<string, ProviderRegistration>();
  private storage: AuthStorage;

  constructor(options?: AuthOptions) {
    this.storage = options?.storage ?? new FileAuthStorage(options?.storagePath);
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
   * Get the list of available models for a registered provider.
   */
  getModels(providerName: string): string[] {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(
        `Provider "${providerName}" is not registered. Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }
    return reg.models ?? [];
  }

  // -------------------------------------------------------------------------
  // Resolve credential from an auth method (env → storage → null)
  // -------------------------------------------------------------------------

  private resolveEnvCredential(method: AuthMethod): { apiKey?: string; baseURL?: string } | null {
    if (method.type === "none" || method.type === "oauth") return null;

    const envVar = method.envVar;
    if (envVar) {
      const value = process.env[envVar];
      if (value) {
        if (method.type === "base-url-key") {
          return { apiKey: value, baseURL: method.defaultBaseURL || undefined };
        }
        return { apiKey: value };
      }
    }
    return null;
  }

  private async saveOAuthCredential(providerName: string, result: OAuthFlowResult): Promise<void> {
    await this.storage.set(
      providerName,
      encodeSavedAuth({
        method: "oauth",
        token: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt:
          result.expiresIn === undefined ? undefined : Date.now() + result.expiresIn * 1_000,
      }),
    );
  }

  private async resolveStoredCredential(
    providerName: string,
    method: AuthMethod,
  ): Promise<{ apiKey?: string; baseURL?: string; token?: string } | null> {
    const stored = await this.storage.get(providerName);
    if (!stored || method.type === "none") return null;
    const saved = decodeSavedAuth(stored);
    if (saved && saved.method !== method.type) return null;

    if (method.type === "oauth") {
      if (!saved) return { token: stored, apiKey: stored };
      if (!saved.token) return null;
      if (saved.expiresAt !== undefined && saved.expiresAt <= Date.now()) {
        if (!saved.refreshToken) {
          throw new Error(`OAuth token for "${providerName}" expired; authenticate again.`);
        }
        try {
          const refreshed = await refreshOAuthToken(method.tokenURL, {
            clientId: method.clientId,
            refreshToken: saved.refreshToken,
          });
          await this.saveOAuthCredential(providerName, {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token ?? saved.refreshToken,
            expiresIn: refreshed.expires_in,
          });
          return { token: refreshed.access_token, apiKey: refreshed.access_token };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `OAuth token refresh failed for "${providerName}": ${message}; authenticate again.`,
          );
        }
      }
      return { token: saved.token, apiKey: saved.token };
    }

    const apiKey = saved?.apiKey ?? (saved ? undefined : stored);
    if (!apiKey) return null;
    return method.type === "base-url-key"
      ? { apiKey, baseURL: saved?.baseURL || method.defaultBaseURL || undefined }
      : { apiKey, ...(saved?.baseURL ? { baseURL: saved.baseURL } : {}) };
  }

  /**
   * Authenticate and get a configured LLMProvider.
   *
   * Resolution order for each auth method (tried in order):
   * 1. Environment variable (if method has `envVar`)
   * 2. Stored credential (from AuthStorage)
   * 3. Next auth method
   *
   * If no method resolves, throws.
   *
   * For providers with a `type: 'none'` auth method, no credential is required.
   */
  async authenticate(name: string): Promise<LLMProvider> {
    const reg = this.providers.get(name);
    if (!reg) {
      throw new Error(
        `Provider "${name}" is not registered. Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    // Try each auth method in order
    for (const method of reg.authMethods) {
      // 'none' — no credential needed
      if (method.type === "none") {
        return reg.createProvider({});
      }

      // Try env var
      const envCred = this.resolveEnvCredential(method);
      if (envCred) {
        return reg.createProvider(envCred);
      }

      // Try stored credential
      const stored = await this.resolveStoredCredential(name, method);
      if (stored) {
        return reg.createProvider(stored);
      }
    }

    // Build a helpful error message
    const envVars = reg.authMethods
      .map((m) => {
        if (m.type === "api-key" || m.type === "base-url-key") return m.envVar;
        return undefined;
      })
      .filter(Boolean);

    const envHint =
      envVars.length > 0
        ? ` Set ${envVars.join(" or ")} or call registry.storeCredential("${name}", key).`
        : "";
    throw new Error(`No credential found for provider "${name}".${envHint}`);
  }

  /**
   * Get a provider using only environment variables — no storage, no prompts.
   * Throws if no env var resolves (or provider has a 'none' method).
   */
  fromEnv(name: string): LLMProvider {
    const reg = this.providers.get(name);
    if (!reg) {
      throw new Error(
        `Provider "${name}" is not registered. Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    for (const method of reg.authMethods) {
      if (method.type === "none") {
        return reg.createProvider({});
      }

      const envCred = this.resolveEnvCredential(method);
      if (envCred) {
        return reg.createProvider(envCred);
      }
    }

    const envVars = reg.authMethods
      .map((m) => {
        if (m.type === "api-key" || m.type === "base-url-key") return m.envVar;
        return undefined;
      })
      .filter(Boolean);

    if (envVars.length === 0) {
      throw new Error(`Provider "${name}" has no envVar configured for env-only auth.`);
    }

    throw new Error(
      `Environment variable ${envVars.join(" / ")} is not set for provider "${name}".`,
    );
  }

  async storeCredential(name: string, credential: string): Promise<void> {
    await this.storage.set(name, credential);
  }

  async listProviders(): Promise<ProviderInfo[]> {
    const result: ProviderInfo[] = [];
    for (const [name, registration] of this.providers) {
      let hasCredential = registration.authMethods.some((m) => m.type === "none");

      if (!hasCredential) {
        for (const method of registration.authMethods) {
          const envCred = this.resolveEnvCredential(method);
          if (envCred) {
            hasCredential = true;
            break;
          }
        }
      }

      if (!hasCredential) {
        const stored = await this.storage.get(name);
        if (stored) {
          const saved = decodeSavedAuth(stored);
          hasCredential = saved
            ? registration.authMethods.some((method) => method.type === saved.method) &&
              (saved.method === "oauth"
                ? Boolean(saved.token) &&
                  (saved.expiresAt === undefined ||
                    saved.expiresAt > Date.now() ||
                    Boolean(saved.refreshToken))
                : Boolean(saved.apiKey))
            : true;
        }
      }

      result.push({ name, registration, hasCredential });
    }

    return result;
  }

  async logout(name: string): Promise<void> {
    await this.storage.delete(name);
  }

  /**
   * Validate credentials by creating a provider and making a lightweight call.
   * Throws with a descriptive error if invalid.
   */
  async validateCredentials(
    providerName: string,
    credentials: { apiKey?: string; baseURL?: string; token?: string },
  ): Promise<void> {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(`Provider "${providerName}" is not registered.`);
    }

    const provider = reg.createProvider(credentials);

    try {
      const gen = provider.chat({
        model: reg.defaultModel ?? "test",
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        maxTokens: 1,
      });

      for await (const chunk of gen) {
        if (chunk.type === "error") {
          throw new Error(chunk.error?.message ?? "Unknown provider error");
        }
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("invalid")) {
        throw new Error(`Invalid API key for ${providerName}: ${msg}`);
      }
      if (msg.includes("403") || msg.includes("Forbidden")) {
        throw new Error(`API key lacks permissions for ${providerName}: ${msg}`);
      }
      throw new Error(`Failed to validate credentials for ${providerName}: ${msg}`);
    }
  }

  /**
   * Run the full OAuth PKCE flow for a provider.
   */
  startOAuthFlow(
    providerName: string,
    method: AuthMethodOAuth,
  ): { promise: Promise<OAuthFlowResult>; abort: () => void; authorizationURL: string } {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(`Provider "${providerName}" is not registered.`);
    }
    return startOAuthFlow(method);
  }

  /**
   * Complete an OAuth flow — store the token and advance to model selection or done.
   */
  async completeOAuth(
    providerName: string,
    method: AuthMethodOAuth,
    oauthResult: OAuthFlowResult,
  ): Promise<AuthFlowState> {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(`Provider "${providerName}" is not registered.`);
    }

    await this.saveOAuthCredential(providerName, oauthResult);

    const credentials = { token: oauthResult.accessToken, apiKey: oauthResult.accessToken };

    if (reg.models && reg.models.length > 0) {
      return {
        step: "select-model",
        currentProvider: providerName,
        currentAuthMethod: method,
        models: reg.models,
        currentModel: reg.defaultModel,
      };
    }

    return {
      step: "done",
      currentProvider: providerName,
      currentAuthMethod: method,
      currentModel: reg.defaultModel,
      result: {
        provider: reg.createProvider(credentials),
        model: reg.defaultModel ?? "",
        providerName,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Interactive auth flow — step-by-step state machine
  // -------------------------------------------------------------------------

  /**
   * Start the interactive auth flow.
   * Returns the initial state with all available providers listed.
   */
  interactive(): AuthFlowState {
    const providers = [...this.providers.entries()].map(([name, reg]) => ({
      name,
      displayName: reg.displayName,
      description: reg.description,
    }));

    return {
      step: "select-provider",
      providers,
    };
  }

  /**
   * Advance the interactive flow by selecting a provider.
   */
  selectProvider(providerName: string): AuthFlowState {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(
        `Provider "${providerName}" is not registered. Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    // If only one auth method, skip method selection
    if (reg.authMethods.length === 1) {
      const method = reg.authMethods[0];

      // 'none' — skip credentials too, go straight to model selection
      if (method.type === "none") {
        if (reg.models && reg.models.length > 0) {
          return {
            step: "select-model",
            currentProvider: providerName,
            currentAuthMethod: method,
            models: reg.models,
            currentModel: reg.defaultModel,
          };
        }

        // No models defined — done
        return {
          step: "done",
          currentProvider: providerName,
          currentAuthMethod: method,
          currentModel: reg.defaultModel,
          result: {
            provider: reg.createProvider({}),
            model: reg.defaultModel ?? "",
            providerName,
          },
        };
      }

      // OAuth — go to oauth-pending step
      if (method.type === "oauth") {
        return {
          step: "oauth-pending",
          currentProvider: providerName,
          currentAuthMethod: method,
        };
      }

      // Single method that needs credentials
      return {
        step: "input-credentials",
        currentProvider: providerName,
        currentAuthMethod: method,
      };
    }

    // Multiple methods — ask user to pick one
    return {
      step: "select-auth-method",
      currentProvider: providerName,
      authMethods: reg.authMethods,
    };
  }

  /**
   * Advance the interactive flow by selecting an auth method.
   * Only needed when a provider has multiple auth methods.
   */
  selectAuthMethod(providerName: string, methodIndex: number): AuthFlowState {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(`Provider "${providerName}" is not registered.`);
    }

    const method = reg.authMethods[methodIndex];
    if (!method) {
      throw new Error(
        `Auth method index ${methodIndex} is out of range for "${providerName}" (has ${reg.authMethods.length} methods).`,
      );
    }

    if (method.type === "none") {
      if (reg.models && reg.models.length > 0) {
        return {
          step: "select-model",
          currentProvider: providerName,
          currentAuthMethod: method,
          models: reg.models,
          currentModel: reg.defaultModel,
        };
      }
      return {
        step: "done",
        currentProvider: providerName,
        currentAuthMethod: method,
        currentModel: reg.defaultModel,
        result: {
          provider: reg.createProvider({}),
          model: reg.defaultModel ?? "",
          providerName,
        },
      };
    }

    if (method.type === "oauth") {
      return {
        step: "oauth-pending",
        currentProvider: providerName,
        currentAuthMethod: method,
      };
    }

    return {
      step: "input-credentials",
      currentProvider: providerName,
      currentAuthMethod: method,
    };
  }

  /**
   * Advance the interactive flow by providing credentials.
   * Stores the credential and moves to model selection (or done).
   */
  async inputCredentials(
    providerName: string,
    method: AuthMethod,
    credentials: { apiKey?: string; baseURL?: string; token?: string },
  ): Promise<AuthFlowState> {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(`Provider "${providerName}" is not registered.`);
    }

    // Merge defaultBaseURL if not explicitly provided
    const resolvedCredentials = { ...credentials };
    if (method.type === "base-url-key" && !resolvedCredentials.baseURL && method.defaultBaseURL) {
      resolvedCredentials.baseURL = method.defaultBaseURL;
    }

    if (method.type !== "none" && (resolvedCredentials.apiKey || resolvedCredentials.token)) {
      await this.storage.set(
        providerName,
        encodeSavedAuth({
          method: method.type,
          ...resolvedCredentials,
          ...(method.type === "oauth"
            ? { token: resolvedCredentials.token ?? resolvedCredentials.apiKey }
            : {}),
        }),
      );
    }

    if (reg.models && reg.models.length > 0) {
      return {
        step: "select-model",
        currentProvider: providerName,
        currentAuthMethod: method,
        models: reg.models,
        currentModel: reg.defaultModel,
      };
    }

    // No model list — done
    return {
      step: "done",
      currentProvider: providerName,
      currentAuthMethod: method,
      currentModel: reg.defaultModel,
      result: {
        provider: reg.createProvider(resolvedCredentials),
        model: reg.defaultModel ?? "",
        providerName,
      },
    };
  }

  /**
   * Advance the interactive flow by selecting a model.
   * Returns the final 'done' state with a configured provider.
   */
  async selectModel(
    providerName: string,
    method: AuthMethod,
    model: string,
    credentials?: { apiKey?: string; baseURL?: string; token?: string },
  ): Promise<AuthFlowState> {
    const reg = this.providers.get(providerName);
    if (!reg) {
      throw new Error(`Provider "${providerName}" is not registered.`);
    }

    // Resolve credentials — try env, stored, or explicit
    let resolvedCreds = credentials;
    if (!resolvedCreds || (!resolvedCreds.apiKey && !resolvedCreds.token)) {
      if (method.type === "none") {
        resolvedCreds = {};
      } else {
        // Try env
        const envCred = this.resolveEnvCredential(method);
        if (envCred) {
          resolvedCreds = envCred;
        } else {
          // Try stored
          resolvedCreds = (await this.resolveStoredCredential(providerName, method)) ?? undefined;
        }
      }
    }

    if (!resolvedCreds) {
      throw new Error(
        `No credentials available for provider "${providerName}". Provide credentials or set env var.`,
      );
    }

    return {
      step: "done",
      currentProvider: providerName,
      currentAuthMethod: method,
      currentModel: model,
      result: {
        provider: reg.createProvider(resolvedCreds),
        model,
        providerName,
      },
    };
  }
}
