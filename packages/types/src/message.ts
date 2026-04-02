// ---------------------------------------------------------------------------
// Canonical message format (OpenAI-style)
// ---------------------------------------------------------------------------

/** A single tool invocation requested by the assistant. */
export interface ToolCall {
  /** Unique identifier for this tool call (used to correlate results). */
  id: string;
  /** Tool name. */
  name: string;
  /** Parsed input arguments. */
  input: Record<string, unknown>;
}

// -- Content parts ----------------------------------------------------------

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image";
  /** Base64-encoded image data. */
  data: string;
  /** MIME type, e.g. "image/png". */
  mediaType: string;
}

export type ContentPart = TextContentPart | ImageContentPart;

// -- Messages ---------------------------------------------------------------

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
}

export interface AssistantMessage {
  role: "assistant";
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
}

export interface ToolResultMessage {
  role: "tool";
  /** The tool call ID this result corresponds to. */
  toolCallId: string;
  content: string | ContentPart[];
  isError?: boolean;
}

/** Union of all message types flowing through the agent loop. */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;
