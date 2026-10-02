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
  private connectPromise?: Promise<void>;
  private discoveryPromise?: Promise<ToolDefinition[]>;
  private connectionController?: AbortController;
  private refreshPromise?: Promise<void>;
  private refreshPending = false;
  private toolsListeners = new Set<(tools: ToolDefinition[]) => void>();
  private errorListeners = new Set<(error: Error) => void>();

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
    return [...this._tools];
  }

  onToolsChanged(listener: (tools: ToolDefinition[]) => void): () => void {
    this.toolsListeners.add(listener);
    return () => this.toolsListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Connect to the MCP server and discover available tools.
   * Throws if the SDK is not installed or the server fails to connect.
   */
  connect(abortSignal?: AbortSignal): Promise<void> {
    if (abortSignal?.aborted) return Promise.reject(abortSignal.reason);
    if (this._connected) return Promise.resolve();
    this.connectPromise ??= this.connectInternal(abortSignal).finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async connectInternal(abortSignal?: AbortSignal): Promise<void> {
    const sdk = await loadMCPSdk();
    abortSignal?.throwIfAborted();

    const client = new sdk.Client(
      { name: "claude-code-kit", version: "0.3.0" },
      {
        capabilities: {},
        listChanged: {
          tools: {
            autoRefresh: false,
            debounceMs: 0,
            onChanged: () => this.refreshFromNotification(),
          },
        },
      },
    );

    const transport = isStdioConfig(this.config)
      ? new sdk.StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
          cwd: this.config.cwd,
          stderr: "pipe",
        })
      : new sdk.StreamableHTTPClientTransport(new URL(this.config.url), {
          requestInit: this.config.headers ? { headers: this.config.headers } : undefined,
        });

    this.client = client;
    this.transport = transport;
    client.onclose = () => {
      if (this.client !== client || !this._connected) return;
      this.clearConnection();
      this.emitToolsChanged();
      this.emitError(new Error(`MCP server "${this.name}" disconnected`));
    };
    client.onerror = (error) => this.emitError(error);

    const controller = new AbortController();
    this.connectionController = controller;
    const forwardAbort = () => controller.abort(abortSignal?.reason);
    abortSignal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = this.config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
    let rejectOnAbort: () => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectOnAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    const timer = setTimeout(() => {
      controller.abort(
        new Error(`MCP server "${this.name}" connection timed out after ${timeout}ms`),
      );
    }, timeout);

    try {
      await Promise.race([
        (async () => {
          await client.connect(transport, { signal: controller.signal });
          controller.signal.throwIfAborted();
          await this.discoverTools(controller.signal);
        })(),
        aborted,
      ]);
      controller.signal.throwIfAborted();
      this._connected = true;
    } catch (error) {
      if (this.client === client) this.clearConnection();
      // Cancellation must not wait for an SDK or subprocess that ignores close.
      void closeResources(client, transport);
      throw error;
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", rejectOnAbort!);
      abortSignal?.removeEventListener("abort", forwardAbort);
      if (this.connectionController === controller) this.connectionController = undefined;
    }
  }

  /**
   * Refresh the tool list from the server.
   */
  discoverTools(signal?: AbortSignal): Promise<ToolDefinition[]> {
    const client = this.client;
    if (!client) {
      return Promise.reject(new Error(`MCP client "${this.name}" is not connected`));
    }
    if (this.discoveryPromise) return this.discoveryPromise;

    const discovery = (async () => {
      const tools: MCPToolInfo[] = [];
      const names = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        signal?.throwIfAborted();
        const result = await client.listTools(cursor ? { cursor } : undefined, { signal });
        for (const tool of result.tools) {
          if (names.has(tool.name)) {
            throw new Error(`MCP server "${this.name}" returned duplicate tool "${tool.name}"`);
          }
          names.add(tool.name);
          tools.push(tool);
        }
        cursor = result.nextCursor;
        if (cursor && cursors.has(cursor)) {
          throw new Error(`MCP server "${this.name}" returned a repeated tools/list cursor`);
        }
        if (cursor) cursors.add(cursor);
      } while (cursor);

      signal?.throwIfAborted();
      if (this.client !== client)
        throw new Error(`MCP client "${this.name}" disconnected during discovery`);
      this._tools = tools.map((tool) =>
        convertMCPTool(tool, this.name, client, this.config.trustToolAnnotations === true),
      );
      this.emitToolsChanged();
      return this.tools;
    })();
    this.discoveryPromise = discovery;
    void discovery
      .finally(() => {
        if (this.discoveryPromise === discovery) this.discoveryPromise = undefined;
      })
      .catch(() => {});
    return discovery;
  }

  /**
   * Disconnect from the MCP server and clean up resources.
   */
  async disconnect(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.connectionController?.abort(new Error(`MCP client "${this.name}" connection aborted`));
    this.clearConnection();
    this.emitToolsChanged();
    await closeResources(client, transport);
  }

  private clearConnection(): void {
    this.client = null;
    this.transport = null;
    this._tools = [];
    this._connected = false;
    this.discoveryPromise = undefined;
    this.refreshPending = false;
    this.refreshPromise = undefined;
  }

  private refreshFromNotification(): Promise<void> {
    this.refreshPending = true;
    if (this.refreshPromise) return this.refreshPromise;
    const client = this.client;
    const refresh = (async () => {
      // A notification during discovery needs another request after that snapshot.
      await this.discoveryPromise?.catch(() => {});
      while (this.refreshPending && client && this.client === client) {
        this.refreshPending = false;
        try {
          await this.discoverTools();
        } catch (error) {
          if (this.client === client) {
            const message = error instanceof Error ? error.message : String(error);
            this.emitError(
              new Error(`MCP server "${this.name}" tool discovery failed: ${message}`),
            );
          }
        }
      }
    })();
    this.refreshPromise = refresh;
    void refresh
      .finally(() => {
        if (this.refreshPromise === refresh) this.refreshPromise = undefined;
      })
      .catch(() => {});
    return refresh;
  }

  private emitToolsChanged(): void {
    for (const listener of this.toolsListeners) listener(this.tools);
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}

