import { z } from "zod";
import type {
  MCPHttpServerConfig,
  MCPServerConfig,
  MCPStdioServerConfig,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "./types.js";

/**
 * Represents a single connected MCP server and its discovered tools.
 *
 * Lazy-loads the @modelcontextprotocol/sdk so it remains an optional peer dep.
 * Supports both stdio (subprocess) and HTTP (Streamable HTTP) transports.
 */
/** Pattern for valid MCP server names: alphanumeric, single hyphens/underscores, no `__`. */
const VALID_SERVER_NAME = /^[a-zA-Z0-9]+([_-][a-zA-Z0-9]+)*$/;

const DEFAULT_CONNECT_TIMEOUT = 30_000;

export class MCPClient {
  private config: MCPServerConfig;
  private client: MCPClientInstance | null = null;
  private transport: MCPTransport | null = null;
  private _tools: ToolDefinition[] = [];
  private _connected = false;

  constructor(config: MCPServerConfig) {
    if (!VALID_SERVER_NAME.test(config.name)) {
      throw new Error(
        `Invalid MCP server name "${config.name}": must match [a-zA-Z0-9_-] with no consecutive underscores (__).`,
      );
    }
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get connected(): boolean {
    return this._connected;
  }

  get tools(): ToolDefinition[] {
    return this._tools;
  }

  /**
   * Connect to the MCP server and discover available tools.
   * Throws if the SDK is not installed or the server fails to connect.
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    const sdk = await loadMCPSdk();

    this.client = new sdk.Client(
      { name: "claude-code-kit", version: "0.2.0" },
      { capabilities: {} },
    );

    this.transport = isStdioConfig(this.config)
      ? new sdk.StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
          cwd: this.config.cwd,
          stderr: "pipe",
        })
      : new sdk.StreamableHTTPClientTransport(new URL(this.config.url), {
          requestInit: this.config.headers
            ? { headers: this.config.headers }
            : undefined,
        });

    const timeout = this.config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
    const connectPromise = this.client.connect(this.transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`MCP server "${this.config.name}" connection timed out after ${timeout}ms`)),
        timeout,
      );
    });
    await Promise.race([connectPromise, timeoutPromise]);
    this._connected = true;

    await this.discoverTools();
  }

  /**
   * Refresh the tool list from the server.
   */
  async discoverTools(): Promise<ToolDefinition[]> {
    if (!this.client) {
      throw new Error(`MCP client "${this.config.name}" is not connected`);
    }

    const result = await this.client.listTools();
    const serverName = this.config.name;

    this._tools = result.tools.map((mcpTool) =>
      convertMCPTool(mcpTool, serverName, this.client!),
    );

    return this._tools;
  }

  /**
   * Disconnect from the MCP server and clean up resources.
   */
  async disconnect(): Promise<void> {
    if (!this._connected) return;

    try {
      await this.transport?.close();
    } catch {
      // Best-effort cleanup — the subprocess may have already exited
    }

    this.client = null;
    this.transport = null;
    this._tools = [];
    this._connected = false;
  }
}

// ---------------------------------------------------------------------------
// MCP tool -> ToolDefinition conversion
// ---------------------------------------------------------------------------

interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Convert an MCP tool definition into our ToolDefinition format.
 *
 * Tools are namespaced as `mcp__{serverName}__{toolName}` to avoid collisions
 * with built-in tools or tools from other MCP servers.
 *
 * MCP tools are non-readOnly by default (conservative security posture).
 */
function convertMCPTool(
  mcpTool: MCPToolInfo,
  serverName: string,
  client: MCPClientInstance,
): ToolDefinition {
  const qualifiedName = `mcp__${serverName}__${mcpTool.name}`;

  // Build a Zod schema from the JSON Schema. We use z.record() as a passthrough
  // since the MCP server already validates inputs on its side. The JSON Schema
  // is still passed to the LLM provider via toProviderFormat().
  const inputSchema = z.record(z.string(), z.unknown());

  // Store the original JSON Schema so toolToProviderFormat() can use it
  const originalJsonSchema = mcpTool.inputSchema;

  const isReadOnly = mcpTool.annotations?.readOnlyHint === true;
  const isDestructive = mcpTool.annotations?.destructiveHint === true;

  const tool: ToolDefinition = {
    name: qualifiedName,
    description: mcpTool.description ?? `MCP tool from ${serverName}`,
    inputSchema,
    isReadOnly,
    isDestructive,
    rawInputSchema: originalJsonSchema,

    async execute(
      input: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      try {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: input,
        });

        // MCP returns content as an array of typed parts
        const content = extractTextContent(result);
        const isError = "isError" in result ? result.isError === true : false;

        return { content, isError };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `MCP tool "${mcpTool.name}" (${serverName}) failed: ${message}`,
          isError: true,
        };
      }
    },
  };

  return tool;
}

