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

  constructor(private options: AnthropicProviderOptions = {}) {
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
    const { systemPrompt, messages: rawMessages, tools, model, maxTokens, temperature, signal } =
      options;

    const anthropicMessages = rawMessages
      .filter((m) => m.role !== "system")
      .map((m) => toAnthropicMessage(m as UserMessage | AssistantMessage | ToolResultMessage));

    const anthropicTools = tools?.map(toAnthropicTool);

    // Cast to `any` at the SDK boundary — we construct the correct shapes
    // in toAnthropicMessage/toAnthropicTool, but the Anthropic SDK types are
    // too strict for our generic Record-based translation layer.
    // biome-ignore lint/suspicious/noExplicitAny: SDK boundary cast
    const params: any = {
      model,
      max_tokens: maxTokens ?? 4096,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: anthropicMessages,
      ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
    };
    const stream = client.messages.stream(params, { signal });

    // Accumulate tool call input JSON across deltas
    let currentToolId: string | undefined;

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "text") {
            // Text block started — nothing to yield yet
          } else if (block.type === "tool_use") {
            currentToolId = block.id;
            yield {
              type: "tool_use_start",
              toolCall: { id: block.id, name: block.name },
            };
          } else if (block.type === "thinking") {
            // Thinking block started
          }
          break;
        }

        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            yield { type: "text", text: delta.text };
          } else if (delta.type === "input_json_delta") {
            yield { type: "tool_use_delta", text: delta.partial_json };
          } else if (delta.type === "thinking_delta") {
            yield { type: "thinking", text: delta.thinking };
          }
          break;
        }

        case "content_block_stop": {
          if (currentToolId) {
            yield { type: "tool_use_end" };
            currentToolId = undefined;
          }
          break;
        }

        case "message_delta": {
          // message_delta contains usage updates
          if (event.usage) {
            yield {
              type: "usage",
              usage: {
                inputTokens: 0,
                outputTokens: event.usage.output_tokens,
              },
            };
          }
          break;
        }

        case "message_start": {
          if (event.message.usage) {
            yield {
              type: "usage",
              usage: {
                inputTokens: event.message.usage.input_tokens,
                outputTokens: event.message.usage.output_tokens,
              },
            };
          }
          break;
        }
      }
    }

    yield { type: "done" };
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
