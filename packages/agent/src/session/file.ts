import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import type { Message, Session } from "../types.js";

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function validateSessionId(id: string): void {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error("Invalid session id: use letters, digits, dots, underscores, or hyphens.");
  }
}

/** Pin the configured directory's real path so later symlink changes cannot redirect IO. */
class SessionDirectory {
  private canonicalPath?: string;
  readonly path: string;

  constructor(directory: string) {
    this.path = path.resolve(directory);
  }

  async resolve(create = false): Promise<string> {
    if (create) await fs.mkdir(this.path, { recursive: true });
    const resolved = await fs.realpath(this.path);
    if (this.canonicalPath && this.canonicalPath !== resolved) {
      throw new Error("Session directory changed after it was opened.");
    }
    this.canonicalPath = resolved;
    return resolved;
  }
}

async function openSessionFile(filePath: string, flags: number): Promise<FileHandle> {
  // O_NOFOLLOW checks the final component at open time, including dangling links.
  const file = await fs.open(filePath, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    if (!(await file.stat()).isFile()) throw new Error("Session path must be a regular file.");
    return file;
  } catch (err) {
    await file.close();
    throw err;
  }
}

async function readMessages(directory: SessionDirectory, id: string): Promise<Message[] | null> {
  let file: FileHandle;
  try {
    file = await openSessionFile(
      path.join(await directory.resolve(), `${id}.jsonl`),
      constants.O_RDONLY,
    );
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return null;
    throw err;
  }
  try {
    const content = await file.readFile("utf8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Message);
  } finally {
    await file.close();
  }
}

/**
 * JSONL-backed session stored as `{directory}/{id}.jsonl`.
 * `setMessages()` and `clear()` only change memory; call `save()` to persist them.
 * Call `load()` before appending if this instance needs existing messages in memory.
 */
export class FileSession implements Session {
  private directory: SessionDirectory;
  private messages: Message[] = [];

  constructor(
    directory: string,
    private id: string,
  ) {
    validateSessionId(id);
    this.directory = new SessionDirectory(directory);
  }

  /** Return a snapshot of the in-memory messages. */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /** Replace in-memory messages. Persistence is explicit via `save()`. */
  setMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  /** Clear in-memory messages. Call `save()` to clear the persisted history. */
  clear(): void {
    this.messages = [];
  }

  filePath(): string {
    return path.join(this.directory.path, `${this.id}.jsonl`);
  }

  /** Load messages from disk; a missing file produces an empty session. */
  async load(): Promise<this> {
    this.messages = (await readMessages(this.directory, this.id)) ?? [];
    return this;
  }

  /** Overwrite the persisted history with the current in-memory messages. */
  async save(): Promise<void> {
    const content = this.messages.map((m) => `${JSON.stringify(m)}\n`).join("");
    const file = await openSessionFile(
      path.join(await this.directory.resolve(true), `${this.id}.jsonl`),
      constants.O_WRONLY | constants.O_CREAT,
    );
    try {
      await file.truncate(0);
      await file.writeFile(content, "utf8");
    } finally {
      await file.close();
    }
  }

  /** Append to disk and memory. This does not save other unsaved in-memory changes. */
  async append(message: Message): Promise<void> {
    const file = await openSessionFile(
      path.join(await this.directory.resolve(true), `${this.id}.jsonl`),
      constants.O_RDWR | constants.O_APPEND | constants.O_CREAT,
    );
    try {
      const { size } = await file.stat();
      const lastByte = Buffer.alloc(1);
      if (size > 0) await file.read(lastByte, 0, 1, size - 1);
      const separator = size > 0 && lastByte[0] !== 10 ? "\n" : "";
      await file.writeFile(`${separator}${JSON.stringify(message)}\n`, "utf8");
      this.messages.push(message);
    } finally {
      await file.close();
    }
  }
}

/** Creates and manages file-backed sessions. Call `save()` explicitly after changes. */
export class FileSessionStore {
  private directory: SessionDirectory;

  constructor(directory: string) {
    this.directory = new SessionDirectory(directory);
  }

  /** Create an empty in-memory session without persisting it. */
  create(id: string): FileSession {
    return new FileSession(this.directory.path, id);
  }

  /** Returns null only for a missing file; corruption and filesystem errors propagate. */
  async load(id: string): Promise<FileSession | null> {
    validateSessionId(id);
    const messages = await readMessages(this.directory, id);
    if (messages === null) return null;
    const session = new FileSession(await this.directory.resolve(), id);
    session.setMessages(messages);
    return session;
  }

  async save(id: string, session: FileSession): Promise<void> {
    validateSessionId(id);
    const target = new FileSession(await this.directory.resolve(true), id);
    target.setMessages(session.getMessages());
    await target.save();
  }

  /** List regular session files; directories and symlinks are excluded. */
  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(await this.directory.resolve(), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.jsonl$/.test(entry.name))
        .map((entry) => entry.name.slice(0, -".jsonl".length));
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === "ENOENT") return [];
      throw err;
    }
  }

  /** Unlink a session entry. Unlink never follows a final-component symlink. */
  async delete(id: string): Promise<void> {
    validateSessionId(id);
    try {
      await fs.unlink(path.join(await this.directory.resolve(), `${id}.jsonl`));
    } catch (err: unknown) {
      if (!isErrnoException(err) || err.code !== "ENOENT") throw err;
    }
  }
}
