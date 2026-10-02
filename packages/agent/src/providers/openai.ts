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

interface OpenAIProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Provider adapter for OpenAI-compatible Chat Completions API.
 *
 * Supports any OpenAI-compatible endpoint (OpenAI, Ollama, vLLM, Groq, Together)
 * via the `baseURL` option.
 *
 * Requires `openai` SDK as an optional peer dependency.
 */
export class OpenAIProvider implements LLMProvider {
  private clientPromise: Promise<InstanceType<Awaited<ReturnType<typeof loadSDK>>>>;

  constructor(options: OpenAIProviderOptions = {}) {
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

    const { model, messages, tools, systemPrompt, maxTokens, temperature, signal } = options;

    // Build OpenAI messages array
    const openaiMessages: Record<string, unknown>[] = [];

    // Add system prompt
    if (systemPrompt) {
      openaiMessages.push({ role: "system", content: systemPrompt });
    }

    // Convert canonical messages
    for (const msg of messages) {
      if (msg.role === "system") {
        openaiMessages.push({ role: "system", content: msg.content });
      } else {
        // Safe cast: the if-branch handles SystemMessage, so msg is narrowed here
        openaiMessages.push(
          toOpenAIMessage(msg as UserMessage | AssistantMessage | ToolResultMessage),
        );
      }
    }

    const openaiTools = tools?.map(toOpenAITool);

    // SDK boundary: we construct correct shapes in toOpenAIMessage/toOpenAITool,
    // but the OpenAI SDK types are too strict for our generic Record-based
    // translation layer. Using Record<string, unknown> for the params object.
    const params: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(openaiTools?.length ? { tools: openaiTools } : {}),
      stream: true,
      stream_options: { include_usage: true },
    };
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI SDK stream type varies across versions and cannot be statically typed when params are dynamic
    const stream: any = await client.chat.completions.create(params as never, { signal });

    const toolCalls = new Map<
      number,
      { id: string; name: string; bufferedArgs: string; started: boolean }
    >();
    let inputTokens = 0;
    let outputTokens = 0;
    let hasUsage = false;
    let stopReason: string | undefined;

    for await (const chunk of stream) {
      signal?.throwIfAborted();
      // OpenAI sends usage in a final chunk with no choices.
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
        hasUsage = true;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) yield { type: "text", text: delta.content };

      for (const tc of delta?.tool_calls ?? []) {
        const index = tc.index;
        if (!Number.isInteger(index) || index < 0) throw new Error("Invalid streamed tool index");
        let entry = toolCalls.get(index);
        if (!entry) {
          entry = { id: "", name: "", bufferedArgs: "", started: false };
          toolCalls.set(index, entry);
        }
        if (tc.id) {
          if (entry.started && entry.id !== tc.id) throw new Error("Streamed tool ID changed");
          entry.id = tc.id;
        }
        if (tc.function?.name) {
          if (entry.started && entry.name !== tc.function.name)
            throw new Error("Streamed tool name changed");
          if (!entry.started && entry.name !== tc.function.name) entry.name += tc.function.name;
        }
        if (!entry.started && entry.id && entry.name) {
          entry.started = true;
          yield { type: "tool_use_start", toolCall: { id: entry.id, name: entry.name } };
        }
        entry.bufferedArgs += tc.function?.arguments ?? "";
        if (entry.started && entry.bufferedArgs) {
          yield { type: "tool_use_delta", id: entry.id, text: entry.bufferedArgs };
          entry.bufferedArgs = "";
        }
      }

      if (choice.finish_reason) {
        stopReason = choice.finish_reason;
        for (const entry of toolCalls.values()) {
          if (!entry.started || entry.bufferedArgs)
            throw new Error("Incomplete streamed tool metadata");
          yield { type: "tool_use_end", id: entry.id };
        }
        toolCalls.clear();
      }
    }
    signal?.throwIfAborted();
    if (!stopReason || toolCalls.size > 0)
      throw new Error("Incomplete OpenAI response: missing finish reason");
    if (hasUsage) yield { type: "usage", usage: { inputTokens, outputTokens } };
    yield { type: "done", stopReason };
  }

  async countTokens(messages: Message[]): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        total += Math.ceil(msg.content.length / 4);
      } else {
        for (const part of msg.content) {
          if (part.type === "text") total += Math.ceil(part.text.length / 4);
          else total += 1000;
        }
      }
    }
    return total;
  }
}

// ---------------------------------------------------------------------------
// Message format translation
// ---------------------------------------------------------------------------

function toOpenAIMessage(
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
          type: "image_url",
          image_url: { url: `data:${part.mediaType};base64,${part.data}` },
        };
      }),
    };
  }

  if (msg.role === "assistant") {
    const result: Record<string, unknown> = { role: "assistant" };

    // Text content
    if (typeof msg.content === "string") {
      result.content = msg.content || null;
    } else {
      const text = msg.content
        .filter((p): p is import("../types.js").TextContentPart => p.type === "text")
        .map((p) => p.text)
        .join("");
      result.content = text || null;
    }

    // Tool calls
    if (msg.toolCalls?.length) {
      result.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      }));
    }

    return result;
  }

  // Tool result → OpenAI uses role: "tool" with tool_call_id
  return {
    role: "tool",
    tool_call_id: msg.toolCallId,
    content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
  };
}

function toOpenAITool(tool: ProviderTool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

// ---------------------------------------------------------------------------
// Dynamic SDK loading
// ---------------------------------------------------------------------------

type OpenAISDK = typeof import("openai");
let sdkModule: OpenAISDK | null = null;

async function loadSDK() {
  if (sdkModule) return sdkModule.default;
  try {
    sdkModule = await import("openai");
    return sdkModule.default;
  } catch {
    throw new Error('OpenAIProvider requires "openai" package. Install it with: pnpm add openai');
  }
}
