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
  private abortController: AbortController | null = null;
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
    this.abortController = new AbortController();

    // Connect to MCP servers on first run (lazy initialization, race-safe)
    if (this.mcpConfig && !this.mcpInitialized) {
      this.mcpInitPromise ??= this.initializeMCP();
      await this.mcpInitPromise;
    }

    // Step 1: Add user message(s)
    const messages = this.session.getMessages();
    if (typeof input === "string") {
      messages.push({ role: "user", content: input });
    } else {
      messages.push(...input);
    }
    this.session.setMessages(messages);

    let turns = 0;

    while (turns < this.maxTurns) {
      turns++;

      // Step 2: Check compaction. Wrap in try/catch so a strategy that
      // throws (e.g. SummarizationCompaction whose provider call fails) does
      // NOT escape Agent.run() as a raw rejection — the contract is that
      // run() always yields error/done events.
      try {
        const currentMessages = await this.contextManager.maybeCompact(this.session.getMessages());
        this.session.setMessages(currentMessages);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        yield {
          type: "error",
          error: new Error(`Compaction failed: ${err.message}`),
        };
        yield { type: "done", messages: this.session.getMessages() };
        return;
      }

      // Step 3: Call provider
      const providerTools = this.toolRegistry.toProviderFormat();

      let accumulatedText = "";
      const accumulatedToolCalls: ToolCall[] = [];
      const toolParseErrors = new Map<string, string>();
      let currentToolId: string | undefined;
      let currentToolName: string | undefined;
      let currentToolArgs = "";

      try {
        const stream = this.provider.chat({
          model: this.model,
          messages: this.session.getMessages(),
          tools: providerTools.length > 0 ? providerTools : undefined,
          systemPrompt: this.systemPrompt,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          signal: this.abortController.signal,
        });

        // Step 4: Stream chunks
        for await (const chunk of stream) {
          switch (chunk.type) {
            case "text":
              if (chunk.text) {
                accumulatedText += chunk.text;
                yield { type: "text", text: chunk.text };
              }
              break;

            case "tool_use_start":
              if (chunk.toolCall) {
                currentToolId = chunk.toolCall.id;
                currentToolName = chunk.toolCall.name;
                currentToolArgs = "";
              }
              break;

            case "tool_use_delta":
              if (chunk.text) {
                currentToolArgs += chunk.text;
              }
              break;

            case "tool_use_end": {
              if (currentToolId && currentToolName) {
                let input: Record<string, unknown>;
                try {
                  input = currentToolArgs ? JSON.parse(currentToolArgs) : {};
                } catch (err) {
                  input = {};
                  toolParseErrors.set(
                    currentToolId,
                    `Failed to parse tool input JSON: ${err instanceof Error ? err.message : String(err)}. Raw input: ${currentToolArgs}`,
                  );
                }

                const toolCall: ToolCall = {
                  id: currentToolId,
                  name: currentToolName,
                  input,
                };
                accumulatedToolCalls.push(toolCall);
                yield { type: "tool_call", toolCall };
              }
              currentToolId = undefined;
              currentToolName = undefined;
              currentToolArgs = "";
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

            case "done":
              // Provider signals end of response
              break;
          }
        }
      } catch (error) {
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
          const before = this.session.getMessages();
          const beforeTokens = await this.contextManager.countTokens(before);

          let compacted: Message[];
          try {
            compacted = await this.contextManager.forceCompact(before);
          } catch (compactErr) {
            const err = compactErr instanceof Error ? compactErr : new Error(String(compactErr));
            yield {
              type: "error",
              error: new Error(`Forced compaction failed after context-too-long: ${err.message}`),
            };
            yield { type: "done", messages: this.session.getMessages() };
            return;
          }

          const afterTokens = await this.contextManager.countTokens(compacted);
          if (afterTokens >= beforeTokens) {
            yield {
              type: "error",
              error: new Error(
                `Context too long and compaction made no progress (${beforeTokens} -> ${afterTokens} tokens). Cannot continue.`,
              ),
            };
            yield { type: "done", messages: this.session.getMessages() };
            return;
          }

          this.session.setMessages(compacted);
          continue; // Retry the loop with compacted messages
        }

        const err = error instanceof Error ? error : new Error(String(error));
        yield { type: "error", error: err };
        yield { type: "done", messages: this.session.getMessages() };
        return;
      }

      // Add assistant message to history
      const assistantMessage: AssistantMessage = {
        role: "assistant",
        content: accumulatedText,
        ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
      };

      const msgs = this.session.getMessages();
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
            abortSignal: this.abortController?.signal ?? AbortSignal.timeout(120_000),
          },
          parseErrors: toolParseErrors,
          maxConcurrent: this.maxConcurrentTools,
        });

        // Yield tool results and add to history
        const currentMsgs = this.session.getMessages();
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

        // Loop back for next turn
        continue;
      }

      // Step 6: No tool calls — end turn
      yield { type: "done", messages: this.session.getMessages() };
      return;
    }

    // Exceeded max turns
    yield {
      type: "error",
      error: new Error(`Agent exceeded maximum turns (${this.maxTurns})`),
    };
    yield { type: "done", messages: this.session.getMessages() };
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
    this.abortController?.abort();
  }

  /** Replace the provider (e.g. to switch models mid-conversation). */
  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /** Get the full message history. */
  getMessages(): Message[] {
    return this.session.getMessages();
  }

  /** Clear the message history. */
  clearMessages(): void {
    this.session.clear();
  }

  /** Add a tool to the registry. */
  addTool(tool: ToolDefinition): void {
    this.toolRegistry.register(tool);
  }

  /** Remove a tool from the registry. */
  removeTool(name: string): boolean {
    return this.toolRegistry.unregister(name);
  }

  /** Replace the permission handler at runtime. */
  setPermissionHandler(handler: PermissionHandler): void {
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
    // Collect tool names BEFORE disconnecting (disconnect clears client._tools)
    const toolNames: string[] = [];
    for (const client of this.mcpClients) {
      for (const tool of client.tools) {
        toolNames.push(tool.name);
      }
    }

    // Unregister tools from the registry first
    for (const name of toolNames) {
      this.toolRegistry.unregister(name);
    }

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
  private async initializeMCP(): Promise<void> {
    if (!this.mcpConfig?.servers.length) {
      this.mcpInitialized = true;
      return;
    }

    const results = await Promise.allSettled(
      this.mcpConfig.servers.map(async (serverConfig) => {
        const client = new MCPClient(serverConfig);
        await client.connect();
        return client;
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const client = result.value;
        this.mcpClients.push(client);

        // Register all discovered tools from this server
        for (const tool of client.tools) {
          if (!this.toolRegistry.has(tool.name)) {
            this.toolRegistry.register(tool);
          }
        }
      }
      // Rejected servers are silently skipped — the agent can still
      // function with its built-in tools + any servers that did connect.
    }

    this.mcpInitialized = true;
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
