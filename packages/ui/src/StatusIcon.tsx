import { Text } from "@claude-code-kit/ink-renderer";
import figures from "figures";
import type React from "react";

type Status = "success" | "error" | "warning" | "info" | "pending" | "loading";

type Props = {
  status: Status;
  withSpace?: boolean;
};

const STATUS_CONFIG: Record<Status, { icon: string; color: string | undefined }> = {
  success: { icon: figures.tick, color: "green" },
  error: { icon: figures.cross, color: "red" },
  warning: { icon: figures.warning, color: "yellow" },
  info: { icon: figures.info, color: "blue" },
  pending: { icon: figures.circle, color: undefined },
  loading: { icon: "…", color: undefined },
};

export function StatusIcon({ status, withSpace = false }: Props): React.ReactNode {
  const config = STATUS_CONFIG[status];
  return (
    <Text color={config.color} dimColor={!config.color}>
      {config.icon}
      {withSpace && " "}
    </Text>
  );
}
