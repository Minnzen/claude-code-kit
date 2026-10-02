import { describe, expect, it, vi } from 'vitest'
import { allowReadOnly, createPermissionHandler } from '../packages/agent/src/permission.ts'

describe('permission safety', () => {
  it('denies writes without an explicit approval route', async () => {
    const handler = createPermissionHandler({ autoApproveReadOnly: true })
    expect((await handler({ tool: 'Read', input: {}, isReadOnly: true })).decision).toBe('allow')
    expect((await handler({ tool: 'Write', input: {}, isReadOnly: false })).decision).toBe('deny')
    expect((await createPermissionHandler({})({ tool: 'Write', input: {} })).decision).toBe('deny')
  })

  it('lets explicit deny override allow, session and callback rules', async () => {
    const onPermission = vi.fn(async () => ({ decision: 'allow' as const }))
    const handler = createPermissionHandler({ alwaysAllow: ['Write'], alwaysDeny: ['Write'],
      sessionApproved: new Set(['Write']), autoApproveReadOnly: true, onPermission })
    expect((await handler({ tool: 'Write', input: {}, isReadOnly: true })).decision).toBe('deny')
    expect(onPermission).not.toHaveBeenCalled()
  })

  it.each(['isDestructive', 'requiresConfirmation'] as const)('does not auto approve read-only tools with %s', async flag => {
    const request = { tool: 'risky', input: {}, isReadOnly: true, [flag]: true }
    expect((await createPermissionHandler({ autoApproveReadOnly: true })(request)).decision).toBe('deny')
    expect((await allowReadOnly(request)).decision).toBe('deny')
  })

  it('allows explicit approval of writes and forwards risk metadata to callback', async () => {
    const request = { tool: 'Write', input: {}, isDestructive: true, requiresConfirmation: true }
    const onPermission = vi.fn(async () => ({ decision: 'allow' as const }))
    expect((await createPermissionHandler({ onPermission })(request)).decision).toBe('allow')
    expect(onPermission).toHaveBeenCalledWith(request)
    expect((await createPermissionHandler({ alwaysAllow: ['Write'] })(request)).decision).toBe('allow')
  })
})

it('marks only default no-approval denials as eligible for an interactive prompt', async () => {
  const request = { tool: 'Write', input: {}, isReadOnly: false }
  expect((await allowReadOnly(request)).approvalRequired).toBe(true)
  expect((await createPermissionHandler({})(request)).approvalRequired).toBe(true)
  expect((await createPermissionHandler({ alwaysDeny: ['Write'] })(request)).approvalRequired).toBe(false)
  expect((await createPermissionHandler({ onPermission: async () => ({ decision: 'deny' }) })(request)).approvalRequired).not.toBe(true)
})
