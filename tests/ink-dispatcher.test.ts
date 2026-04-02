import { expect, test } from 'vitest'
import { Dispatcher } from '../packages/ink-renderer/src/events/dispatcher.ts'
import {
  TerminalEvent,
  type EventTarget,
} from '../packages/ink-renderer/src/events/terminal-event.ts'

function createNode(
  parentNode: EventTarget | undefined,
  handlers: Record<string, unknown>,
): EventTarget {
  return {
    parentNode,
    _eventHandlers: handlers,
  }
}

test('dispatcher runs capture and bubble listeners in DOM-style order', () => {
  const calls: string[] = []

  const root = createNode(undefined, {
    onFocusCapture: (event: TerminalEvent) => calls.push(`root:${event.eventPhase}`),
    onFocus: (event: TerminalEvent) => calls.push(`root:${event.eventPhase}`),
  })
  const parent = createNode(root, {
    onFocusCapture: (event: TerminalEvent) => calls.push(`parent:${event.eventPhase}`),
    onFocus: (event: TerminalEvent) => calls.push(`parent:${event.eventPhase}`),
  })
  const target = createNode(parent, {
    onFocusCapture: (event: TerminalEvent) => calls.push(`target-capture:${event.eventPhase}`),
    onFocus: (event: TerminalEvent) => calls.push(`target-bubble:${event.eventPhase}`),
  })

  const dispatcher = new Dispatcher()
  const event = new TerminalEvent('focus')

  expect(dispatcher.dispatch(target, event)).toBe(true)
  expect(calls).toEqual([
    'root:capturing',
    'parent:capturing',
    'target-capture:at_target',
    'target-bubble:at_target',
    'parent:bubbling',
    'root:bubbling',
  ])
  expect(event.eventPhase).toBe('none')
  expect(event.currentTarget).toBe(null)
})

test('stopPropagation on the target still allows the target bubble handler', () => {
  const calls: string[] = []

  const parent = createNode(undefined, {
    onFocus: () => calls.push('parent:bubble'),
  })
  const target = createNode(parent, {
    onFocusCapture: (event: TerminalEvent) => {
      calls.push('target:capture')
      event.stopPropagation()
    },
    onFocus: () => calls.push('target:bubble'),
  })

  const dispatcher = new Dispatcher()
  dispatcher.dispatch(target, new TerminalEvent('focus'))

  expect(calls).toEqual(['target:capture', 'target:bubble'])
})

test('dispatch returns false when a handler prevents the default action', () => {
  const target = createNode(undefined, {
    onClick: (event: TerminalEvent) => event.preventDefault(),
  })

  const dispatcher = new Dispatcher()
  expect(dispatcher.dispatch(target, new TerminalEvent('click'))).toBe(false)
})
