import type { LLMProvider } from "../types.js";

export type AuthType = "api-key" | "oauth" | "token" | "none";

export interface ProviderRegistration {
  type: AuthType;
  displayName?: string;
  description?: string;
  /** Environment variable to check for API key */
  envVar?: string;
  /** Base URL for OpenAI-compatible providers */
  baseURL?: string;
  defaultModel?: string;
  /** Factory that creates a configured LLMProvider from a credential string */
  createProvider: (credential: string) => LLMProvider;
  authURL?: string;
  tokenURL?: string;
  scopes?: string[];
}

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
