import { Box, Text } from "@claude-code-kit/ink-renderer";
import type React from "react";

const DEFAULT_COLOR = "#DA7756";

export type WelcomeScreenProps = {
  appName: string;
  subtitle?: string;
  version?: string;
  tips?: string[];
  logo?: React.ReactNode;
  model?: string;
  color?: string;
};

export function ClawdLogo({ color = DEFAULT_COLOR }: { color?: string }): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text color={color}>{" ▐▛███▜▌"}</Text>
      <Text color={color}>{"▝▜█████▛▘"}</Text>
      <Text color={color}>{"  ▘▘ ▝▝  "}</Text>
    </Box>
  );
}

export function WelcomeScreen({
  appName,
  subtitle,
  version,
  tips,
  logo,
  model,
  color = DEFAULT_COLOR,
}: WelcomeScreenProps): React.ReactNode {
  const logoNode = logo ?? <ClawdLogo color={color} />;

  return (
    <Box flexDirection="column" gap={1} marginTop={1} marginLeft={1}>
      <Box flexDirection="row" gap={2} alignItems="flex-start">
        {logoNode}
        <Box flexDirection="column" justifyContent="center">
          <Box flexDirection="row" gap={1}>
            <Text bold color={color}>
              {appName}
            </Text>
            {version && <Text dimColor>{`v${version}`}</Text>}
          </Box>
          {subtitle && <Text dimColor>{subtitle}</Text>}
          {model && <Text dimColor>{model}</Text>}
        </Box>
      </Box>

      {tips && tips.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text dimColor>Tips:</Text>
          {tips.map((tip, i) => (
            <Text key={i} dimColor>{`  - ${tip}`}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
