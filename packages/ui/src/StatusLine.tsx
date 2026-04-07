import { Ansi, Box, type Color, Text } from "@claude-code-kit/ink-renderer";
import React, { useEffect, useState } from "react";

export type StatusLineSegment = {
  content: string;
  color?: Color;
  flex?: boolean;
};

export type StatusLineProps = {
  segments?: StatusLineSegment[];
  text?: string;
  paddingX?: number;
  /** @deprecated Use separator instead. Gap between segments in columns. */
  gap?: number;
  /** Separator string between segments (default: ' · ') */
  separator?: string;
  borderStyle?: "none" | "single" | "round";
  borderColor?: Color;
};

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(0x1b)}\\[`);
function hasAnsi(s: string): boolean {
  return ANSI_ESCAPE.test(s);
}

export function StatusLine({
  segments,
  text,
  paddingX = 1,
  separator = " \u00B7 ",
  borderStyle = "none",
  borderColor,
}: StatusLineProps): React.ReactNode {
  const border = borderStyle === "none" ? undefined : borderStyle;

  return (
    <Box flexDirection="row" paddingX={paddingX} borderStyle={border} borderColor={borderColor}>
      {text !== undefined ? (
        hasAnsi(text) ? (
          <Ansi>{text}</Ansi>
        ) : (
          <Text dimColor>{text}</Text>
        )
      ) : (
        segments?.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Text dimColor>{separator}</Text>}
            <Box flexGrow={seg.flex ? 1 : 0}>
              {hasAnsi(seg.content) ? (
                <Ansi>{seg.content}</Ansi>
              ) : (
                <Text dimColor color={seg.color}>
                  {seg.content}
                </Text>
              )}
            </Box>
          </React.Fragment>
        ))
      )}
    </Box>
  );
}

export function useStatusLine(
  updater: () => StatusLineSegment[] | string,
  deps: unknown[],
  intervalMs?: number,
): StatusLineSegment[] | string {
  const [value, setValue] = useState<StatusLineSegment[] | string>(() => updater());

  useEffect(() => {
    setValue(updater());
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps are intentionally dynamic
  }, deps);

  useEffect(() => {
    if (!intervalMs) return;
    const id = setInterval(() => setValue(updater()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, updater]);

  return value;
}
