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
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Return type for createTaskTool — tool + management helpers
// ---------------------------------------------------------------------------

export interface TaskToolInstance {
  tool: ToolDefinition;
  /** Return a snapshot of all tasks (order matches insertion order). */
  getTasks(): Task[];
  /** Remove all tasks and reset the ID counter. */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Input schema — discriminated union on `action`
// ---------------------------------------------------------------------------

const taskStatus = z.enum(["pending", "in_progress", "completed", "cancelled"]);

const createAction = z.object({
  action: z.literal("create"),
  title: z.string().describe("Task title"),
  description: z.string().optional().describe("Optional task description"),
});

const updateAction = z.object({
  action: z.literal("update"),
  id: z.string().describe("Task ID to update"),
  status: taskStatus.optional().describe("New task status"),
  title: z.string().optional().describe("New task title"),
  description: z.string().optional().describe("New task description"),
});

const listAction = z.object({
  action: z.literal("list"),
  status: taskStatus.optional().describe("Filter tasks by status"),
});

const deleteAction = z.object({
  action: z.literal("delete"),
  id: z.string().describe("Task ID to delete"),
});

export const inputSchema = z.discriminatedUnion("action", [
  createAction,
  updateAction,
  listAction,
  deleteAction,
]);

type Input = z.infer<typeof inputSchema>;

// ---------------------------------------------------------------------------
// Factory — returns a TaskToolInstance with tool + management helpers
// ---------------------------------------------------------------------------

export function createTaskTool(): TaskToolInstance {
  const tasks = new Map<string, Task>();
  let nextId = 1;

  async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) return { content: "Aborted", isError: true };

    switch (input.action) {
      case "create": {
        const id = `task-${nextId++}`;
        const now = new Date().toISOString();
        const task: Task = {
          id,
          title: input.title,
          description: input.description,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        tasks.set(id, task);
        return {
          content: `Created task ${id}: ${input.title}`,
          metadata: { task },
        };
      }

      case "update": {
        const existing = tasks.get(input.id);
        if (!existing) {
          return { content: `Error: task ${input.id} not found`, isError: true };
        }
        // Build an immutable update — only overwrite fields that were provided
        const updated: Task = {
          ...existing,
          ...(input.status !== undefined && { status: input.status }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          updatedAt: new Date().toISOString(),
        };
        tasks.set(input.id, updated);

        const changedFields: string[] = [];
        if (input.status !== undefined) changedFields.push(`status to ${input.status}`);
        if (input.title !== undefined) changedFields.push(`title to "${input.title}"`);
        if (input.description !== undefined) changedFields.push(`description`);

        return {
          content: `Updated task ${input.id}: ${changedFields.join(", ") || "no changes"}`,
          metadata: { task: updated },
        };
      }

      case "list": {
        let all = Array.from(tasks.values());
        if (input.status) {
          all = all.filter((t) => t.status === input.status);
        }
        if (all.length === 0) {
          const qualifier = input.status ? ` with status "${input.status}"` : "";
          return { content: `No tasks${qualifier}`, metadata: { tasks: [] } };
        }
        const lines = all.map(
          (t) => `[${t.status}] ${t.id}: ${t.title}${t.description ? ` — ${t.description}` : ""}`,
        );
        return {
          content: lines.join("\n"),
          metadata: { tasks: all },
        };
      }

      case "delete": {
        if (!tasks.has(input.id)) {
          return { content: `Error: task ${input.id} not found`, isError: true };
        }
        tasks.delete(input.id);
        return { content: `Deleted task ${input.id}` };
      }
    }
  }

  const tool: ToolDefinition<Input> = {
    name: "Task",
    description:
      "Manage an in-memory task list. Supports create, update (status/title/description), list (with optional status filter), and delete actions.",
    inputSchema,
    execute,
    isReadOnly: false,
    isDestructive: false,
    timeout: 5_000,
  };

  return {
    tool,
    getTasks() {
      return Array.from(tasks.values());
    },
    clear() {
      tasks.clear();
      nextId = 1;
    },
  };
}
