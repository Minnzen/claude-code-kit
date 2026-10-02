import { ContextManager } from "./context-manager.js";
import { MCPClient } from "./mcp-client.js";
import { executeToolCalls } from "./parallel-tools.js";
import { allowReadOnly } from "./permission.js";
import { InMemorySession } from "./session/memory.js";
import { ToolRegistry } from "./tool-registry.js";
import type {
  AgentConfig,
  AgentEvent,
  AssistantMessage,
  LLMProvider,
  MCPConfig,
  Message,
  PermissionHandler,
  Session,
  ToolCall,
  ToolDefinition,
} from "./types.js";

const DEFAULT_MAX_TURNS = 50;
const DEFAULT_MAX_CONCURRENT_TOOLS = 5;

/**
 * Headless agent that runs an LLM query loop with tool execution.
 *
 * Stateful — maintains message history across `run()` calls.
 * Platform-agnostic — works in Node.js scripts, CLI apps, web servers, anywhere.
 */
export class Agent {
  private provider: LLMProvider;
  private model: string;
  private systemPrompt?: string;
  private maxTokens?: number;
  private temperature?: number;
  private maxTurns: number;
  private session: Session;
  private toolRegistry: ToolRegistry;
  private contextManager: ContextManager;
  private permissionHandler: PermissionHandler;
  private workingDirectory: string;
  private maxConcurrentTools: number;
  private activeRun?: { controller: AbortController; idle: Promise<void> };
  private mcpErrors: Error[] = [];
  private mcpOwnedTools = new Map<MCPClient, Map<string, ToolDefinition>>();
  private mcpUnsubscribe = new Map<MCPClient, Array<() => void>>();
  private mcpClients: MCPClient[] = [];
  private mcpConfig?: MCPConfig;
  private mcpInitialized = false;
  private mcpInitPromise?: Promise<void>;

  constructor(config: AgentConfig) {
    this.provider = config.provider;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
    this.maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.maxConcurrentTools = config.maxConcurrentTools ?? DEFAULT_MAX_CONCURRENT_TOOLS;
    this.session = config.session ?? new InMemorySession();
    this.permissionHandler = config.permissionHandler ?? allowReadOnly;
    this.workingDirectory = config.workingDirectory ?? process.cwd();
    this.mcpConfig = config.mcp;

    this.toolRegistry = new ToolRegistry();
    if (config.tools) {
      for (const tool of config.tools) {
        this.toolRegistry.register(tool);
      }
    }

    this.contextManager = new ContextManager({
      contextLimit: config.contextLimit,
      compactionStrategy: config.compactionStrategy,
      provider: config.provider,
    });
  }

  /**
   * Run the agent loop. Yields events as the agent processes the input.
   *
   * The loop:
   * 1. Add user message(s) to conversation
   * 2. Check compaction
   * 3. Call provider.chat() with messages + tools
   * 4. Stream chunks, accumulate text + tool calls
   * 5. If tool_use: check permission -> execute -> add results -> loop to step 2
   * 6. If end_turn: yield done event with full message history
   */
  async *run(input: string | Message[]): AsyncGenerator<AgentEvent> {
    if (this.activeRun) {
      yield { type: "error", error: new Error("Agent is already running") };
      yield { type: "done", messages: this.getMessages() };
      return;
    }
    const controller = new AbortController();
    let resolveIdle!: () => void;
    const idle = new Promise<void>((resolve) => {
      resolveIdle = resolve;
    });
    const activeRun = { controller, idle };
    this.activeRun = activeRun;
    try {
      yield* this.runLoop(input, controller.signal);
    } catch (error) {
      yield { type: "error", error: error instanceof Error ? error : new Error(String(error)) };
      yield { type: "done", messages: this.getMessages() };
    } finally {
      if (this.activeRun === activeRun) this.activeRun = undefined;
      resolveIdle();
    }
  }

