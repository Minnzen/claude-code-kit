import type { Message } from "./message";

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

/** Persisted session data. */
export interface SessionData {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/** Interface for loading and saving agent sessions. */
export interface SessionStore {
  /** Load a session by ID. Returns undefined if not found. */
  load(id: string): Promise<SessionData | undefined>;
  /** Save a session (create or overwrite). */
  save(session: SessionData): Promise<void>;
  /** Append messages to an existing session (optional, for incremental saves). */
  append?(id: string, messages: Message[]): Promise<void>;
  /** List all stored session IDs. */
  list?(): Promise<string[]>;
  /** Delete a session by ID. */
  delete?(id: string): Promise<void>;
}
