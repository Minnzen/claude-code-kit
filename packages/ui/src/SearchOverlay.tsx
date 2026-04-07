import { Box, type Key, Text, useInput } from "@claude-code-kit/ink-renderer";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export type SearchMatch = {
  index: number; // which message/item matched
  offset: number; // character offset within content
  length: number; // match length
};

export type SearchOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => SearchMatch[];
  onNavigate: (match: SearchMatch) => void;
  matchCount?: number;
  currentMatch?: number;
};

export type UseSearchResult = {
  query: string;
  matches: SearchMatch[];
  currentIndex: number;
  next: () => void;
  previous: () => void;
  setQuery: (q: string) => void;
};

type UseSearchOptions = {
  content: string[];
  isActive: boolean;
};

/** Compute matches synchronously — pure function, no React state. */
export function computeMatches(content: string[], query: string): SearchMatch[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const found: SearchMatch[] = [];
  for (let i = 0; i < content.length; i++) {
    const text = content[i] ?? "";
    let offset = 0;
    let pos = text.toLowerCase().indexOf(lower, offset);
    while (pos !== -1) {
      found.push({ index: i, offset: pos, length: query.length });
      offset = pos + 1;
      pos = text.toLowerCase().indexOf(lower, offset);
    }
  }
  return found;
}

export function useSearch({ content, isActive }: UseSearchOptions): UseSearchResult {
  const [query, setQueryState] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      const found = computeMatches(content, q);
      setMatches(found);
      setCurrentIndex(found.length > 0 ? 0 : -1);
    },
    [content],
  );

  const next = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const previous = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  useEffect(() => {
    if (!isActive) {
      setQueryState("");
      setMatches([]);
      setCurrentIndex(0);
    }
  }, [isActive]);

  return { query, matches, currentIndex, next, previous, setQuery };
}

export function SearchOverlay({
  isOpen,
  onClose,
  onSearch,
  onNavigate,
}: SearchOverlayProps): React.ReactNode {
  const [query, setQueryState] = useState("");
  const [cursor, setCursor] = useState(0);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  // Use a ref for matchIndex so that navigate() always reads the latest value
  // without needing to re-create the callback on every index change.
  const matchIndexRef = useRef(0);
  const [matchIndex, setMatchIndexState] = useState(0);

  const setMatchIndex = useCallback((next: number) => {
    matchIndexRef.current = next;
    setMatchIndexState(next);
  }, []);

  // Ensure a fresh state on each open instead of showing stale results
  useEffect(() => {
    if (!isOpen) {
      setQueryState("");
      setCursor(0);
      setMatches([]);
      setMatchIndex(0);
    }
  }, [isOpen, setMatchIndex]);

  const runSearch = useCallback(
    (q: string) => {
      const found = onSearch(q);
      setMatches(found);
      setMatchIndex(0);
      if (found.length > 0) onNavigate(found[0]!);
    },
    [onSearch, onNavigate, setMatchIndex],
  );

  const navigate = useCallback(
    (delta: 1 | -1) => {
      setMatches((currentMatches) => {
        if (currentMatches.length === 0) return currentMatches;
        const next =
          (matchIndexRef.current + delta + currentMatches.length) % currentMatches.length;
        setMatchIndex(next);
        onNavigate(currentMatches[next]!);
        return currentMatches;
      });
    },
    [onNavigate, setMatchIndex],
  );

  useInput(
    (input: string, key: Key) => {
      if (key.escape) {
        onClose();
        return;
      }

      if (key.return) {
        navigate(1);
        return;
      }

      // Ctrl+n / Ctrl+p to navigate without consuming the bare n/N characters
      // that should be typed into the search field.
      if (input === "n" && key.ctrl) {
        navigate(1);
        return;
      }
      if (input === "p" && key.ctrl) {
        navigate(-1);
        return;
      }

      if (key.backspace) {
        if (cursor > 0) {
          const next = query.slice(0, cursor - 1) + query.slice(cursor);
          setQueryState(next);
          setCursor(cursor - 1);
          runSearch(next);
        }
        return;
      }

      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(query.length, c + 1));
        return;
      }
      if (key.ctrl || key.meta) return;

      if (input.length > 0) {
        const next = query.slice(0, cursor) + input + query.slice(cursor);
        setQueryState(next);
        setCursor(cursor + input.length);
        runSearch(next);
      }
    },
    { isActive: isOpen },
  );

  if (!isOpen) return null;

  const total = matches.length;
  const current = total > 0 ? matchIndex + 1 : 0;
  const countLabel = total > 0 ? `${current}/${total} matches` : "no matches";

  const before = query.slice(0, cursor);
  const atCursor = cursor < query.length ? query[cursor]! : " ";
  const after = cursor < query.length ? query.slice(cursor + 1) : "";

  return (
    <Box flexDirection="row" paddingX={1}>
      <Text color="cyan">Search: </Text>
      <Box flexGrow={1}>
        <Text>
          {before}
          <Text inverse>{atCursor}</Text>
          {after}
        </Text>
      </Box>
      <Text dimColor>{countLabel}</Text>
    </Box>
  );
}
