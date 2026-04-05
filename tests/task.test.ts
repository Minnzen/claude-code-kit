import { describe, expect, it, beforeEach } from 'vitest'
import { createTaskTool } from '../packages/tools/src/task.ts'
import type { TaskToolSet } from '../packages/tools/src/task.ts'
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

describe('taskTool (4-tool split)', () => {
  let ts: TaskToolSet
  let create: ToolDefinition
  let update: ToolDefinition
  let get: ToolDefinition
  let list: ToolDefinition

  beforeEach(() => {
    ts = createTaskTool()
    create = ts.taskCreate
    update = ts.taskUpdate
    get = ts.taskGet
    list = ts.taskList
  })

  // ---- tool names ----

  it('each tool has the correct PascalCase name', () => {
    expect(create.name).toBe('TaskCreate')
    expect(update.name).toBe('TaskUpdate')
    expect(get.name).toBe('TaskGet')
    expect(list.name).toBe('TaskList')
  })

  // ---- create ----

  it('creates a task with title only', async () => {
    const result = await create.execute({ title: 'Write tests' }, makeCtx())

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
    const result = await create.execute(
      { title: 'Deploy', description: 'Push to prod' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.description).toBe('Push to prod')
  })

  it('creates a task with owner', async () => {
    const result = await create.execute(
      { title: 'Review', owner: 'alice' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.owner).toBe('alice')
  })

  it('auto-increments task IDs', async () => {
    await create.execute({ title: 'First' }, makeCtx())
    const r2 = await create.execute({ title: 'Second' }, makeCtx())
    expect(r2.content).toContain('task-2')
  })

  // ---- list ----

  it('returns empty message when no tasks exist', async () => {
    const result = await list.execute({}, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toBe('No tasks')
    expect(result.metadata?.tasks).toEqual([])
  })

  it('lists all tasks', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())

    const result = await list.execute({}, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('task-1')
    expect(result.content).toContain('task-2')
    expect(result.content).toContain('[pending]')
  })

  it('filters tasks by status', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())
    await update.execute({ id: 'task-1', status: 'completed' }, makeCtx())

    const completed = await list.execute({ status: 'completed' }, makeCtx())
    expect(completed.isError).toBeFalsy()
    expect(completed.content).toContain('task-1')
    expect(completed.content).not.toContain('task-2')
    const tasks = completed.metadata?.tasks as unknown[]
    expect(tasks).toHaveLength(1)

    const pending = await list.execute({ status: 'pending' }, makeCtx())
    expect(pending.content).toContain('task-2')
    expect(pending.content).not.toContain('task-1')
  })

  it('filters tasks by owner', async () => {
    await create.execute({ title: 'A', owner: 'alice' }, makeCtx())
    await create.execute({ title: 'B', owner: 'bob' }, makeCtx())

    const alice = await list.execute({ owner: 'alice' }, makeCtx())
    expect(alice.content).toContain('task-1')
    expect(alice.content).not.toContain('task-2')
  })

  it('returns descriptive empty message when filtering by status', async () => {
    const result = await list.execute({ status: 'cancelled' }, makeCtx())
    expect(result.content).toContain('cancelled')
    expect(result.metadata?.tasks).toEqual([])
  })

  // ---- update ----

  it('updates task status', async () => {
    await create.execute({ title: 'Work' }, makeCtx())
    const result = await update.execute(
      { id: 'task-1', status: 'in_progress' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('in_progress')
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.status).toBe('in_progress')
  })

  it('supports all status transitions', async () => {
    await create.execute({ title: 'X' }, makeCtx())

    for (const status of ['in_progress', 'completed', 'cancelled', 'pending'] as const) {
      const r = await update.execute({ id: 'task-1', status }, makeCtx())
      expect(r.isError).toBeFalsy()
      const task = r.metadata?.task as Record<string, unknown>
      expect(task.status).toBe(status)
    }
  })

  it('updates task title', async () => {
    await create.execute({ title: 'Old title' }, makeCtx())
    const result = await update.execute(
      { id: 'task-1', title: 'New title' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('title')
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.title).toBe('New title')
    expect(task.status).toBe('pending')
  })

  it('updates task description', async () => {
    await create.execute({ title: 'Task' }, makeCtx())
    const result = await update.execute(
      { id: 'task-1', description: 'Added description' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.description).toBe('Added description')
  })

  it('updates task owner', async () => {
    await create.execute({ title: 'Task' }, makeCtx())
    const result = await update.execute(
      { id: 'task-1', owner: 'bob' },
      makeCtx(),
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('owner')
    const task = result.metadata?.task as Record<string, unknown>
    expect(task.owner).toBe('bob')
  })

  it('updates multiple fields at once', async () => {
    await create.execute({ title: 'Old' }, makeCtx())
    const result = await update.execute(
      {
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
    await create.execute({ title: 'Original' }, makeCtx())

    const listResult = await list.execute({}, makeCtx())
    const beforeUpdate = (listResult.metadata?.tasks as Record<string, unknown>[])[0]

    await update.execute(
      { id: 'task-1', status: 'completed' },
      makeCtx(),
    )

    expect(beforeUpdate.status).toBe('pending')
  })

  it('returns error when updating non-existent task', async () => {
    const result = await update.execute(
      { id: 'task-999', status: 'completed' },
      makeCtx(),
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('task-999')
    expect(result.content).toContain('not found')
  })

  // ---- get ----

  it('gets a single task with full details', async () => {
    await create.execute({ title: 'My task', description: 'desc', owner: 'alice' }, makeCtx())
    const result = await get.execute({ id: 'task-1' }, makeCtx())

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('task-1')
    expect(result.content).toContain('My task')
    expect(result.content).toContain('desc')
    expect(result.content).toContain('alice')
    expect(result.metadata?.task).toMatchObject({ id: 'task-1', title: 'My task' })
  })

  it('get includes blocks and blockedBy', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())
    await update.execute({ id: 'task-1', add_blocks: ['task-2'] }, makeCtx())
    await update.execute({ id: 'task-1', add_blocked_by: ['task-2'] }, makeCtx())

    const result = await get.execute({ id: 'task-1' }, makeCtx())
    expect(result.content).toContain('Blocks: task-2')
    expect(result.content).toContain('Blocked by: task-2')
  })

  it('returns error when getting non-existent task', async () => {
    const result = await get.execute({ id: 'task-999' }, makeCtx())

    expect(result.isError).toBe(true)
    expect(result.content).toContain('task-999')
    expect(result.content).toContain('not found')
  })

  // ---- blocks / blockedBy ----

  it('add_blocks appends to blocks array', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())
    await create.execute({ title: 'C' }, makeCtx())

    await update.execute({ id: 'task-1', add_blocks: ['task-2'] }, makeCtx())
    const r = await update.execute({ id: 'task-1', add_blocks: ['task-3'] }, makeCtx())

    const task = r.metadata?.task as Record<string, unknown>
    expect(task.blocks).toEqual(['task-2', 'task-3'])
  })

  it('add_blocked_by appends to blockedBy array', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())

    const r = await update.execute({ id: 'task-1', add_blocked_by: ['task-2'] }, makeCtx())
    const task = r.metadata?.task as Record<string, unknown>
    expect(task.blockedBy).toEqual(['task-2'])
  })

  it('deduplicates blocks entries', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())

    await update.execute({ id: 'task-1', add_blocks: ['task-2'] }, makeCtx())
    const r = await update.execute({ id: 'task-1', add_blocks: ['task-2'] }, makeCtx())

    const task = r.metadata?.task as Record<string, unknown>
    expect(task.blocks).toEqual(['task-2'])
  })

  // ---- schema validation ----

  it('rejects create without title via schema', () => {
    const parsed = create.inputSchema.safeParse({})
    expect(parsed.success).toBe(false)
  })

  it('rejects update with invalid status via schema', () => {
    const parsed = update.inputSchema.safeParse({
      id: 'task-1',
      status: 'invalid_status',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts update with only title (no status)', () => {
    const parsed = update.inputSchema.safeParse({
      id: 'task-1',
      title: 'New title',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts list with status filter', () => {
    const parsed = list.inputSchema.safeParse({ status: 'completed' })
    expect(parsed.success).toBe(true)
  })

  it('rejects list with invalid status filter', () => {
    const parsed = list.inputSchema.safeParse({ status: 'bogus' })
    expect(parsed.success).toBe(false)
  })

  // ---- state isolation ----

  it('each createTaskTool call returns independent state', async () => {
    const ts2 = createTaskTool()

    await create.execute({ title: 'In tool 1' }, makeCtx())
    const list1 = await list.execute({}, makeCtx())
    const list2 = await ts2.taskList.execute({}, makeCtx())

    expect(list1.content).toContain('In tool 1')
    expect(list2.content).toBe('No tasks')
  })

  // ---- metadata flags ----

  it('create/update are not read-only; get/list are read-only', () => {
    expect(create.isReadOnly).toBe(false)
    expect(update.isReadOnly).toBe(false)
    expect(get.isReadOnly).toBe(true)
    expect(list.isReadOnly).toBe(true)
  })

  it('none are destructive', () => {
    expect(create.isDestructive).toBe(false)
    expect(update.isDestructive).toBe(false)
    expect(get.isDestructive).toBe(false)
    expect(list.isDestructive).toBe(false)
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

    const result = await list.execute({}, ctx)
    expect(result.isError).toBe(true)
    expect(result.content).toBe('Aborted')
  })

  // ---- getTasks / clear helpers ----

  it('getTasks returns all tasks as an array', async () => {
    expect(ts.getTasks()).toEqual([])

    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())

    const tasks = ts.getTasks()
    expect(tasks).toHaveLength(2)
    expect(tasks[0].title).toBe('A')
    expect(tasks[1].title).toBe('B')
  })

  it('clear removes all tasks and resets ID counter', async () => {
    await create.execute({ title: 'A' }, makeCtx())
    await create.execute({ title: 'B' }, makeCtx())

    ts.clear()

    expect(ts.getTasks()).toEqual([])

    const result = await create.execute({ title: 'After clear' }, makeCtx())
    expect(result.content).toContain('task-1')
  })
})
