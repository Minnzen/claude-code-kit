import type {
  AssistantMessage,
  ChatOptions,
  LLMProvider,
  Message,
  ProviderTool,
  StreamChunk,
  ToolResultMessage,
  UserMessage,
} from "../types.js";

// Dynamically imported types — avoids hard dependency
type AnthropicSDK = typeof import("@anthropic-ai/sdk");

interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Provider adapter for the Anthropic Messages API.
 *
 * Requires `@anthropic-ai/sdk` as an optional peer dependency.
 * The SDK is dynamically imported at first use.
 */
export class AnthropicProvider implements LLMProvider {
  private clientPromise: Promise<InstanceType<Awaited<ReturnType<typeof loadSDK>>>>;

  constructor(options: AnthropicProviderOptions = {}) {
    this.clientPromise = loadSDK().then(
      (SDK) =>
        new SDK({
          apiKey: options.apiKey,
          ...(options.baseURL ? { baseURL: options.baseURL } : {}),
        }),
    );
  }

  async *chat(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const client = await this.clientPromise;

    // Separate system prompt from messages
    const {
      systemPrompt,
      messages: rawMessages,
      tools,
      model,
      maxTokens,
      temperature,
      signal,
    } = options;

    // Safe cast: system messages are filtered out, so only User/Assistant/ToolResult remain
    const anthropicMessages = rawMessages
      .filter((m) => m.role !== "system")
      .map((m) => toAnthropicMessage(m as UserMessage | AssistantMessage | ToolResultMessage));

    const anthropicTools = tools?.map(toAnthropicTool);

    // SDK boundary: we construct correct shapes in toAnthropicMessage/toAnthropicTool,
    // but the Anthropic SDK types are too strict for our generic Record-based
    // translation layer. Using Record<string, unknown> for the params object.
    const params: Record<string, unknown> = {
      model,
      max_tokens: maxTokens ?? 4096,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
      ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
    };
    // biome-ignore lint/suspicious/noExplicitAny: Anthropic SDK .stream() expects specific param types that cannot be expressed with our generic translation layer
    const stream = client.messages.stream(params as any, { signal });

    const toolBlocks = new Map<
      number,
      { id: string; input: Record<string, unknown>; hasDelta: boolean }
    >();
    let inputTokens = 0;
    let outputTokens = 0;
    let stopped = false;
    let stopReason: string | undefined;

    for await (const event of stream) {
      signal?.throwIfAborted();
      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "text" && block.text) yield { type: "text", text: block.text };
          if (block.type === "tool_use") {
            toolBlocks.set(event.index, {
              id: block.id,
              input: block.input as Record<string, unknown>,
              hasDelta: false,
            });
            yield { type: "tool_use_start", toolCall: { id: block.id, name: block.name } };
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "text_delta") yield { type: "text", text: delta.text };
          else if (delta.type === "input_json_delta") {
            const tool = toolBlocks.get(event.index);
            if (!tool) throw new Error("Tool delta references an unknown content block");
            tool.hasDelta = true;
            yield { type: "tool_use_delta", id: tool.id, text: delta.partial_json };
          } else if (delta.type === "thinking_delta") {
            yield { type: "thinking", text: delta.thinking };
          }
          break;
        }
        case "content_block_stop": {
          const tool = toolBlocks.get(event.index);
          if (tool) {
            if (!tool.hasDelta && Object.keys(tool.input ?? {}).length > 0) {
              yield { type: "tool_use_delta", id: tool.id, text: JSON.stringify(tool.input) };
            }
            yield { type: "tool_use_end", id: tool.id };
            toolBlocks.delete(event.index);
          }
          break;
        }
        case "message_delta": {
          stopReason = event.delta.stop_reason ?? undefined;
          if (event.usage) {
            outputTokens = event.usage.output_tokens;
            yield { type: "usage", usage: { inputTokens, outputTokens } };
          }
          break;
        }
        case "message_start": {
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
          yield { type: "usage", usage: { inputTokens, outputTokens } };
          break;
        }
        case "message_stop":
          stopped = true;
          break;
      }
    }
    signal?.throwIfAborted();
    if (!stopped || toolBlocks.size > 0) throw new Error("Incomplete Anthropic response");
    yield { type: "done", stopReason };
  }

  async countTokens(messages: Message[]): Promise<number> {
    // Anthropic SDK has a count_tokens API but it requires model context.
    // Fall back to estimation for now.
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        total += Math.ceil(msg.content.length / 4);
      } else {
        for (const part of msg.content) {
          if (part.type === "text") {
            total += Math.ceil(part.text.length / 4);
          } else {
            total += 1000; // rough estimate for images
          }
        }
      }
    }
    return total;
  }
}

// ---------------------------------------------------------------------------
// Message format translation
// ---------------------------------------------------------------------------

function toAnthropicMessage(
  msg: UserMessage | AssistantMessage | ToolResultMessage,
): Record<string, unknown> {
  if (msg.role === "user") {
    if (typeof msg.content === "string") {
      return { role: "user", content: msg.content };
    }
    return {
      role: "user",
      content: msg.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        return {
          type: "image",
          source: { type: "base64", media_type: part.mediaType, data: part.data },
        };
      }),
    };
  }

  if (msg.role === "assistant") {
    const content: Record<string, unknown>[] = [];

    // Add text content
    if (typeof msg.content === "string") {
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
    } else {
      for (const part of msg.content) {
        if (part.type === "text") content.push({ type: "text", text: part.text });
      }
    }

    // Add tool use blocks
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
    }

    return { role: "assistant", content };
  }

  // Tool result
  return {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        ...(msg.isError ? { is_error: true } : {}),
      },
    ],
  };
}

function toAnthropicTool(tool: ProviderTool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

// ---------------------------------------------------------------------------
// Dynamic SDK loading
// ---------------------------------------------------------------------------

let sdkModule: AnthropicSDK | null = null;

async function loadSDK() {
  if (sdkModule) return sdkModule.default;
  try {
    sdkModule = await import("@anthropic-ai/sdk");
    return sdkModule.default;
  } catch {
    throw new Error(
      'AnthropicProvider requires "@anthropic-ai/sdk" package. Install it with: pnpm add @anthropic-ai/sdk',
    );
  }
}
