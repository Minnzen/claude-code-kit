import { Box } from "@claude-code-kit/ink-renderer";
import type React from "react";
import { Divider } from "../Divider";
import type { Theme } from "./ThemeProvider";

type PaneProps = {
  children: React.ReactNode;
  color?: keyof Theme;
};

/**
 * A pane -- a region of the terminal bounded by a colored top line with
 * horizontal padding. Used by slash-command screens.
 */
export function Pane({ children, color }: PaneProps): React.ReactNode {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Divider color={color} />
      <Box flexDirection="column" paddingX={2}>
        {children}
      </Box>
    </Box>
  );
}
