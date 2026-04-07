import { Box, Text } from "@claude-code-kit/ink-renderer";
import type React from "react";
import { useEffect, useRef, useState } from "react";

const DEFAULT_CHARACTERS =
  process.platform === "darwin" ? ["·", "✢", "✳", "✶", "✻", "✽"] : ["·", "✢", "*", "✶", "✻", "✽"];
const FRAMES = [...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()];
const SPINNER_INTERVAL = 80;
const VERB_ROTATE_INTERVAL = 4000;
const ELAPSED_SHOW_AFTER = 1000;
const DEFAULT_COLOR = "#DA7756";

type SpinnerProps = {
  label?: string;
  verb?: string;
  verbs?: string[];
  color?: string;
  showElapsed?: boolean;
};

export function Spinner({
  label,
  verb,
  verbs,
  color = DEFAULT_COLOR,
  showElapsed = true,
}: SpinnerProps): React.ReactNode {
  const [frameIndex, setFrameIndex] = useState(0);
  const [verbIndex, setVerbIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  const allVerbs = verbs ?? (verb ? [verb] : ["Thinking"]);

  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % FRAMES.length);
      setElapsed(Date.now() - startRef.current);
    }, SPINNER_INTERVAL);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (allVerbs.length <= 1) return;
    const id = setInterval(() => {
      setVerbIndex((i) => (i + 1) % allVerbs.length);
    }, VERB_ROTATE_INTERVAL);
    return () => clearInterval(id);
  }, [allVerbs.length]);

  const frame = FRAMES[frameIndex]!;
  const currentVerb = allVerbs[verbIndex % allVerbs.length]!;
  const elapsedSec = Math.floor(elapsed / 1000);
  const showTime = showElapsed && elapsed >= ELAPSED_SHOW_AFTER;

  return (
    <Box>
      <Text color={color}>{frame}</Text>
      <Text> {currentVerb}...</Text>
      {label && <Text> {label}</Text>}
      {showTime && <Text dimColor> ({elapsedSec}s)</Text>}
    </Box>
  );
}