  private async *runLoop(
    input: string | Message[],
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    // Connect to MCP servers on first run (lazy initialization, race-safe)
    if (this.mcpConfig && !this.mcpInitialized) {
      this.mcpInitPromise ??= this.initializeMCP(signal).finally(() => {
        this.mcpInitPromise = undefined;
      });
      await withAbort(this.mcpInitPromise, signal);
      signal.throwIfAborted();
    }

    for (const error of this.mcpErrors.splice(0)) yield { type: "error", error };
    signal.throwIfAborted();

    // Step 1: Add user message(s)
    const messages = this.getMessages();
    if (typeof input === "string") {
      messages.push({ role: "user", content: input });
    } else {
      messages.push(...structuredClone(input));
    }
    this.session.setMessages(messages);

    let turns = 0;

    while (turns < this.maxTurns) {
      signal.throwIfAborted();
      for (const error of this.mcpErrors.splice(0)) yield { type: "error", error };
      turns++;

      // Step 2: Check compaction. Wrap in try/catch so a strategy that
      // throws (e.g. SummarizationCompaction whose provider call fails) does
      // NOT escape Agent.run() as a raw rejection — the contract is that
      // run() always yields error/done events.
      try {
        const currentMessages = await withAbort(
          this.contextManager.maybeCompact(this.getMessages(), signal),
          signal,
        );
        signal.throwIfAborted();
        this.session.setMessages(currentMessages);
      } catch (error) {
        signal.throwIfAborted();
        const err = error instanceof Error ? error : new Error(String(error));
        yield {
          type: "error",
          error: new Error(`Compaction failed: ${err.message}`),
        };
        yield { type: "done", messages: this.getMessages() };
        return;
      }

      // Step 3: Call provider
      const providerTools = this.toolRegistry.toProviderFormat();

      let accumulatedText = "";
      const accumulatedToolCalls: ToolCall[] = [];
      const toolParseErrors = new Map<string, string>();
      const streamedTools = new Map<string, { name: string; args: string; ended: boolean }>();
      let legacyToolId: string | undefined;

      try {
        const stream = this.provider.chat({
          model: this.model,
          messages: this.getMessages(),
          tools: providerTools.length > 0 ? providerTools : undefined,
          systemPrompt: this.systemPrompt,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          signal,
        });

        // Step 4: Stream chunks
        for await (const chunk of streamWithAbort(stream, signal)) {
          signal.throwIfAborted();
          switch (chunk.type) {
            case "text":
              if (chunk.text) {
                accumulatedText += chunk.text;
                yield { type: "text", text: chunk.text };
              }
              break;

            case "tool_use_start": {
              const { id, name } = chunk.toolCall;
              if (!id || !name || streamedTools.has(id)) {
                throw new Error(`Invalid or duplicate streamed tool call: ${id}`);
              }
              streamedTools.set(id, { name, args: "", ended: false });
              legacyToolId = id;
              break;
            }

            case "tool_use_delta": {
              const id = resolveStreamedToolId(chunk.id, legacyToolId, streamedTools);
              streamedTools.get(id)!.args += chunk.text;
              break;
            }

            case "tool_use_end": {
              const id = resolveStreamedToolId(chunk.id, legacyToolId, streamedTools);
              streamedTools.get(id)!.ended = true;
              if (legacyToolId === id) legacyToolId = undefined;
              break;
            }

            case "thinking":
              if (chunk.text) {
                yield { type: "thinking", text: chunk.text };
              }
              break;

            case "usage":
              if (chunk.usage) {
                yield {
                  type: "usage",
                  inputTokens: chunk.usage.inputTokens,
                  outputTokens: chunk.usage.outputTokens,
                };
              }
              break;

            case "error":
              throw chunk.error;

            case "done":
              break;
          }
        }
        signal.throwIfAborted();
        for (const [id, entry] of streamedTools) {
          if (!entry.ended) throw new Error(`Incomplete streamed tool call: ${id}`);
          let toolInput: Record<string, unknown> = {};
          try {
            const parsed: unknown = entry.args ? JSON.parse(entry.args) : {};
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error("Tool input must be a JSON object");
            }
            toolInput = parsed as Record<string, unknown>;
          } catch (error) {
            toolParseErrors.set(
              id,
              `Failed to parse tool input JSON: ${error instanceof Error ? error.message : String(error)}. Raw input: ${entry.args}`,
            );
          }
          const toolCall = { id, name: entry.name, input: toolInput };
          accumulatedToolCalls.push(toolCall);
          yield { type: "tool_call", toolCall: structuredClone(toolCall) };
        }
      } catch (error) {
        signal.throwIfAborted();
        // Handle context too long errors with reactive compaction.
        //
        // Built-in compaction strategies are best-effort: they do NOT honor
        // the `maxTokens` argument as a hard guarantee (e.g.
        // SummarizationCompaction always keeps `keepRecentN` messages
        // verbatim regardless of size). So a naive `forceCompact + continue`
        // loop can wedge the agent forever if compaction makes no progress.
        // We guard against that by:
        //   - catching any error thrown by forceCompact() itself, and
        //   - measuring before/after token counts and bailing if compaction
        //     did not strictly reduce the count.
        if (isContextTooLongError(error)) {
          const before = this.getMessages();
          const beforeTokens = await withAbort(this.contextManager.countTokens(before), signal);

          let compacted: Message[];
          try {
            compacted = await withAbort(this.contextManager.forceCompact(before, signal), signal);
          } catch (compactErr) {
            signal.throwIfAborted();
            const err = compactErr instanceof Error ? compactErr : new Error(String(compactErr));
            yield {
              type: "error",
              error: new Error(`Forced compaction failed after context-too-long: ${err.message}`),
            };
            yield { type: "done", messages: this.getMessages() };
            return;
          }

          const afterTokens = await withAbort(this.contextManager.countTokens(compacted), signal);
          if (afterTokens >= beforeTokens) {
            yield {
              type: "error",
              error: new Error(
                `Context too long and compaction made no progress (${beforeTokens} -> ${afterTokens} tokens). Cannot continue.`,
              ),
            };
            yield { type: "done", messages: this.getMessages() };
            return;
          }

          signal.throwIfAborted();
          this.session.setMessages(compacted);
          continue; // Retry the loop with compacted messages
        }

        const err = error instanceof Error ? error : new Error(String(error));
        yield { type: "error", error: err };
        yield { type: "done", messages: this.getMessages() };
        return;
      }

      signal.throwIfAborted();

      // Add assistant message to history
      const assistantMessage: AssistantMessage = {
        role: "assistant",
        content: accumulatedText,
        ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
      };

      const msgs = this.getMessages();
      msgs.push(assistantMessage);
      this.session.setMessages(msgs);

      // Step 5: If tool calls, execute them (readOnly in parallel, others sequentially)
      if (accumulatedToolCalls.length > 0) {
        const toolResults = await executeToolCalls({
          toolCalls: accumulatedToolCalls,
          toolRegistry: this.toolRegistry,
          permissionHandler: this.permissionHandler,
          context: {
            workingDirectory: this.workingDirectory,
            abortSignal: signal,
          },
          parseErrors: toolParseErrors,
          maxConcurrent: this.maxConcurrentTools,
        });

        // Yield tool results and add to history
        const currentMsgs = this.getMessages();
        for (const result of toolResults) {
          yield {
            type: "tool_result",
            toolCallId: result.toolCallId,
            result: {
              content: typeof result.content === "string" ? result.content : "",
              isError: result.isError,
            },
          };
          currentMsgs.push(result);
        }
        this.session.setMessages(currentMsgs);

        signal.throwIfAborted();
        // Loop back for next turn
        continue;
      }

      // Step 6: No tool calls — end turn
      yield { type: "done", messages: this.getMessages() };
      return;
    }

