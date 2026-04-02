import { ContextManager } from "./context-manager.js";
import { allowAll } from "./permission.js";
import { InMemorySession } from "./session/memory.js";
import { ToolRegistry } from "./tool-registry.js";
import type {
  AgentConfig,
  AgentEvent,
  AssistantMessage,
  LLMProvider,
  Message,
  PermissionHandler,
  Session,
  ToolCall,
  ToolContext,
  ToolDefinition,
  ToolResultMessage,
} from "./types.js";

const DEFAULT_MAX_TURNS = 50;

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
  private abortController: AbortController | null = null;

  constructor(config: AgentConfig) {
    this.provider = config.provider;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
    this.maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.session = config.session ?? new InMemorySession();
    this.permissionHandler = config.permissionHandler ?? allowAll;
    this.workingDirectory = config.workingDirectory ?? process.cwd();

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

      // Step 2: Check compaction
      const currentMessages = await this.contextManager.maybeCompact(this.session.getMessages());
      this.session.setMessages(currentMessages);

      // Step 3: Call provider
      const providerTools = this.toolRegistry.toProviderFormat();

      let accumulatedText = "";
      const accumulatedToolCalls: ToolCall[] = [];
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
                } catch {
                  input = {};
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
        // Handle context too long errors with reactive compaction
        if (isContextTooLongError(error)) {
          const compacted = this.contextManager.forceCompact(this.session.getMessages());
          this.session.setMessages(compacted);
          continue; // Retry the loop
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

      // Step 5: If tool calls, execute them and loop
      if (accumulatedToolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(accumulatedToolCalls);

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

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResultMessage[]> {
    const results: ToolResultMessage[] = [];

    for (const tc of toolCalls) {
      const toolDef = this.toolRegistry.get(tc.name);

      // Check permission
      const permissionResult = await this.permissionHandler({
        tool: tc.name,
        input: tc.input,
        isReadOnly: toolDef?.isReadOnly,
      });

      if (permissionResult.decision === "deny") {
        results.push({
          role: "tool",
          toolCallId: tc.id,
          content: `Permission denied for tool "${tc.name}"${permissionResult.reason ? `: ${permissionResult.reason}` : ""}`,
          isError: true,
        });
        continue;
      }

      // Execute
      const context: ToolContext = {
        workingDirectory: this.workingDirectory,
        abortSignal: this.abortController?.signal ?? AbortSignal.timeout(120_000),
      };

      const result = await this.toolRegistry.execute(tc.name, tc.input, context);

      results.push({
        role: "tool",
        toolCallId: tc.id,
        content: result.content,
        isError: result.isError,
      });
    }

    return results;
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
