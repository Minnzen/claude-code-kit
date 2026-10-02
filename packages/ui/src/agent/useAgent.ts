import type { Agent, ToolCall } from "@claude-code-kit/agent";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message, MessageContent } from "../MessageList";

// ---------------------------------------------------------------------------
// Permission UI bridge type
// ---------------------------------------------------------------------------

export type PermissionUIRequest = {
  toolName: string;
  description: string;
  details?: string;
  resolve: (decision: "allow" | "always_allow" | "deny") => void;
};

// ---------------------------------------------------------------------------
// Hook options & result
// ---------------------------------------------------------------------------

export type UseAgentOptions = {
  agent: Agent;
  onError?: (error: Error) => void;
};

export type UseAgentResult = {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string | null;
  permissionRequest: PermissionUIRequest | null;
  submit: (input: string) => Promise<void>;
  cancel: () => Promise<void>;
  clearMessages: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _msgId = 0;
function nextId(): string {
  return `msg-${++_msgId}-${Date.now()}`;
}

function toolCallToContent(tc: ToolCall): MessageContent {
  return {
    type: "tool_use",
    toolName: tc.name,
    input: JSON.stringify(tc.input, null, 2),
    status: "running",
  };
}

// ---------------------------------------------------------------------------
// useAgent
// ---------------------------------------------------------------------------

type BridgeHandler = ReturnType<Agent["getPermissionHandler"]>;
const permissionBridges = new WeakMap<
  BridgeHandler,
  { active: boolean; previous: BridgeHandler }
>();
function livePermissionHandler(handler: BridgeHandler): BridgeHandler {
  let current = handler;
  let bridge = permissionBridges.get(current);
  while (bridge && !bridge.active) {
    current = bridge.previous;
    bridge = permissionBridges.get(current);
  }
  return current;
}

export function useAgent({ agent, onError }: UseAgentOptions): UseAgentResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionUIRequest | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const ready = useRef<Promise<void>>(Promise.resolve());
  const running = useRef<Promise<void> | null>(null);
  const cancelled = useRef(false);
  const permissionEpoch = useRef(0);
  const pending = useRef<PermissionUIRequest[]>([]);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const denyPending = useCallback(() => {
    for (const request of [...pending.current]) request.resolve("deny");
  }, []);

  useEffect(() => {
    mounted.current = true;
    const currentGeneration = ++generation.current;
    setMessages([]);
    setIsLoading(false);
    setStreamingContent(null);
    setPermissionRequest(null);
    const sessionApproved = new Set<string>();
    let installed = false;
    const bridge = { active: true, previous: livePermissionHandler(agent.getPermissionHandler()) };
    const handler: ReturnType<Agent["getPermissionHandler"]> = async (request) => {
      const requestEpoch = permissionEpoch.current;
      const policy = await livePermissionHandler(bridge.previous)(request);
      if (
        !mounted.current ||
        generation.current !== currentGeneration ||
        permissionEpoch.current !== requestEpoch
      ) {
        return { decision: "deny", reason: "Permission request is no longer active" };
      }
      if (policy?.decision === "allow") return policy;
      if (policy?.decision !== "deny" || policy.approvalRequired !== true) {
        return policy?.decision === "deny"
          ? policy
          : { decision: "deny", reason: "Invalid permission policy decision" };
      }
      if (sessionApproved.has(request.tool)) return { decision: "allow" };
      return new Promise((resolve) => {
        if (!mounted.current || generation.current !== currentGeneration) {
          resolve({ decision: "deny", reason: "Permission UI is unavailable" });
          return;
        }
        let settled = false;
        const uiRequest: PermissionUIRequest = {
          toolName: request.tool,
          description: `Tool "${request.tool}" wants to execute`,
          details: JSON.stringify(request.input, null, 2),
          resolve(decision) {
            if (settled) return;
            settled = true;
            pending.current = pending.current.filter((item) => item !== uiRequest);
            const active =
              mounted.current &&
              generation.current === currentGeneration &&
              permissionEpoch.current === requestEpoch;
            if (mounted.current && generation.current === currentGeneration) {
              setPermissionRequest(pending.current[0] ?? null);
            }
            if (active && decision === "always_allow") sessionApproved.add(request.tool);
            resolve({
              decision:
                active && (decision === "allow" || decision === "always_allow") ? "allow" : "deny",
            });
          },
        };
        pending.current.push(uiRequest);
        setPermissionRequest(pending.current[0]!);
      });
    };
    permissionBridges.set(handler, bridge);
    ready.current = agent.waitForIdle().then(() => {
      if (mounted.current && generation.current === currentGeneration) {
        bridge.previous = livePermissionHandler(agent.getPermissionHandler());
        agent.setPermissionHandler(handler);
        installed = true;
      }
    });
    return () => {
      bridge.active = false;
      mounted.current = false;
      ++generation.current;
      ++permissionEpoch.current;
      denyPending();
      if (installed && agent.getPermissionHandler() === handler) {
        agent.abort();
        void agent.cancel().then(() => {
          // A later mount may already have installed its own bridge.
          if (agent.getPermissionHandler() === handler)
            agent.setPermissionHandler(livePermissionHandler(bridge.previous));
        });
      }
    };
  }, [agent, denyPending]);

  const cancel = useCallback(async () => {
    cancelled.current = true;
    ++permissionEpoch.current;
    denyPending();
    agent.abort();
    await agent.cancel();
    await running.current;
  }, [agent, denyPending]);

  const clearMessages = useCallback(async () => {
    await cancel();
    agent.clearMessages();
    if (mounted.current) {
      setMessages([]);
      setStreamingContent(null);
      setPermissionRequest(null);
    }
  }, [agent, cancel]);

  const submit = useCallback(
    (input: string): Promise<void> => {
      const trimmed = input.trim();
      if (!trimmed || running.current) return Promise.resolve();
      const currentGeneration = generation.current;
      const isCurrent = () => mounted.current && generation.current === currentGeneration;
      cancelled.current = false;
      ++permissionEpoch.current;
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", content: trimmed, timestamp: Date.now() },
      ]);
      setIsLoading(true);
      setStreamingContent(null);
      const task = (async () => {
        let accumulated = "";
        const toolMessages = new Map<string, string>();
        const flush = () => {
          if (accumulated && isCurrent()) {
            const content = accumulated;
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: "assistant", content, timestamp: Date.now() },
            ]);
          }
          accumulated = "";
          if (isCurrent()) setStreamingContent(null);
        };
        const reportError = (error: Error) => {
          if (!isCurrent() || cancelled.current) return;
          try {
            void Promise.resolve(onErrorRef.current?.(error)).catch(() => {});
          } catch {
            /* Keep an observer failure from leaking the run or its permission bridge. */
          }
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "system", content: [{ type: "error", message: error.message }] },
          ]);
        };
        try {
          await ready.current;
          if (!isCurrent() || cancelled.current) return;
          for await (const event of agent.run(trimmed)) {
            if (!isCurrent()) continue;
            switch (event.type) {
              case "text":
                accumulated += event.text;
                setStreamingContent(accumulated);
                break;
              case "tool_call": {
                flush();
                const id = nextId();
                toolMessages.set(event.toolCall.id, id);
                setMessages((prev) => [
                  ...prev,
                  {
                    id,
                    role: "assistant",
                    content: [toolCallToContent(event.toolCall)],
                    timestamp: Date.now(),
                  },
                ]);
                break;
              }
              case "tool_result": {
                const id = toolMessages.get(event.toolCallId);
                if (id) {
                  setMessages((prev) =>
                    prev.map((message) =>
                      message.id !== id
                        ? message
                        : {
                            ...message,
                            content: (Array.isArray(message.content) ? message.content : []).map(
                              (content) =>
                                content.type !== "tool_use"
                                  ? content
                                  : {
                                      ...content,
                                      result: event.result.content,
                                      status: event.result.isError ? "error" : "success",
                                    },
                            ),
                          },
                    ),
                  );
                  toolMessages.delete(event.toolCallId);
                }
                break;
              }
              case "error":
                reportError(event.error);
                break;
              case "done":
                flush();
                break;
            }
          }
        } catch (error) {
          reportError(error instanceof Error ? error : new Error(String(error)));
        } finally {
          flush();
          denyPending();
          if (isCurrent()) {
            if (toolMessages.size)
              setMessages((prev) =>
                prev.map((message) =>
                  ![...toolMessages.values()].includes(message.id)
                    ? message
                    : {
                        ...message,
                        content: (Array.isArray(message.content) ? message.content : []).map(
                          (content) =>
                            content.type !== "tool_use"
                              ? content
                              : {
                                  ...content,
                                  status: "error",
                                  result: "Run ended before a tool result was received",
                                },
                        ),
                      },
                ),
              );
            setIsLoading(false);
          }
        }
      })();
      running.current = task;
      void task.finally(() => {
        if (running.current === task) running.current = null;
      });
      return task;
    },
    [agent, denyPending],
  );

  return {
    messages,
    isLoading,
    streamingContent,
    permissionRequest,
    submit,
    cancel,
    clearMessages,
  };
}
