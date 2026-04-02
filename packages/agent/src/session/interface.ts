import type { Session } from "../types.js";

export type { Session };

/**
 * Factory for creating sessions. Implementations can back sessions with
 * different storage mechanisms (memory, disk, database, etc.).
 */
export interface SessionFactory {
  create(id?: string): Session;
  load(id: string): Promise<Session | null>;
  save(id: string, session: Session): Promise<void>;
}
