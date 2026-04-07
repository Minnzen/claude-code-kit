import type { LLMProvider } from "../types.js";

// ---------------------------------------------------------------------------
// Auth methods — each provider can support multiple methods
// ---------------------------------------------------------------------------

export type AuthMethodApiKey = {
  type: "api-key";
  envVar?: string;
  inputLabel?: string;
};

export type AuthMethodBaseUrlKey = {
  type: "base-url-key";
  defaultBaseURL: string;
  envVar?: string;
  inputLabel?: string;
};

export type AuthMethodNone = {
  type: "none";
};

export type AuthMethodOAuth = {
  type: "oauth";
  authorizationURL: string;
  tokenURL: string;
  clientId: string;
  scopes?: string[];
  /** Port for local callback server. Default: 9876 */
  callbackPort?: number;
  /** Timeout in ms for the OAuth flow. Default: 300000 (5 minutes) */
  timeoutMs?: number;
};

export type AuthMethod = AuthMethodApiKey | AuthMethodBaseUrlKey | AuthMethodNone | AuthMethodOAuth;

export type AuthType = AuthMethod["type"];

// ---------------------------------------------------------------------------
// Provider registration — multi-method, model-aware
// ---------------------------------------------------------------------------

export interface ProviderRegistration {
  displayName: string;
  description?: string;
  authMethods: AuthMethod[];
  defaultModel?: string;
  models?: string[];
  /** Factory that creates a configured LLMProvider from resolved credentials */
  createProvider: (config: { apiKey?: string; baseURL?: string; token?: string }) => LLMProvider;
}

// ---------------------------------------------------------------------------
// Interactive auth flow
// ---------------------------------------------------------------------------

export type AuthFlowStep =
  | "select-provider"
  | "select-auth-method"
  | "input-credentials"
  | "oauth-pending"
  | "validating"
  | "select-model"
  | "done";

export interface AuthFlowProviderOption {
  name: string;
  displayName: string;
  description?: string;
}

export interface AuthFlowState {
  step: AuthFlowStep;
  providers?: AuthFlowProviderOption[];
  authMethods?: AuthMethod[];
  models?: string[];
  currentProvider?: string;
  currentAuthMethod?: AuthMethod;
  currentModel?: string;
  result?: {
    provider: LLMProvider;
    model: string;
    providerName: string;
  };
}

// ---------------------------------------------------------------------------
// Storage & options (unchanged)
// ---------------------------------------------------------------------------

export interface AuthStorage {
  get(provider: string): Promise<string | null>;
  set(provider: string, credential: string): Promise<void>;
  delete(provider: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface AuthOptions {
  storage?: AuthStorage;
  /** Default: ~/.claude-code-kit/credentials.json */
  storagePath?: string;
}
