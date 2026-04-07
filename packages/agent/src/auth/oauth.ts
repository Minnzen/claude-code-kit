import { exec } from "node:child_process";
import * as crypto from "node:crypto";
import * as http from "node:http";
import type { AuthMethodOAuth } from "./types.js";

const DEFAULT_CALLBACK_PORT = 9876;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

// ---------------------------------------------------------------------------
// PKCE utilities
// ---------------------------------------------------------------------------

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ---------------------------------------------------------------------------
// Local callback server — listens for the OAuth redirect
// ---------------------------------------------------------------------------

export interface OAuthCallbackResult {
  code: string;
  state?: string;
}

export function startCallbackServer(
  port: number,
  timeoutMs: number,
): { promise: Promise<OAuthCallbackResult>; abort: () => void } {
  let server: http.Server | undefined;

  const promise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authentication failed</h1><p>You can close this window.</p></body></html>",
        );
        server?.close();
        reject(new Error(`OAuth error: ${error}${errorDesc ? ` — ${errorDesc}` : ""}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p></body></html>",
        );
        server?.close();
        resolve({
          code,
          state: url.searchParams.get("state") ?? undefined,
        });
        return;
      }

      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing code parameter");
    });

    server.listen(port, "127.0.0.1");
    server.on("error", (err) => {
      reject(new Error(`Failed to start OAuth callback server on port ${port}: ${err.message}`));
    });

    const timer = setTimeout(() => {
      server?.close();
      reject(new Error("OAuth flow timed out — no callback received."));
    }, timeoutMs);

    // Prevent timer from keeping the process alive
    timer.unref();
  });

  return {
    promise,
    abort: () => server?.close(),
  };
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeToken(
  tokenURL: string,
  params: {
    code: string;
    clientId: string;
    codeVerifier: string;
    redirectUri: string;
  },
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(tokenURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as OAuthTokenResponse;
}

// ---------------------------------------------------------------------------
// Browser open — cross-platform
// ---------------------------------------------------------------------------

export function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      // Non-fatal — user can copy-paste the URL from terminal output
    }
  });
}

// ---------------------------------------------------------------------------
// Full OAuth PKCE flow — combines all steps
// ---------------------------------------------------------------------------

export interface OAuthFlowResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * Run the full OAuth PKCE flow:
 * 1. Generate PKCE code verifier + challenge
 * 2. Start local callback server
 * 3. Open browser to authorization URL
 * 4. Wait for callback with auth code
 * 5. Exchange code for token
 *
 * Returns an abort function so the caller can cancel the flow.
 */
export function startOAuthFlow(method: AuthMethodOAuth): {
  promise: Promise<OAuthFlowResult>;
  abort: () => void;
  authorizationURL: string;
} {
  const port = method.callbackPort ?? DEFAULT_CALLBACK_PORT;
  const timeoutMs = method.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const redirectUri = `http://localhost:${port}/callback`;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: method.clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  if (method.scopes && method.scopes.length > 0) {
    params.set("scope", method.scopes.join(" "));
  }

  const authorizationURL = `${method.authorizationURL}?${params.toString()}`;

  const { promise: callbackPromise, abort } = startCallbackServer(port, timeoutMs);

  const promise = (async () => {
    openBrowser(authorizationURL);

    const result = await callbackPromise;

    // Validate state
    if (result.state && result.state !== state) {
      throw new Error("OAuth state mismatch — possible CSRF attack.");
    }

    // Exchange code for token
    const tokenResponse = await exchangeToken(method.tokenURL, {
      code: result.code,
      clientId: method.clientId,
      codeVerifier,
      redirectUri,
    });

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    };
  })();

  return { promise, abort, authorizationURL };
}
