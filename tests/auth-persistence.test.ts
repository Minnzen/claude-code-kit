import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRegistry } from "../packages/agent/src/auth/registry.ts";
import { FileAuthStorage, MemoryAuthStorage } from "../packages/agent/src/auth/storage.ts";
import type {
  AuthMethod,
  AuthMethodOAuth,
  AuthStorage,
  ProviderRegistration,
} from "../packages/agent/src/auth/types.ts";

const oauthMethod: AuthMethodOAuth = {
  type: "oauth",
  authorizationURL: "https://auth.example.invalid/authorize",
  tokenURL: "https://auth.example.invalid/token",
  clientId: "test-client",
};
const directories: string[] = [];

function makeRegistry(storage: AuthStorage, methods: AuthMethod[], models?: string[]) {
  const configs: Parameters<ProviderRegistration["createProvider"]>[0][] = [];
  const registry = new AuthRegistry({ storage });
  registry.register("custom", {
    displayName: "Custom",
    authMethods: methods,
    models,
    createProvider: (config) => {
      configs.push(config);
      return {
        async *chat() {
          yield { type: "done" as const };
        },
      };
    },
  });
  return { registry, configs };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Auth credential persistence", () => {
  it("restores custom baseURL and the selected auth method across registry instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kit-auth-test-"));
    directories.push(directory);
    const file = join(directory, "credentials.json");
    const method = {
      type: "base-url-key" as const,
      defaultBaseURL: "https://default.example.invalid/v1",
    };
    const methods: AuthMethod[] = [{ type: "api-key" }, method];
    const first = makeRegistry(new FileAuthStorage(file), methods);
    await first.registry.inputCredentials("custom", method, {
      apiKey: "test-only-key",
      baseURL: "https://custom.example.invalid/v1",
    });
    const restored = makeRegistry(new FileAuthStorage(file), methods);
    await restored.registry.authenticate("custom");
    expect(restored.configs).toEqual([
      { apiKey: "test-only-key", baseURL: "https://custom.example.invalid/v1" },
    ]);
  });

  it("retains custom baseURL when the interactive flow advances to model selection", async () => {
    const method = { type: "base-url-key" as const, defaultBaseURL: "" };
    const { registry, configs } = makeRegistry(new MemoryAuthStorage(), [method], ["test-model"]);
    await registry.inputCredentials("custom", method, {
      apiKey: "test-key",
      baseURL: "https://custom.example.invalid/v1",
    });
    await registry.selectModel("custom", method, "test-model");
    expect(configs).toEqual([{ apiKey: "test-key", baseURL: "https://custom.example.invalid/v1" }]);
  });

  it("restores OAuth credentials as tokens for model selection", async () => {
    const storage = new MemoryAuthStorage();
    const { registry, configs } = makeRegistry(storage, [oauthMethod], ["test-model"]);
    await registry.completeOAuth("custom", oauthMethod, {
      accessToken: "test-access",
      expiresIn: 120,
    });
    await registry.selectModel("custom", oauthMethod, "test-model");
    expect(configs).toEqual([{ apiKey: "test-access", token: "test-access" }]);
  });

  it("rejects an expired OAuth token without refresh credentials instead of sending it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const storage = new MemoryAuthStorage();
    const first = makeRegistry(storage, [oauthMethod]);
    await first.registry.completeOAuth("custom", oauthMethod, {
      accessToken: "expired-access",
      expiresIn: 5,
    });
    vi.setSystemTime(6_000);
    const restored = makeRegistry(storage, [oauthMethod]);
    await expect(restored.registry.authenticate("custom")).rejects.toThrow(
      /expired.*authenticate again/i,
    );
    expect(restored.configs).toEqual([]);
    expect((await restored.registry.listProviders())[0]?.hasCredential).toBe(false);
  });

  it("refreshes an expired OAuth token and persists the rotated token and expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const storage = new MemoryAuthStorage();
    const first = makeRegistry(storage, [oauthMethod]);
    await first.registry.completeOAuth("custom", oauthMethod, {
      accessToken: "initial-access",
      refreshToken: "initial-refresh",
      expiresIn: 5,
    });
    vi.setSystemTime(6_000);
    const requests: URLSearchParams[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(new URLSearchParams(init.body as string));
        return {
          ok: true,
          json: async () => ({
            access_token: "renewed-access",
            refresh_token: "renewed-refresh",
            token_type: "Bearer",
            expires_in: 10,
          }),
        };
      }),
    );
    const restored = makeRegistry(storage, [oauthMethod]);
    await restored.registry.authenticate("custom");
    expect(restored.configs).toEqual([{ apiKey: "renewed-access", token: "renewed-access" }]);
    expect(requests[0]?.get("grant_type")).toBe("refresh_token");
    expect(requests[0]?.get("refresh_token")).toBe("initial-refresh");
    expect(requests[0]?.get("client_id")).toBe("test-client");
    const again = makeRegistry(storage, [oauthMethod]);
    await again.registry.authenticate("custom");
    expect(requests).toHaveLength(1);
    vi.setSystemTime(16_000);
    await again.registry.authenticate("custom");
    expect(requests[1]?.get("refresh_token")).toBe("renewed-refresh");
  });

  it("keeps legacy string credentials compatible with custom storage implementations", async () => {
    const storage = new MemoryAuthStorage();
    const { registry, configs } = makeRegistry(storage, [{ type: "api-key" }]);
    await registry.storeCredential("custom", "legacy-plain-key");
    expect(await storage.get("custom")).toBe("legacy-plain-key");
    await registry.authenticate("custom");
    expect(configs).toEqual([{ apiKey: "legacy-plain-key" }]);
  });
});
