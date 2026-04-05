import { describe, expect, it, beforeEach } from 'vitest'
import { createTaskTool } from '../packages/tools/src/task.ts'
import type { TaskToolInstance } from '../packages/tools/src/task.ts'
import type { ToolContext, ToolDefinition } from '../packages/agent/src/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): ToolContext {
  return {
    workingDirectory: '/tmp',
    abortSignal: new AbortController().signal,
    env: {},
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('taskTool', () => {
  let instance: TaskToolInstance
  let tool: ToolDefinition

  beforeEach(() => {
    instance = createTaskTool()
    tool = instance.tool
  })

  // ---- create ----

  it('creates a task with title only', async () => {
    const result = await tool.execute(
      { action: 'create', title: 'Write tests' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('task-1')
    expect(result.content).toContain('Write tests')
    expect(result.metadata?.task).toMatchObject({
      id: 'task-1',
      title: 'Write tests',
      status: 'pending',
    })
  })

  it('creates a task with description', async () => {
    const result = await tool.execute(
      { action: 'create', title: 'Deploy', description: 'Push to prod' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.description).toBe('Push to prod')
  })

  it('auto-increments task IDs', async () => {
    await tool.execute({ action: 'create', title: 'First' }, makeCtx())
    const r2 = await tool.execute({ action: 'create', title: 'Second' }, makeCtx())

    expect(r2.content).toContain('task-2')
  })

  // ---- list ----

  it('returns empty message when no tasks exist', async () => {
    const result = await tool.execute({ action: 'list' }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('No tasks')
    expect(result.metadata?.tasks).toEqual([])
  })

  it('lists all tasks', async () => {
    await tool.execute({ action: 'create', title: 'A' }, makeCtx())
    await tool.execute({ action: 'create', title: 'B' }, makeCtx())

    const result = await tool.execute({ action: 'list' }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('task-1')
    expect(result.content).toContain('task-2')
    expect(result.content).toContain('[pending]')
  })

  it('filters tasks by status', async () => {
    await tool.execute({ action: 'create', title: 'A' }, makeCtx())
    await tool.execute({ action: 'create', title: 'B' }, makeCtx())
    await tool.execute(
      { action: 'update', id: 'task-1', status: 'completed' },
      makeCtx(),
    )

    const completed = await tool.execute(
      { action: 'list', status: 'completed' },
      makeCtx(),
    )
    expect(completed.isError).toBeFalsy()
    expect(completed.content).toContain('task-1')
    expect(completed.content).not.toContain('task-2')
    const tasks = completed.metadata?.tasks as unknown[]
    expect(tasks).toHaveLength(1)

    const pending = await tool.execute(
      { action: 'list', status: 'pending' },
      makeCtx(),
    )
    expect(pending.content).toContain('task-2')
    expect(pending.content).not.toContain('task-1')
  })

  it('returns descriptive empty message when filtering by status', async () => {
    const result = await tool.execute(
      { action: 'list', status: 'cancelled' },
      makeCtx(),
    )

    expect(result.content).toContain('cancelled')
    expect(result.metadata?.tasks).toEqual([])
  })

  // ---- update ----

  it('updates task status', async () => {
    await tool.execute({ action: 'create', title: 'Work' }, makeCtx())
    const result = await tool.execute(
      { action: 'update', id: 'task-1', status: 'in_progress' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('in_progress')
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.status).toBe('in_progress')
  })

  it('supports all status transitions', async () => {
    await tool.execute({ action: 'create', title: 'X' }, makeCtx())

    for (const status of ['in_progress', 'completed', 'cancelled', 'pending'] as const) {
      const r = await tool.execute(
        { action: 'update', id: 'task-1', status },
        makeCtx(),
      )
      expect(r.isError).toBeFalsy()
      const task = r.metadata?.task as Record<string, unknown>
      expect(task.status).toBe(status)
    }
  })

  it('updates task title', async () => {
    await tool.execute({ action: 'create', title: 'Old title' }, makeCtx())
    const result = await tool.execute(
      { action: 'update', id: 'task-1', title: 'New title' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('title')
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.title).toBe('New title')
    // status should remain unchanged
    expect(task.status).toBe('pending')
  })

  it('updates task description', async () => {
    await tool.execute({ action: 'create', title: 'Task' }, makeCtx())
    const result = await tool.execute(
      { action: 'update', id: 'task-1', description: 'Added description' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.description).toBe('Added description')
  })

  it('updates multiple fields at once', async () => {
    await tool.execute({ action: 'create', title: 'Old' }, makeCtx())
    const result = await tool.execute(
      {
        action: 'update',
        id: 'task-1',
        title: 'New',
        status: 'in_progress',
        description: 'Details',
      },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.title).toBe('New')
    expect(task.status).toBe('in_progress')
    expect(task.description).toBe('Details')
  })

  it('does not mutate the previous task object in the Map', async () => {
    await tool.execute({ action: 'create', title: 'Original' }, makeCtx())

    // Grab a reference to the task object via metadata
    const createResult = await tool.execute(
      { action: 'list' },
      makeCtx(),
    )
    const beforeUpdate = (createResult.metadata?.tasks as Record<string, unknown>[])[0]

    // Perform an update
    await tool.execute(
      { action: 'update', id: 'task-1', status: 'completed' },
      makeCtx(),
    )

    // The snapshot from before the update should be unaffected
    expect(beforeUpdate.status).toBe('pending')
  })

  it('returns error when updating non-existent task', async () => {
    const result = await tool.execute(
      { action: 'update', id: 'task-999', status: 'completed' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('task-999')
    expect(result.content).toContain('not found')
  })

  // ---- delete ----

  it('deletes an existing task', async () => {
    await tool.execute({ action: 'create', title: 'Gone' }, makeCtx())
    const result = await tool.execute(
      { action: 'delete', id: 'task-1' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('Deleted')

    // Verify it no longer appears in list
    const list = await tool.execute({ action: 'list' }, makeCtx())
    expect(list.content).toBe('No tasks')
  })

  it('returns error when deleting non-existent task', async () => {
    const result = await tool.execute(
      { action: 'delete', id: 'task-42' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('task-42')
    expect(result.content).toContain('not found')
  })

  // ---- schema validation ----

  it('rejects invalid action via schema', () => {
    const parsed = tool.inputSchema.safeParse({ action: 'bogus' })
    expect(parsed.success).toBe(false)
  })

  it('rejects create without title via schema', () => {
    const parsed = tool.inputSchema.safeParse({ action: 'create' })
    expect(parsed.success).toBe(false)
  })

  it('rejects update with invalid status via schema', () => {
    const parsed = tool.inputSchema.safeParse({
      action: 'update',
      id: 'task-1',
      status: 'invalid_status',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts update with only title (no status)', () => {
    const parsed = tool.inputSchema.safeParse({
      action: 'update',
      id: 'task-1',
      title: 'New title',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts list with status filter', () => {
    const parsed = tool.inputSchema.safeParse({
      action: 'list',
      status: 'completed',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects list with invalid status filter', () => {
    const parsed = tool.inputSchema.safeParse({
      action: 'list',
      status: 'bogus',
    })
    expect(parsed.success).toBe(false)
  })

  // ---- state isolation ----

  it('each createTaskTool call returns independent state', async () => {
    const instance2 = createTaskTool()

    await tool.execute({ action: 'create', title: 'In tool 1' }, makeCtx())
    const list1 = await tool.execute({ action: 'list' }, makeCtx())
    const list2 = await instance2.tool.execute({ action: 'list' }, makeCtx())

    expect(list1.content).toContain('In tool 1')
    expect(list2.content).toBe('No tasks')
  })

  // ---- metadata flags ----

  it('is not read-only', () => {
    expect(tool.isReadOnly).toBe(false)
  })

  it('is not destructive', () => {
    expect(tool.isDestructive).toBe(false)
  })

  // ---- abort ----

  it('returns aborted when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const ctx: ToolContext = {
      workingDirectory: '/tmp',
      abortSignal: controller.signal,
      env: {},
    }

    const result = await tool.execute({ action: 'list' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.content).toBe('Aborted')
  })

  // ---- getTasks / clear helpers ----

  it('getTasks returns all tasks as an array', async () => {
    expect(instance.getTasks()).toEqual([])

    await tool.execute({ action: 'create', title: 'A' }, makeCtx())
    await tool.execute({ action: 'create', title: 'B' }, makeCtx())

    const tasks = instance.getTasks()
    expect(tasks).toHaveLength(2)
    expect(tasks[0].title).toBe('A')
    expect(tasks[1].title).toBe('B')
  })

  it('clear removes all tasks and resets ID counter', async () => {
    await tool.execute({ action: 'create', title: 'A' }, makeCtx())
    await tool.execute({ action: 'create', title: 'B' }, makeCtx())

    instance.clear()

    expect(instance.getTasks()).toEqual([])

    // ID counter should be reset
    const result = await tool.execute(
      { action: 'create', title: 'After clear' },
      makeCtx(),
    )
    expect(result.content).toContain('task-1')
  })
})
