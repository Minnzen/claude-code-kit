import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCallbackServer, startOAuthFlow } from "../packages/agent/src/auth/oauth.ts";
import type { AuthMethodOAuth } from "../packages/agent/src/auth/types.ts";

const callback = vi.hoisted(() => ({
  handler: null as any,
  errorHandler: null as any,
  close: vi.fn(),
}));
vi.mock("node:http", () => ({
  createServer: (handler: unknown) => {
    callback.handler = handler;
    return {
      listen: vi.fn(),
      close: callback.close,
      on: (_event: string, handler: unknown) => {
        callback.errorHandler = handler;
      },
    };
  },
}));
vi.mock("node:child_process", () => ({ exec: vi.fn() }));

const method: AuthMethodOAuth = {
  type: "oauth",
  authorizationURL: "https://auth.example.invalid/authorize",
  tokenURL: "https://auth.example.invalid/token",
  clientId: "test-client",
};

function redirect(query: string) {
  callback.handler({ url: `/callback?${query}` }, { writeHead: vi.fn(), end: vi.fn() });
}

beforeEach(() => {
  vi.useFakeTimers();
  callback.close.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OAuth callback validation and cleanup", () => {
  it.each([
    "",
    "&state=wrong-state",
  ])("rejects a callback whose state is missing or incorrect: %s", async (state) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const flow = startOAuthFlow(method);
    const result = expect(flow.promise).rejects.toThrow(/state mismatch/i);
    redirect(`code=test-code${state}`);
    await result;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the authorization code only for an exact state match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ access_token: "test-access", token_type: "Bearer", expires_in: 60 }),
      })),
    );
    const flow = startOAuthFlow(method);
    const state = new URL(flow.authorizationURL).searchParams.get("state")!;
    redirect(`code=test-code&state=${state}`);
    expect(await flow.promise).toEqual({
      accessToken: "test-access",
      refreshToken: undefined,
      expiresIn: 60,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an aborted flow and clears its callback timeout", async () => {
    const server = startCallbackServer(9876, 1_000);
    const result = expect(server.promise).rejects.toThrow(/abort/i);
    server.abort();
    await result;
    expect(callback.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears callback timers when the callback server cannot listen", async () => {
    const server = startCallbackServer(9876, 1_000);
    const result = expect(server.promise).rejects.toThrow(/address in use/);
    callback.errorHandler(new Error("address in use"));
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
