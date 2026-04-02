// ---------------------------------------------------------------------------
// Permission system
// ---------------------------------------------------------------------------

/** A request to authorize a tool invocation. */
export interface PermissionRequest {
  /** Tool name. */
  tool: string;
  /** Parsed tool input. */
  input: Record<string, unknown>;
  /** Whether the tool only reads state. */
  isReadOnly: boolean;
  /** Whether the tool performs irreversible operations. */
  isDestructive: boolean;
  /** Whether the tool definition requires explicit confirmation. */
  requiresConfirmation: boolean;
}

/** The decision returned by a permission handler. */
export type PermissionDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string }
  | { type: "allow_always"; pattern: string };

/**
 * Callback invoked before each tool execution to authorize it.
 * Return a decision synchronously or asynchronously.
 */
export type PermissionHandler = (
  request: PermissionRequest,
) => PermissionDecision | Promise<PermissionDecision>;

/** Declarative permission configuration. */
export interface PermissionConfig {
  /** Tool names that are always allowed without prompting. */
  alwaysAllow?: string[];
  /** Tool names that are always denied. */
  alwaysDeny?: string[];
  /** Tools approved during the current session (tool name -> input pattern). */
  sessionApproved?: Map<string, string>;
  /** Fallback handler for tools not covered by static rules. */
  onPermission: PermissionHandler;
}
