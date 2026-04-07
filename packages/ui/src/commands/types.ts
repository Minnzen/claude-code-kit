import type React from "react";

export type CommandResult = { type: "text"; value: string } | { type: "skip" };

export type CommandOnDone = (result?: string) => void;

export type CommandBase = {
  name: string;
  description: string;
  aliases?: string[];
  isHidden?: boolean;
  isEnabled?: () => boolean;
  argumentHint?: string;
};

export type LocalCommand = CommandBase & {
  type: "local";
  execute: (args: string) => Promise<CommandResult> | CommandResult;
};

export type JSXCommand = CommandBase & {
  type: "jsx";
  render: (onDone: CommandOnDone, args: string) => React.ReactNode;
};

export type Command = LocalCommand | JSXCommand;
