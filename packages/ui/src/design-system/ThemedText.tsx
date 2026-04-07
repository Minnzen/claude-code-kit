import type { Color, Styles } from "@claude-code-kit/ink-renderer";
import { Text } from "@claude-code-kit/ink-renderer";
import type { ReactNode } from "react";
import React, { useContext } from "react";
import { getTheme, type Theme, useTheme } from "./ThemeProvider";

/** Colors uncolored ThemedText in the subtree. Precedence: explicit `color` >
 *  this > dimColor. Crosses Box boundaries (Ink's style cascade doesn't). */
export const TextHoverColorContext = React.createContext<keyof Theme | undefined>(undefined);

export type Props = {
  readonly color?: keyof Theme | Color;
  readonly backgroundColor?: keyof Theme;
  readonly dimColor?: boolean;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly inverse?: boolean;
  readonly wrap?: Styles["textWrap"];
  readonly children?: ReactNode;
};

function resolveColor(color: keyof Theme | Color | undefined, theme: Theme): Color | undefined {
  if (!color) return undefined;
  if (
    color.startsWith("rgb(") ||
    color.startsWith("#") ||
    color.startsWith("ansi256(") ||
    color.startsWith("ansi:")
  ) {
    return color as Color;
  }
  return theme[color as keyof Theme] as Color;
}

export default function ThemedText({
  color,
  backgroundColor,
  dimColor = false,
  bold = false,
  italic = false,
  underline = false,
  strikethrough = false,
  inverse = false,
  wrap = "wrap",
  children,
}: Props): React.ReactNode {
  const [themeName] = useTheme();
  const theme = getTheme(themeName);
  const hoverColor = useContext(TextHoverColorContext);

  const resolvedColor =
    !color && hoverColor
      ? resolveColor(hoverColor, theme)
      : dimColor
        ? (theme.inactive as Color)
        : resolveColor(color, theme);
  const resolvedBackgroundColor = backgroundColor ? (theme[backgroundColor] as Color) : undefined;

  return (
    <Text
      color={resolvedColor}
      backgroundColor={resolvedBackgroundColor}
      bold={bold}
      italic={italic}
      underline={underline}
      strikethrough={strikethrough}
      inverse={inverse}
      wrap={wrap}
    >
      {children}
    </Text>
  );
}
