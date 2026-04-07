import type { Command, JSXCommand, LocalCommand } from "./types";

export function defineCommand(cmd: Command): Command {
  return cmd;
}

export function defineLocalCommand(cmd: Omit<LocalCommand, "type">): LocalCommand {
  return { ...cmd, type: "local" };
}

export function defineJSXCommand(cmd: Omit<JSXCommand, "type">): JSXCommand {
  return { ...cmd, type: "jsx" };
}