    // Exceeded max turns
    yield {
      type: "error",
      error: new Error(`Agent exceeded maximum turns (${this.maxTurns})`),
    };
    yield { type: "done", messages: this.getMessages() };
  }

  /**
   * Simple API that wraps run() — sends a message and returns the final text response.
   */
  async chat(input: string): Promise<string> {
    let result = "";
    for await (const event of this.run(input)) {
      if (event.type === "text") {
        result += event.text;
      }
      if (event.type === "error") {
        throw event.error;
      }
    }
    return result;
  }

  /** Abort the current run. */
  abort(): void {
    this.activeRun?.controller.abort();
  }

  /** Abort and wait until the consumed run stops mutating agent state. */
  async cancel(): Promise<void> {
    this.abort();
    await this.waitForIdle();
  }

  /** Wait for the active iterator to finish; callers must keep consuming or close it. */
  async waitForIdle(): Promise<void> {
    await this.activeRun?.idle;
  }

  private assertIdle(): void {
    if (this.activeRun) throw new Error("Agent is running; await cancel() before changing state");
  }

  /** Replace the provider (e.g. to switch models mid-conversation). */
  setProvider(provider: LLMProvider): void {
    this.assertIdle();
    this.provider = provider;
    this.contextManager.setProvider(provider);
  }

  /** Get the full message history. */
  getMessages(): Message[] {
    return structuredClone(this.session.getMessages());
  }

  /** Clear the message history. */
  clearMessages(): void {
    this.assertIdle();
    this.session.clear();
  }

  /** Add a tool to the registry. */
  addTool(tool: ToolDefinition): void {
    this.assertIdle();
    this.toolRegistry.register(tool);
  }

  /** Remove a tool from the registry. */
  removeTool(name: string): boolean {
    this.assertIdle();
    return this.toolRegistry.unregister(name);
  }

  /** Get the current permission policy for temporary UI overrides. */
  getPermissionHandler(): PermissionHandler {
    return this.permissionHandler;
  }

  /** Replace the permission handler at runtime. */
  setPermissionHandler(handler: PermissionHandler): void {
    this.assertIdle();
    this.permissionHandler = handler;
  }

  /** Get the list of active MCP clients. */
  getMCPClients(): MCPClient[] {
    return [...this.mcpClients];
  }

  /**
   * Disconnect all MCP servers and clean up resources.
   * Call this when the agent is no longer needed.
   */
  async disconnectMCP(): Promise<void> {
    this.assertIdle();
    for (const callbacks of this.mcpUnsubscribe.values()) {
      for (const unsubscribe of callbacks) unsubscribe();
    }
    this.mcpUnsubscribe.clear();
    for (const owned of this.mcpOwnedTools.values()) {
      for (const [name, definition] of owned) {
        if (this.toolRegistry.get(name) === definition) this.toolRegistry.unregister(name);
      }
    }
    this.mcpOwnedTools.clear();

    // Then disconnect all clients
    const errors: Error[] = [];
    for (const client of this.mcpClients) {
      try {
        await client.disconnect();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.mcpClients = [];
    this.mcpInitialized = false;
    this.mcpInitPromise = undefined;

    if (errors.length > 0) {
      throw new AggregateError(errors, "Some MCP servers failed to disconnect");
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Connect to configured MCP servers and register their tools.
   * Servers that fail to connect are skipped with a warning (non-fatal).
   */
  private async initializeMCP(signal: AbortSignal): Promise<void> {
    if (!this.mcpConfig?.servers.length) {
      this.mcpInitialized = true;
      return;
    }

    const results = await Promise.allSettled(
      this.mcpConfig.servers.map(async (serverConfig) => {
        const client = new MCPClient(serverConfig);
        await client.connect(signal);
        return client;
      }),
    );

    if (signal.aborted) {
      for (const result of results) {
        if (result.status === "fulfilled") void result.value.disconnect().catch(() => {});
      }
      signal.throwIfAborted();
    }
    for (let index = 0; index < results.length; index++) {
      const result = results[index]!;
      if (result.status === "fulfilled") {
        const client = result.value;
        this.mcpClients.push(client);
        this.reconcileMCPTools(client, client.tools);
        this.mcpUnsubscribe.set(client, [
          client.onToolsChanged((tools) => this.reconcileMCPTools(client, tools)),
          client.onError((error) => this.reportMCPError(error)),
        ]);
      } else {
        const error =
          result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        this.mcpErrors.push(
          new Error(`MCP server "${this.mcpConfig.servers[index]!.name}" failed: ${error.message}`),
        );
      }
    }

    this.mcpInitialized = true;
  }

  private reportMCPError(error: Error): void {
    if (this.activeRun) this.activeRun.controller.abort(error);
    else this.mcpErrors.push(error);
  }

  private reconcileMCPTools(client: MCPClient, tools: ToolDefinition[]): void {
    const previous = this.mcpOwnedTools.get(client) ?? new Map<string, ToolDefinition>();
    for (const tool of tools) {
      const existing = this.toolRegistry.get(tool.name);
      if (existing && existing !== previous.get(tool.name)) {
        this.reportMCPError(new Error(`MCP tool "${tool.name}" conflicts with an existing tool`));
        return;
      }
    }
    for (const [name, definition] of previous) {
      if (this.toolRegistry.get(name) === definition) this.toolRegistry.unregister(name);
    }
    for (const tool of tools) this.toolRegistry.register(tool);
    this.mcpOwnedTools.set(client, new Map(tools.map((tool) => [tool.name, tool])));
  }
}

function isContextTooLongError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("context_length_exceeded") ||
    msg.includes("maximum context length") ||
    msg.includes("too many tokens") ||
    msg.includes("request too large")
  );
}

function resolveStreamedToolId(
  id: string | undefined,
  legacyId: string | undefined,
  tools: Map<string, { ended: boolean }>,
): string {
  if (!id && Array.from(tools.values()).filter((tool) => !tool.ended).length > 1) {
    throw new Error("Interleaved tool stream requires tool call IDs");
  }
  const resolved = id ?? legacyId;
  if (!resolved || !tools.has(resolved) || tools.get(resolved)!.ended) {
    throw new Error(`Tool delta/end references an unknown or ended tool: ${resolved}`);
  }
  return resolved;
}

async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    signal.throwIfAborted();
  }
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Operation aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function* streamWithAbort<T>(
  stream: AsyncGenerator<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  try {
    while (true) {
      const next = await withAbort(stream.next(), signal);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    // An abort-ignoring iterator can remain stuck in next(); never wait on its cleanup.
    void stream.return(undefined as never).catch(() => {});
  }
}
