import {
  Box,
  type Key,
  TerminalSizeContext,
  Text,
  useApp,
  useInput,
} from "@claude-code-kit/ink-renderer";
import type React from "react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Divider } from "./Divider";
import { type Message, MessageList } from "./MessageList";
import { type PermissionAction, PermissionRequest } from "./PermissionRequest";
import { PromptInput } from "./PromptInput";
import { computeMatches, SearchOverlay } from "./SearchOverlay";
import { Spinner } from "./Spinner";
import { StatusLine, type StatusLineSegment } from "./StatusLine";
import type { VirtualListHandle } from "./useVirtualScroll";

type REPLCommand = {
  name: string;
  description: string;
  onExecute: (args: string) => void;
};

type PermissionRequestState = {
  toolName: string;
  description: string;
  details?: string;
  preview?: React.ReactNode;
  onDecision: (action: PermissionAction) => void;
};

export type REPLProps = {
  onSubmit: (message: string) => Promise<void> | void;
  onExit?: () => void;
  onCancel?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  historyHeight?: number;

  messages: Message[];
  isLoading?: boolean;
  streamingContent?: string | null;

  welcome?: React.ReactNode;

  permissionRequest?: PermissionRequestState;

  commands?: REPLCommand[];
  model?: string;
  statusSegments?: StatusLineSegment[];

  prefix?: string;
  placeholder?: string;
  history?: string[];

  renderMessage?: (message: Message) => React.ReactNode;
  spinner?: React.ReactNode;
};

