import { promises as fs } from "node:fs";
import path from "node:path";
import type { Message, Session } from "../types.js";

/** Type guard for Node.js filesystem errors with an error code. */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * JSONL-backed session that persists conversation messages to disk.
 * Each session is stored as `{directory}/{id}.jsonl`, one JSON message per line.
 */
export class FileSession implements Session {
  private directory: string;
  private id: string;
  private messages: Message[] = [];

  constructor(directory: string, id: string) {
    this.directory = directory;
    this.id = id;
  }

  /** Return a snapshot of the in-memory messages. */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /** Replace the in-memory messages and persist to disk. */
  setMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  /** Clear in-memory messages (does not delete the file). */
  clear(): void {
    this.messages = [];
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers (used by FileSessionStore)
  // ---------------------------------------------------------------------------

  /** Resolve the .jsonl file path for this session. */
  filePath(): string {
    return path.join(this.directory, `${this.id}.jsonl`);
  }

  /** Load messages from disk into memory. Returns self for chaining. */
  async load(): Promise<this> {
    try {
      const content = await fs.readFile(this.filePath(), "utf8");
      this.messages = content
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Message);
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        this.messages = [];
      } else {
        throw err;
      }
    }
    return this;
  }

  /** Write current in-memory messages to disk (overwrites the file). */
  async save(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const content = this.messages.map((m) => JSON.stringify(m)).join("\n");
    await fs.writeFile(this.filePath(), content, "utf8");
  }

  /** Append a single message to the file without rewriting it. */
  async append(message: Message): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.appendFile(this.filePath(), JSON.stringify(message) + "\n", "utf8");
    this.messages.push(message);
  }
}

// ---------------------------------------------------------------------------
// FileSessionStore — manages multiple FileSession instances
// ---------------------------------------------------------------------------

/**
 * Store that creates and manages file-backed sessions in a directory.
 *
 * @example
 * ```ts
 * const store = new FileSessionStore("./sessions");
 * const session = await store.load("my-session");
 * // ... use session ...
 * await store.save("my-session", session);
 * ```
 */
export class FileSessionStore {
  constructor(private directory: string) {}

  /** Create a new (empty) session without persisting it. */
  create(id: string): FileSession {
    return new FileSession(this.directory, id);
  }

  /** Load an existing session from disk. Returns null if not found. */
  async load(id: string): Promise<FileSession | null> {
    const session = new FileSession(this.directory, id);
    try {
      await session.load();
      return session;
    } catch {
      return null;
    }
  }

  /** Persist the current messages of a session to disk. */
  async save(id: string, session: FileSession): Promise<void> {
    const target = new FileSession(this.directory, id);
    target.setMessages(session.getMessages());
    await target.save();
  }

  /** List all session IDs in the directory. */
  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.directory);
      return entries
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => f.slice(0, -".jsonl".length));
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /** Delete a session file from disk. */
  async delete(id: string): Promise<void> {
    const filePath = path.join(this.directory, `${id}.jsonl`);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if (!isErrnoException(err) || err.code !== "ENOENT") {
        throw err;
      }
    }
  }
}
