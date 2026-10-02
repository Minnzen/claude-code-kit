import type {
  PermissionConfig,
  PermissionHandler,
  PermissionRequest,
  PermissionResult,
} from "./types.js";

/**
 * Explicit denial overrides all approval rules. Without an explicit approval
 * route, tools are denied; safe read-only tools can be opted into automatic approval.
 */
export function createPermissionHandler(config: PermissionConfig): PermissionHandler {
  return async (request: PermissionRequest): Promise<PermissionResult> => {
    if (config.alwaysDeny?.includes(request.tool)) {
      return {
        decision: "deny",
        reason: `Tool "${request.tool}" is in the deny list`,
        approvalRequired: false,
      };
    }
    if (config.alwaysAllow?.includes(request.tool) || config.sessionApproved?.has(request.tool)) {
      return { decision: "allow" };
    }
    if (config.autoApproveReadOnly && isSafeReadOnly(request)) {
      return { decision: "allow" };
    }
    if (config.onPermission) {
      return config.onPermission(request);
    }
    return {
      decision: "deny",
      reason: "No explicit approval configured for this tool",
      approvalRequired: true,
    };
  };
}

function isSafeReadOnly(request: PermissionRequest): boolean {
  return request.isReadOnly === true && !request.isDestructive && !request.requiresConfirmation;
}

/**
 * Permission handler that allows everything. Useful for fully automated pipelines.
 */
export const allowAll: PermissionHandler = async () => ({ decision: "allow" });

/**
 * Default permission handler: allows read-only tools, denies everything else.
 * Used when no permissionHandler is configured in AgentConfig.
 */
export const allowReadOnly: PermissionHandler = async (request) => {
  if (isSafeReadOnly(request)) {
    return { decision: "allow" };
  }
  return {
    decision: "deny",
    reason: "No permission handler configured. Set permissionHandler in AgentConfig.",
    approvalRequired: true,
  };
};

/**
 * Permission handler that denies everything. Useful for dry-run / audit mode.
 */
export const denyAll: PermissionHandler = async () => ({
  decision: "deny",
  reason: "All tool executions are denied",
});