/**
 * Extract text content from an MCP tool result.
 * MCP results contain an array of content parts; we concatenate all text parts.
 */
function extractTextContent(result: Record<string, unknown>): string {
  if (!result.content || !Array.isArray(result.content)) {
    return JSON.stringify(result);
  }

  const parts: string[] = [];
  for (const part of result.content) {
    if (typeof part === "object" && part !== null) {
      if ("text" in part && typeof part.text === "string") {
        parts.push(part.text);
      } else if ("data" in part && typeof part.data === "string") {
        // Binary/image content — return a placeholder
        const mimeType =
          "mimeType" in part && typeof part.mimeType === "string"
            ? part.mimeType
            : "unknown";
        parts.push(`[binary content: ${mimeType}]`);
      } else {
        parts.push(JSON.stringify(part));
      }
    }
  }

  return parts.join("\n") || "(empty result)";
}

// ---------------------------------------------------------------------------
// SDK loading (lazy, so the peer dep stays optional)
// ---------------------------------------------------------------------------

interface MCPClientInstance {
  connect(transport: MCPTransport): Promise<void>;
  listTools(): Promise<{ tools: MCPToolInfo[] }>;
  callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

interface MCPTransport {
  close(): Promise<void>;
}

// Using `any` for SDK constructor signatures to avoid coupling to the SDK's
// specific param types (which differ across versions). The actual constructor
// arguments are assembled in connect() with the correct shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = new (...args: any[]) => MCPTransport;

interface MCPSdk {
  Client: new (
    info: { name: string; version: string },
    options: { capabilities: Record<string, unknown> },
  ) => MCPClientInstance;
  StdioClientTransport: AnyConstructor;
  StreamableHTTPClientTransport: AnyConstructor;
}

let _sdkCache: MCPSdk | undefined;

async function loadMCPSdk(): Promise<MCPSdk> {
  if (_sdkCache) return _sdkCache;

  try {
    const clientMod = await import("@modelcontextprotocol/sdk/client");
    const stdioMod = await import(
      "@modelcontextprotocol/sdk/client/stdio.js"
    );
    const httpMod = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );

    const sdk: MCPSdk = {
      Client: clientMod.Client,
      StdioClientTransport: stdioMod.StdioClientTransport,
      StreamableHTTPClientTransport: httpMod.StreamableHTTPClientTransport,
    };

    _sdkCache = sdk;
    return sdk;
  } catch {
    throw new Error(
      'MCP support requires @modelcontextprotocol/sdk. Install it: pnpm add @modelcontextprotocol/sdk',
    );
  }
}

// Reset the SDK cache (used in tests)
export function _resetSdkCache(): void {
  _sdkCache = undefined;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isStdioConfig(config: MCPServerConfig): config is MCPStdioServerConfig {
  return "command" in config;
}

export function isHttpConfig(config: MCPServerConfig): config is MCPHttpServerConfig {
  return "url" in config;
}