async function closeResources(
  client: MCPClientInstance | null,
  transport: MCPTransport | null,
): Promise<void> {
  // A failed handshake may leave a transport that the SDK has not attached yet.
  await Promise.allSettled([client, transport].map(async (resource) => resource?.close()));
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
  trustAnnotations: boolean,
): ToolDefinition {
  const qualifiedName = `mcp__${serverName}__${mcpTool.name}`;

  // Build a Zod schema from the JSON Schema. We use z.record() as a passthrough
  // since the MCP server already validates inputs on its side. The JSON Schema
  // is still passed to the LLM provider via toProviderFormat().
  const inputSchema = z.record(z.string(), z.unknown());

  // Store the original JSON Schema so toolToProviderFormat() can use it
  const originalJsonSchema = mcpTool.inputSchema;

  const isDestructive = mcpTool.annotations?.destructiveHint === true;
  const isReadOnly =
    trustAnnotations && !isDestructive && mcpTool.annotations?.readOnlyHint === true;

  const tool: ToolDefinition = {
    name: qualifiedName,
    description: mcpTool.description ?? `MCP tool from ${serverName}`,
    inputSchema,
    isReadOnly,
    isDestructive,
    rawInputSchema: originalJsonSchema,

    async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        context.abortSignal.throwIfAborted();
        const result = await client.callTool({ name: mcpTool.name, arguments: input }, undefined, {
          signal: context.abortSignal,
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
          "mimeType" in part && typeof part.mimeType === "string" ? part.mimeType : "unknown";
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
  connect(transport: MCPTransport, options?: { signal?: AbortSignal }): Promise<void>;
  listTools(
    params?: { cursor: string },
    options?: { signal?: AbortSignal },
  ): Promise<{ tools: MCPToolInfo[]; nextCursor?: string }>;
  callTool(
    params: {
      name: string;
      arguments?: Record<string, unknown>;
    },
    resultSchema?: undefined,
    options?: { signal?: AbortSignal },
  ): Promise<Record<string, unknown>>;
  close(): Promise<void>;
  onclose?: () => void;
  onerror?: (error: Error) => void;
}

interface MCPTransport {
  close(): Promise<void>;
}

type StdioTransportConstructor = new (config: {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stderr?: "pipe";
}) => MCPTransport;

type StreamableHTTPTransportConstructor = new (
  url: URL,
  options?: { requestInit?: { headers?: Record<string, string> } },
) => MCPTransport;

interface MCPSdk {
  Client: new (
    info: { name: string; version: string },
    options: {
      capabilities: Record<string, unknown>;
      listChanged: {
        tools: { autoRefresh: boolean; debounceMs: number; onChanged: () => Promise<void> };
      };
    },
  ) => MCPClientInstance;
  StdioClientTransport: StdioTransportConstructor;
  StreamableHTTPClientTransport: StreamableHTTPTransportConstructor;
}

let _sdkCache: MCPSdk | undefined;

async function loadMCPSdk(): Promise<MCPSdk> {
  if (_sdkCache) return _sdkCache;

  try {
    const clientMod = await import("@modelcontextprotocol/sdk/client");
    const stdioMod = await import("@modelcontextprotocol/sdk/client/stdio.js");
    const httpMod = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

    const sdk: MCPSdk = {
      Client: clientMod.Client,
      StdioClientTransport: stdioMod.StdioClientTransport,
      StreamableHTTPClientTransport: httpMod.StreamableHTTPClientTransport,
    };

    _sdkCache = sdk;
    return sdk;
  } catch {
    throw new Error(
      "MCP support requires @modelcontextprotocol/sdk. Install it: pnpm add @modelcontextprotocol/sdk",
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
