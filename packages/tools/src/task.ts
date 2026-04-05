import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

// ---------------------------------------------------------------------------
// Task type
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  owner?: string;
  blocks?: string[];
  blockedBy?: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Return type for createTaskTool — 4 independent tools + management helpers
// ---------------------------------------------------------------------------

export interface TaskToolSet {
  taskCreate: ToolDefinition;
  taskUpdate: ToolDefinition;
  taskGet: ToolDefinition;
  taskList: ToolDefinition;
  /** Return a snapshot of all tasks (order matches insertion order). */
  getTasks(): Task[];
  /** Remove all tasks and reset the ID counter. */
  clear(): void;
}

// Keep the old name as an alias for backwards compat in tests/docs
export type TaskToolInstance = TaskToolSet;

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

const taskStatus = z.enum(["pending", "in_progress", "completed", "cancelled"]);

// ---------------------------------------------------------------------------
// Individual input schemas
// ---------------------------------------------------------------------------

const createInputSchema = z.object({
  title: z.string().describe("Task title"),
  description: z.string().optional().describe("Optional task description"),
  owner: z.string().optional().describe("Who this task is assigned to"),
});

const updateInputSchema = z.object({
  id: z.string().describe("Task ID to update"),
  status: taskStatus.optional().describe("New task status"),
  title: z.string().optional().describe("New task title"),
  description: z.string().optional().describe("New task description"),
  owner: z.string().optional().describe("Assign task to this owner"),
  add_blocks: z.array(z.string()).optional().describe("Task IDs that this task blocks (appended)"),
  add_blocked_by: z.array(z.string()).optional().describe("Task IDs that block this task (appended)"),
});

const getInputSchema = z.object({
  id: z.string().describe("Task ID to retrieve"),
});

const listInputSchema = z.object({
  status: taskStatus.optional().describe("Filter tasks by status"),
  owner: z.string().optional().describe("Filter tasks by owner"),
});

// ---------------------------------------------------------------------------
// Factory — returns a TaskToolSet with 4 tools + management helpers
// ---------------------------------------------------------------------------

