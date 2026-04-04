import type { PermissionHandler, ToolCall, ToolContext, ToolResultMessage } from "./types.js";
import type { ToolRegistry } from "./tool-registry.js";

const DEFAULT_MAX_CONCURRENT = 5;

interface ParallelToolsOptions {
  toolCalls: ToolCall[];
  toolRegistry: ToolRegistry;
  permissionHandler: PermissionHandler;
  context: ToolContext;
  parseErrors?: Map<string, string>;
  maxConcurrent?: number;
}

/**
 * Partition tool calls into groups that can run safely:
 * - readOnly tools run in parallel (they don't mutate state)
 * - non-readOnly (destructive) tools run one at a time
 *
 * We preserve original ordering by tracking each call's index and
 * reassembling results in the original tool_calls order.
 */
export async function executeToolCalls(
  options: ParallelToolsOptions,
): Promise<ToolResultMessage[]> {
  const {
    toolCalls,
    toolRegistry,
    permissionHandler,
    context,
    parseErrors,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
  } = options;

  // Pre-resolve each call to its result (preserving order via index)
  const results = new Array<ToolResultMessage>(toolCalls.length);

  // Build execution plan: separate into groups that maintain ordering constraints.
  // We walk the list in order and batch consecutive readOnly calls together,
  // but each non-readOnly (destructive/unknown) call becomes its own sequential step.
  const executionPlan = buildExecutionPlan(toolCalls, toolRegistry);

  for (const group of executionPlan) {
    if (group.kind === "parallel") {
      await executeParallelGroup(group.entries, results, {
        toolRegistry,
        permissionHandler,
        context,
        parseErrors,
        maxConcurrent,
      });
    } else {
      // Sequential: single entry
      const entry = group.entries[0]!;
      results[entry.index] = await executeSingleToolCall(
        entry.toolCall,
        toolRegistry,
        permissionHandler,
        context,
        parseErrors,
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Execution plan
// ---------------------------------------------------------------------------

interface PlanEntry {
  index: number;
  toolCall: ToolCall;
}

type ExecutionGroup =
  | { kind: "parallel"; entries: PlanEntry[] }
  | { kind: "sequential"; entries: [PlanEntry] };

/**
 * Build an execution plan that groups tool calls into parallel or sequential steps.
 *
 * Strategy: Only tools explicitly marked `isReadOnly: true` are eligible for
 * parallel execution. All others (including unknown tools and tools with
 * isReadOnly unset) execute sequentially for safety.
 *
 * We intentionally do not branch on `isDestructive` separately — tools with
 * isReadOnly unset are already untrusted and run sequentially. `isDestructive`
 * is advisory metadata for UI/logging and does not change the execution plan.
 */
function buildExecutionPlan(
  toolCalls: ToolCall[],
  registry: ToolRegistry,
): ExecutionGroup[] {
  const groups: ExecutionGroup[] = [];
  let currentParallelBatch: PlanEntry[] = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]!;
    const toolDef = registry.get(tc.name);
    const isReadOnly = toolDef?.isReadOnly === true;

    if (isReadOnly) {
      currentParallelBatch.push({ index: i, toolCall: tc });
    } else {
      // Flush any accumulated readOnly batch before the destructive call
      if (currentParallelBatch.length > 0) {
        groups.push({ kind: "parallel", entries: currentParallelBatch });
        currentParallelBatch = [];
      }
      groups.push({ kind: "sequential", entries: [{ index: i, toolCall: tc }] });
    }
  }

  // Flush remaining readOnly batch
  if (currentParallelBatch.length > 0) {
    groups.push({ kind: "parallel", entries: currentParallelBatch });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Parallel group execution with concurrency limit
// ---------------------------------------------------------------------------

async function executeParallelGroup(
  entries: PlanEntry[],
  results: ToolResultMessage[],
  opts: {
    toolRegistry: ToolRegistry;
    permissionHandler: PermissionHandler;
    context: ToolContext;
    parseErrors?: Map<string, string>;
    maxConcurrent: number;
  },
): Promise<void> {
  // Process in batches of maxConcurrent to avoid spawning too many processes
  for (let i = 0; i < entries.length; i += opts.maxConcurrent) {
    const batch = entries.slice(i, i + opts.maxConcurrent);
    const promises = batch.map(async (entry) => {
      results[entry.index] = await executeSingleToolCall(
        entry.toolCall,
        opts.toolRegistry,
        opts.permissionHandler,
        opts.context,
        opts.parseErrors,
      );
    });
    await Promise.all(promises);
  }
}

// ---------------------------------------------------------------------------
// Single tool call execution (same logic as the original sequential version)
// ---------------------------------------------------------------------------

async function executeSingleToolCall(
  tc: ToolCall,
  toolRegistry: ToolRegistry,
  permissionHandler: PermissionHandler,
  context: ToolContext,
  parseErrors?: Map<string, string>,
): Promise<ToolResultMessage> {
  // JSON parse error from streaming phase — report back without executing
  const parseError = parseErrors?.get(tc.id);
  if (parseError) {
    return {
      role: "tool",
      toolCallId: tc.id,
      content: parseError,
      isError: true,
    };
  }

  try {
    const toolDef = toolRegistry.get(tc.name);

    const permissionResult = await permissionHandler({
      tool: tc.name,
      input: tc.input,
      isReadOnly: toolDef?.isReadOnly,
    });

    if (permissionResult.decision === "deny") {
      return {
        role: "tool",
        toolCallId: tc.id,
        content: `Permission denied for tool "${tc.name}"${permissionResult.reason ? `: ${permissionResult.reason}` : ""}`,
        isError: true,
      };
    }

    const result = await toolRegistry.execute(tc.name, tc.input, context);

    return {
      role: "tool",
      toolCallId: tc.id,
      content: result.content,
      isError: result.isError,
    };
  } catch (error) {
    return {
      role: "tool" as const,
      toolCallId: tc.id,
      content: `Permission error: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}
