import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AuthStorage } from "./types.js";

const DEFAULT_STORAGE_PATH = path.join(os.homedir(), ".claude-code-kit", "credentials.json");

/**
 * File-based credential storage.
 * Stores credentials as a JSON object `{ [provider]: credential }`.
 */
export class FileAuthStorage implements AuthStorage {
  constructor(private filePath: string = DEFAULT_STORAGE_PATH) {}

  async get(provider: string): Promise<string | null> {
    const data = await this.read();
    return data[provider] ?? null;
  }

  async set(provider: string, credential: string): Promise<void> {
    const data = await this.read();
    data[provider] = credential;
    await this.write(data);
  }

  async delete(provider: string): Promise<void> {
    const data = await this.read();
    delete data[provider];
    await this.write(data);
  }

  async list(): Promise<string[]> {
    const data = await this.read();
    return Object.keys(data);
  }

  private async read(): Promise<Record<string, string>> {
    try {
      const content = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async write(data: Record<string, string>): Promise<void> {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }
}

/**
 * In-memory credential storage for testing.
 */
export class MemoryAuthStorage implements AuthStorage {
  private store = new Map<string, string>();

  async get(provider: string): Promise<string | null> {
    return this.store.get(provider) ?? null;
  }

  async set(provider: string, credential: string): Promise<void> {
    this.store.set(provider, credential);
  }

  async delete(provider: string): Promise<void> {
    this.store.delete(provider);
  }

  async list(): Promise<string[]> {
    return [...this.store.keys()];
  }
}
