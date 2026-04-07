import type { Command } from "./types";

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(...commands: Command[]): void {
    for (const cmd of commands) {
      this.commands.set(cmd.name, cmd);
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          this.commands.set(alias, cmd);
        }
      }
    }
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAll(): Command[] {
    // Deduplicate (aliases point to same command)
    return [...new Set(this.commands.values())];
  }

  getVisible(): Command[] {
    return this.getAll().filter((cmd) => !cmd.isHidden && (cmd.isEnabled?.() ?? true));
  }

  parse(input: string): { command: Command; args: string } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return null;

    const spaceIdx = trimmed.indexOf(" ");
    const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    const command = this.get(name);
    if (!command) return null;
    if (command.isEnabled && !command.isEnabled()) return null;

    return { command, args };
  }

  getSuggestions(partial: string): Command[] {
    if (!partial.startsWith("/")) return [];
    const search = partial.slice(1).toLowerCase();
    return this.getVisible().filter(
      (cmd) =>
        cmd.name.toLowerCase().startsWith(search) ||
        cmd.aliases?.some((a) => a.toLowerCase().startsWith(search)),
    );
  }
}

export function createCommandRegistry(commands: Command[]): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(...commands);
  return registry;
}
