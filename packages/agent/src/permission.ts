import type { PermissionConfig, PermissionHandler, PermissionRequest, PermissionResult } from "./types.js";

/**
 * Create a tiered permission handler from a configuration object.
 *
 * Permission tiers (checked in order):
 *  1. Always allow list — tool is unconditionally allowed
 *  2. Always deny list — tool is unconditionally denied
 *  3. Session approved — tool was approved earlier in this session
 *  4. Read-only auto-approve — if enabled, read-only tools are allowed
 *  5. Callback — delegate to a custom handler (e.g. prompt the user)
 *  6. Default — allow (no permission handler = auto-approve everything)
 */
export function createPermissionHandler(config: PermissionConfig): PermissionHandler {
  return async (request: PermissionRequest): Promise<PermissionResult> => {
    // Tier 1: always allow list
    if (config.alwaysAllow?.includes(request.tool)) {
      return { decision: "allow" };
    }

    // Tier 2: always deny list
    if (config.alwaysDeny?.includes(request.tool)) {
      return { decision: "deny", reason: `Tool "${request.tool}" is in the deny list` };
    }

    // Tier 3: session approved
    if (config.sessionApproved?.has(request.tool)) {
      return { decision: "allow" };
    }

    // Tier 4: read-only auto-approve
    if (config.autoApproveReadOnly && request.isReadOnly) {
      return { decision: "allow" };
    }

    // Tier 5: callback
    if (config.onPermission) {
      return config.onPermission(request);
    }

    // Tier 6: default allow
    return { decision: "allow" };
  };
}

/**
 * Permission handler that allows everything. Useful for fully automated pipelines.
 */
export const allowAll: PermissionHandler = async () => ({ decision: "allow" });

/**
 * Permission handler that denies everything. Useful for dry-run / audit mode.
 */
export const denyAll: PermissionHandler = async () => ({
  decision: "deny",
  reason: "All tool executions are denied",
});