export function createTaskTool(): TaskToolSet {
  const tasks = new Map<string, Task>();
  let nextId = 1;

  // ---- TaskCreate ----

  async function executeCreate(
    input: z.infer<typeof createInputSchema>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

    const id = `task-${nextId++}`;
    const now = new Date().toISOString();
    const task: Task = {
      id,
      title: input.title,
      description: input.description,
      status: "pending",
      owner: input.owner,
      createdAt: now,
      updatedAt: now,
    };
    tasks.set(id, task);
    return {
      content: `Created task ${id}: ${input.title}`,
      metadata: { task },
    };
  }

  // ---- TaskUpdate ----

  async function executeUpdate(
    input: z.infer<typeof updateInputSchema>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

    const existing = tasks.get(input.id);
    if (!existing) {
      return { content: `Error: task ${input.id} not found`, isError: true };
    }

    // Merge blocks/blockedBy arrays — append new entries, deduplicate
    const mergedBlocks = input.add_blocks
      ? [...new Set([...(existing.blocks ?? []), ...input.add_blocks])]
      : existing.blocks;
    const mergedBlockedBy = input.add_blocked_by
      ? [...new Set([...(existing.blockedBy ?? []), ...input.add_blocked_by])]
      : existing.blockedBy;

    const updated: Task = {
      ...existing,
      ...(input.status !== undefined && { status: input.status }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.owner !== undefined && { owner: input.owner }),
      ...(mergedBlocks !== undefined && { blocks: mergedBlocks }),
      ...(mergedBlockedBy !== undefined && { blockedBy: mergedBlockedBy }),
      updatedAt: new Date().toISOString(),
    };
    tasks.set(input.id, updated);

    const changedFields: string[] = [];
    if (input.status !== undefined) changedFields.push(`status to ${input.status}`);
    if (input.title !== undefined) changedFields.push(`title to "${input.title}"`);
    if (input.description !== undefined) changedFields.push(`description`);
    if (input.owner !== undefined) changedFields.push(`owner to "${input.owner}"`);
    if (input.add_blocks) changedFields.push(`blocks +${input.add_blocks.join(",")}`);
    if (input.add_blocked_by) changedFields.push(`blockedBy +${input.add_blocked_by.join(",")}`);

    return {
      content: `Updated task ${input.id}: ${changedFields.join(", ") || "no changes"}`,
      metadata: { task: updated },
    };
  }

  // ---- TaskGet ----

  async function executeGet(
    input: z.infer<typeof getInputSchema>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

    const task = tasks.get(input.id);
    if (!task) {
      return { content: `Error: task ${input.id} not found`, isError: true };
    }

    const lines: string[] = [
      `ID: ${task.id}`,
      `Title: ${task.title}`,
      `Status: ${task.status}`,
    ];
    if (task.description) lines.push(`Description: ${task.description}`);
    if (task.owner) lines.push(`Owner: ${task.owner}`);
    if (task.blocks && task.blocks.length > 0) lines.push(`Blocks: ${task.blocks.join(", ")}`);
    if (task.blockedBy && task.blockedBy.length > 0) lines.push(`Blocked by: ${task.blockedBy.join(", ")}`);
    lines.push(`Created: ${task.createdAt}`);
    lines.push(`Updated: ${task.updatedAt}`);

    return {
      content: lines.join("\n"),
      metadata: { task },
    };
  }

  // ---- TaskList ----

  async function executeList(
    input: z.infer<typeof listInputSchema>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

    let all = Array.from(tasks.values());
    if (input.status) {
      all = all.filter((t) => t.status === input.status);
    }
    if (input.owner) {
      all = all.filter((t) => t.owner === input.owner);
    }
    if (all.length === 0) {
      const qualifiers: string[] = [];
      if (input.status) qualifiers.push(`status "${input.status}"`);
      if (input.owner) qualifiers.push(`owner "${input.owner}"`);
      const qualifier = qualifiers.length > 0 ? ` with ${qualifiers.join(" and ")}` : "";
      return { content: `No tasks${qualifier}`, metadata: { tasks: [] } };
    }
    const lines = all.map(
      (t) => `[${t.status}] ${t.id}: ${t.title}${t.description ? ` — ${t.description}` : ""}${t.owner ? ` (${t.owner})` : ""}`,
    );
    return {
      content: lines.join("\n"),
      metadata: { tasks: all },
    };
  }

  // ---- Build the 4 tool definitions ----

  const taskCreate: ToolDefinition = {
    name: "TaskCreate",
    description: "Create a new task with a title, optional description, and optional owner.",
    inputSchema: createInputSchema,
    execute: executeCreate,
    isReadOnly: false,
    isDestructive: false,
    timeout: 5_000,
  };

  const taskUpdate: ToolDefinition = {
    name: "TaskUpdate",
    description:
      "Update an existing task — change status, title, description, owner, or add blocks/blockedBy dependencies.",
    inputSchema: updateInputSchema,
    execute: executeUpdate,
    isReadOnly: false,
    isDestructive: false,
    timeout: 5_000,
  };

  const taskGet: ToolDefinition = {
    name: "TaskGet",
    description: "Get full details of a single task including blocks and blockedBy relationships.",
    inputSchema: getInputSchema,
    execute: executeGet,
    isReadOnly: true,
    isDestructive: false,
    timeout: 5_000,
  };

  const taskList: ToolDefinition = {
    name: "TaskList",
    description: "List tasks, optionally filtered by status and/or owner.",
    inputSchema: listInputSchema,
    execute: executeList,
    isReadOnly: true,
    isDestructive: false,
    timeout: 5_000,
  };

  return {
    taskCreate,
    taskUpdate,
    taskGet,
    taskList,
    getTasks() {
      return Array.from(tasks.values());
    },
    clear() {
      tasks.clear();
      nextId = 1;
    },
  };
}
