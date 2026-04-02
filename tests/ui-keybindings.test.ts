import { expect, test } from 'vitest'
import type { Key } from '../packages/ink-renderer/src/events/input-event.ts'
import {
  chordToDisplayString,
  parseBindings,
  parseChord,
  parseKeystroke,
} from '../packages/ui/src/keybindings/parser.ts'
import {
  resolveKey,
  resolveKeyWithChordState,
} from '../packages/ui/src/keybindings/resolver.ts'

const EMPTY_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  wheelUp: false,
  wheelDown: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  fn: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
}

function makeKey(partial: Partial<Key>): Key {
  return { ...EMPTY_KEY, ...partial }
}

test('parseKeystroke normalizes aliases and platform display text', () => {
  expect(parseKeystroke('cmd+opt+↑')).toEqual({
    key: 'up',
    ctrl: false,
    alt: true,
    shift: false,
    meta: false,
    super: true,
  })

  expect(chordToDisplayString(parseChord('cmd+opt+space'), 'macos')).toBe(
    'opt+cmd+Space',
  )
})

test('resolveKey uses the last matching binding as the winner', () => {
  const bindings = parseBindings([
    {
      context: 'Global',
      bindings: { 'ctrl+k': 'app:quickOpen' },
    },
    {
      context: 'Global',
      bindings: { 'ctrl+k': 'app:toggleTranscript' },
    },
  ])

  expect(
    resolveKey('k', makeKey({ ctrl: true }), ['Global'], bindings),
  ).toEqual({ type: 'match', action: 'app:toggleTranscript' })
})

test('resolveKeyWithChordState prefers longer chords over single-key matches', () => {
  const bindings = parseBindings([
    {
      context: 'Global',
      bindings: {
        'ctrl+k': 'app:quickOpen',
        'ctrl+k ctrl+s': 'app:toggleTranscript',
      },
    },
  ])

  const first = resolveKeyWithChordState(
    'k',
    makeKey({ ctrl: true }),
    ['Global'],
    bindings,
    null,
  )

  expect(first).toEqual({
    type: 'chord_started',
    pending: parseChord('ctrl+k'),
  })

  expect(
    resolveKeyWithChordState(
      's',
      makeKey({ ctrl: true }),
      ['Global'],
      bindings,
      first.pending,
    ),
  ).toEqual({ type: 'match', action: 'app:toggleTranscript' })
})
