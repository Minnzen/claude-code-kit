import type { Command } from "./types";

export const exitCommand: Command = {
  name: "exit",
  description: "Exit the application",
  aliases: ["quit", "q"],
  type: "local",
  execute: () => {
    process.exit(0);
  },
};

export const helpCommand = (registry: { getVisible: () => Command[] }): Command => ({
  name: "help",
  description: "Show available commands",
  aliases: ["?"],
  type: "local",
  execute: () => {
    const commands = registry.getVisible();
    const lines = commands.map((cmd) => {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";
      return `  /${cmd.name}${aliases} — ${cmd.description}`;
    });
    return { type: "text", value: ["Available commands:", "", ...lines].join("\n") };
  },
});

export const clearCommand: Command = {
  name: "clear",
  description: "Clear the screen",
  type: "local",
  execute: () => {
    process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
    return { type: "skip" };
  },
};
