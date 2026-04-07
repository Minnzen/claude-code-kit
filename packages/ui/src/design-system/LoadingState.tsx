import { Box, Text } from "@claude-code-kit/ink-renderer";
import type React from "react";
import { Spinner } from "../Spinner";

type LoadingStateProps = {
  /** The loading message to display next to the spinner. */
  message: string;

  /**
   * Display the message in bold.
   * @default false
   */
  bold?: boolean;

  /**
   * Display the message in dimmed color.
   * @default false
   */
  dimColor?: boolean;

  /** Optional subtitle displayed below the main message. */
  subtitle?: string;
};

/**
 * A spinner with loading message for async operations.
 *
 * @example
 * <LoadingState message="Loading..." />
 *
 * @example
 * <LoadingState message="Loading sessions" bold subtitle="Fetching your sessions..." />
 */
export function LoadingState({
  message,
  bold = false,
  dimColor = false,
  subtitle,
}: LoadingStateProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Spinner />
        <Text bold={bold} dimColor={dimColor}>
          {" "}
          {message}
        </Text>
      </Box>
      {subtitle && <Text dimColor>{subtitle}</Text>}
    </Box>
  );
}
