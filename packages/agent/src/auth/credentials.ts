import { z } from "zod";

const SAVED_AUTH_PREFIX = "claude-code-kit:auth:v1:";
const savedAuthSchema = z.object({
  method: z.enum(["api-key", "base-url-key", "oauth"]),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  token: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().finite().nonnegative().optional(),
});

export type SavedAuth = z.infer<typeof savedAuthSchema>;

export function encodeSavedAuth(credentials: SavedAuth): string {
  return `${SAVED_AUTH_PREFIX}${JSON.stringify(savedAuthSchema.parse(credentials))}`;
}

export function decodeSavedAuth(credential: string): SavedAuth | null {
  if (!credential.startsWith(SAVED_AUTH_PREFIX)) return null;
  try {
    return savedAuthSchema.parse(JSON.parse(credential.slice(SAVED_AUTH_PREFIX.length)));
  } catch {
    throw new Error("Saved authentication data is invalid; authenticate again.");
  }
}
