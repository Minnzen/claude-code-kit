import { type Color, Text } from "@claude-code-kit/ink-renderer";
import type React from "react";

type Props = {
  ratio: number;
  width: number;
  fillColor?: Color;
  emptyColor?: Color;
};

const BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

export function ProgressBar({
  ratio: inputRatio,
  width,
  fillColor,
  emptyColor,
}: Props): React.ReactNode {
  const ratio = Math.min(1, Math.max(0, inputRatio));
  const whole = Math.floor(ratio * width);
  const segments = [BLOCKS[BLOCKS.length - 1]!.repeat(whole)];

  if (whole < width) {
    const remainder = ratio * width - whole;
    const middle = Math.floor(remainder * BLOCKS.length);
    segments.push(BLOCKS[middle]!);
    const empty = width - whole - 1;
    if (empty > 0) {
      segments.push(BLOCKS[0]!.repeat(empty));
    }
  }

  return (
    <Text color={fillColor} backgroundColor={emptyColor}>
      {segments.join("")}
    </Text>
  );
}