export function REPL({
  onSubmit,
  onExit,
  onCancel,
  onError,
  historyHeight,
  messages,
  isLoading = false,
  streamingContent,
  welcome,
  permissionRequest,
  commands = [],
  model,
  statusSegments,
  prefix = "\u276F",
  placeholder,
  history: externalHistory,
  renderMessage,
  spinner,
}: REPLProps): React.ReactNode {
  const { exit } = useApp();
  const [inputValue, setInputValue] = useState("");
  const [internalHistory, setInternalHistory] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchActive = searchOpen && !permissionRequest;
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const historyRef = useRef<VirtualListHandle>(null);
  const terminal = useContext(TerminalSizeContext);
  const viewportHeight =
    historyHeight ??
    Math.max(
      1,
      (terminal?.rows ?? 24) -
        6 -
        (searchActive ? 1 : 0) -
        (permissionRequest ? 8 : 0) -
        (callbackError ? 1 : 0) -
        (isLoading && !streamingContent ? 1 : 0),
    );

  useEffect(() => {
    if (permissionRequest) setSearchOpen(false);
  }, [permissionRequest]);

  const history = externalHistory ?? internalHistory;

  const messageContents = messages.map((m) =>
    typeof m.content === "string"
      ? m.content
      : m.content
          .map((b) =>
            b.type === "tool_use"
              ? `${b.toolName} ${b.input} ${b.result ?? ""}`
              : b.type === "code"
                ? b.code
                : b.type === "diff"
                  ? `${b.filename} ${b.diff}`
                  : b.type === "error"
                    ? `${b.message} ${b.details ?? ""}`
                    : b.text,
          )
          .join(" "),
  );

  const promptCommands = commands.map((c) => ({
    name: c.name,
    description: c.description,
  }));

  const reportCallbackError = useCallback(
    (error: unknown) => {
      const resolvedError = error instanceof Error ? error : new Error(String(error));
      setCallbackError(resolvedError.message);
      try {
        // An error observer must not introduce a second unhandled callback failure.
        void Promise.resolve(onError?.(resolvedError)).catch(() => {});
      } catch {
        // Preserve the original error in the terminal if the observer itself fails.
      }
    },
    [onError],
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (submittingRef.current) return;

      const trimmed = value.trim();
      if (!trimmed) return;
      setCallbackError(null);

      if (trimmed.startsWith("/")) {
        const spaceIndex = trimmed.indexOf(" ");
        const cmdName = spaceIndex >= 0 ? trimmed.slice(1, spaceIndex) : trimmed.slice(1);
        const cmdArgs = spaceIndex >= 0 ? trimmed.slice(spaceIndex + 1).trim() : "";

        const cmd = commands.find((c) => c.name === cmdName);
        if (cmd) {
          setInputValue("");
          try {
            await cmd.onExecute(cmdArgs);
          } catch (error) {
            reportCallbackError(error);
          }
          return;
        }
      }

      submittingRef.current = true;
      setInputValue("");
      if (!externalHistory) {
        setInternalHistory((prev) => [trimmed, ...prev]);
      }

      try {
        await onSubmit(trimmed);
      } catch (error) {
        reportCallbackError(error);
      } finally {
        submittingRef.current = false;
      }
    },
    [commands, onSubmit, externalHistory, reportCallbackError],
  );

  useInput(
    (_input: string, key: Key, event) => {
      if (key.ctrl && _input === "c" && (isLoading || permissionRequest) && onCancel) {
        event.stopImmediatePropagation();
        setCallbackError(null);
        try {
          void Promise.resolve(onCancel()).catch(reportCallbackError);
        } catch (error) {
          reportCallbackError(error);
        }
        return;
      }
      if (permissionRequest) {
        if (key.ctrl && _input === "f") event.stopImmediatePropagation();
        return;
      }
      if (searchActive) return;
      if (key.pageUp || key.pageDown || key.wheelUp || key.wheelDown) {
        historyRef.current?.scrollBy(
          key.pageUp ? -viewportHeight : key.pageDown ? viewportHeight : key.wheelUp ? -3 : 3,
        );
        event.stopImmediatePropagation();
        return;
      }
      if (key.ctrl && key.end) {
        historyRef.current?.scrollToEnd();
        event.stopImmediatePropagation();
        return;
      }
      if (key.ctrl && _input === "d") {
        if (onExit) {
          onExit();
        } else {
          exit();
        }
      }
      if (key.ctrl && _input === "f") {
        setSearchOpen(true);
      }
    },
    // Deactivate when search overlay is open so only SearchOverlay handles input.
    { captureCtrlC: !!onCancel },
  );

  const resolvedSegments = statusSegments ?? buildDefaultSegments(model);
  const showWelcome = welcome && messages.length === 0 && !isLoading;
  const showPermission = !!permissionRequest;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {showWelcome && <Box marginBottom={1}>{welcome}</Box>}

        <MessageList
          ref={historyRef}
          viewportHeight={viewportHeight}
          messages={messages}
          streamingContent={streamingContent}
          renderMessage={renderMessage}
        />

        {isLoading && !streamingContent && (
          <Box marginTop={messages.length > 0 ? 1 : 0}>{spinner ?? <Spinner />}</Box>
        )}
      </Box>

      {searchActive && (
        <SearchOverlay
          isOpen={searchActive}
          onClose={() => setSearchOpen(false)}
          onSearch={(q) => computeMatches(messageContents, q)}
          onNavigate={(match) => historyRef.current?.scrollTo(match.index)}
        />
      )}

      <Divider />

      {callbackError && <Text color="red">Error: {callbackError}</Text>}

      {showPermission ? (
        <PermissionRequest
          toolName={permissionRequest.toolName}
          description={permissionRequest.description}
          details={permissionRequest.details}
          preview={permissionRequest.preview}
          onDecision={permissionRequest.onDecision}
        />
      ) : (
        <PromptInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          prefix={prefix}
          placeholder={placeholder}
          disabled={isLoading || searchActive}
          commands={promptCommands}
          history={history}
        />
      )}

      <Divider />

      {resolvedSegments.length > 0 && <StatusLine segments={resolvedSegments} />}
    </Box>
  );
}

function buildDefaultSegments(model?: string): StatusLineSegment[] {
  if (!model) return [];
  return [{ content: model, color: "green" }];
}
