/**
 * Setup utilities for integrating KeybindingProvider into the app.
 *
 * Loads both default bindings and user-defined bindings from
 * ~/.claude/keybindings.json, with hot-reload support when the file changes.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { InputEvent } from '@claude-code-kit/ink-renderer'
import { type Key, useInput } from '@claude-code-kit/ink-renderer'
import { KeybindingProvider } from './KeybindingContext'
import {
  initializeKeybindingWatcher,
  type KeybindingsLoadResult,
  loadKeybindingsSyncWithWarnings,
  subscribeToKeybindingChanges,
} from './loadUserBindings'
import { resolveKeyWithChordState } from './resolver'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from './types'

const plural = (n: number, s: string): string => (n === 1 ? s : s + 's')
function logForDebugging(msg: string): void {
  if (process.env.DEBUG_KEYBINDINGS) console.error(msg)
}

/**
 * Timeout for chord sequences in milliseconds.
 * If the user doesn't complete the chord within this time, it's cancelled.
 */
const CHORD_TIMEOUT_MS = 1000

type Props = {
  children: React.ReactNode
  /** Optional callback invoked when keybinding warnings are present */
  onWarnings?: (message: string, isError: boolean) => void
}

/**
 * Keybinding provider with default + user bindings and hot-reload support.
 *
 * Usage: Wrap your app with this provider to enable keybinding support.
 *
 * ```tsx
 * <KeybindingSetup>
 *   <App ... />
 * </KeybindingSetup>
 * ```
 *
 * Features:
 * - Loads default bindings from code
 * - Merges with user bindings from ~/.claude/keybindings.json
 * - Watches for file changes and reloads automatically (hot-reload)
 * - User bindings override defaults (later entries win)
 * - Chord support with automatic timeout
 */
export function KeybindingSetup({ children, onWarnings }: Props): React.ReactNode {
  // Load bindings synchronously for initial render
  const [{ bindings, warnings }, setLoadResult] = useState<KeybindingsLoadResult>(() => {
    const result = loadKeybindingsSyncWithWarnings()
    logForDebugging(
      `[keybindings] KeybindingSetup initialized with ${result.bindings.length} bindings, ${result.warnings.length} warnings`,
    )
    return result
  })

  // Track if this is a reload (not initial load)
  const [isReload, setIsReload] = useState(false)

  // Notify consumer about warnings
  useEffect(() => {
    if (!onWarnings || warnings.length === 0) return
    const errorCount = warnings.filter(w => w.severity === 'error').length
    const warnCount = warnings.filter(w => w.severity === 'warning').length
    let message: string
    if (errorCount > 0 && warnCount > 0) {
      message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')} and ${warnCount} ${plural(warnCount, 'warning')}`
    } else if (errorCount > 0) {
      message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')}`
    } else {
      message = `Found ${warnCount} keybinding ${plural(warnCount, 'warning')}`
    }
    onWarnings(message + ' · /doctor for details', errorCount > 0)
  }, [warnings, isReload, onWarnings])

  // Chord state management - use ref for immediate access, state for re-renders
  const pendingChordRef = useRef<ParsedKeystroke[] | null>(null)
  const [pendingChord, setPendingChordState] = useState<ParsedKeystroke[] | null>(null)
  const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Handler registry for action callbacks (used by ChordInterceptor)
  const handlerRegistryRef = useRef(
    new Map<
      string,
      Set<{
        action: string
        context: KeybindingContextName
        handler: () => void
      }>
    >(),
  )

  // Active context tracking for keybinding priority resolution
  const activeContextsRef = useRef<Set<KeybindingContextName>>(new Set())
  const registerActiveContext = useCallback((context: KeybindingContextName) => {
    activeContextsRef.current.add(context)
  }, [])
  const unregisterActiveContext = useCallback(
    (context: KeybindingContextName) => {
      activeContextsRef.current.delete(context)
    },
    [],
  )

  const clearChordTimeout = useCallback(() => {
    if (chordTimeoutRef.current) {
      clearTimeout(chordTimeoutRef.current)
      chordTimeoutRef.current = null
    }
  }, [])

  const setPendingChord = useCallback(
    (pending: ParsedKeystroke[] | null) => {
      clearChordTimeout()
      if (pending !== null) {
        chordTimeoutRef.current = setTimeout(() => {
          logForDebugging('[keybindings] Chord timeout - cancelling')
          pendingChordRef.current = null
          setPendingChordState(null)
        }, CHORD_TIMEOUT_MS)
      }

      pendingChordRef.current = pending
      setPendingChordState(pending)
    },
    [clearChordTimeout],
  )

  useEffect(() => {
    void initializeKeybindingWatcher()

    const unsubscribe = subscribeToKeybindingChanges(result => {
      setIsReload(true)
      setLoadResult(result)
      logForDebugging(
        `[keybindings] Reloaded: ${result.bindings.length} bindings, ${result.warnings.length} warnings`,
      )
    })
    return () => {
      unsubscribe()
      clearChordTimeout()
    }
  }, [clearChordTimeout])

  return (
    <KeybindingProvider
      bindings={bindings}
      pendingChordRef={pendingChordRef}
      pendingChord={pendingChord}
      setPendingChord={setPendingChord}
      activeContexts={activeContextsRef.current}
      registerActiveContext={registerActiveContext}
      unregisterActiveContext={unregisterActiveContext}
      handlerRegistryRef={handlerRegistryRef}
    >
      <ChordInterceptor
        bindings={bindings}
        pendingChordRef={pendingChordRef}
        setPendingChord={setPendingChord}
        activeContexts={activeContextsRef.current}
        handlerRegistryRef={handlerRegistryRef}
      />
      {children}
    </KeybindingProvider>
  )
}

type HandlerRegistration = {
  action: string
  context: KeybindingContextName
  handler: () => void
}

type ChordInterceptorProps = {
  bindings: ParsedBinding[]
  pendingChordRef: React.RefObject<ParsedKeystroke[] | null>
  setPendingChord: (pending: ParsedKeystroke[] | null) => void
  activeContexts: Set<KeybindingContextName>
  handlerRegistryRef: React.RefObject<Map<string, Set<HandlerRegistration>>>
}

/**
 * Global chord interceptor that registers useInput FIRST (before children).
 *
 * This component intercepts keystrokes that are part of chord sequences and
 * stops propagation before other handlers (like PromptInput) can see them.
 */
function ChordInterceptor({
  bindings,
  pendingChordRef,
  setPendingChord,
  activeContexts,
  handlerRegistryRef,
}: ChordInterceptorProps): null {
  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      if ((key.wheelUp || key.wheelDown) && pendingChordRef.current === null) {
        return
      }

      const registry = handlerRegistryRef.current
      const handlerContexts = new Set<KeybindingContextName>()
      if (registry) {
        for (const handlers of registry.values()) {
          for (const registration of handlers) {
            handlerContexts.add(registration.context)
          }
        }
      }

      const contexts = [
        ...handlerContexts,
        ...activeContexts,
        'Global' as const,
      ]
      const wasInChord = pendingChordRef.current !== null
      const result = resolveKeyWithChordState(
        input,
        key,
        contexts,
        bindings,
        pendingChordRef.current,
      )

      switch (result.type) {
        case 'chord_started':
          setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break
        case 'match':
          setPendingChord(null)
          if (wasInChord) {
            const contextsSet = new Set(contexts)
            if (registry) {
              const handlers = registry.get(result.action)
              if (handlers && handlers.size > 0) {
                for (const registration of handlers) {
                  if (contextsSet.has(registration.context)) {
                    registration.handler()
                    event.stopImmediatePropagation()
                    break
                  }
                }
              }
            }
          }
          break
        case 'chord_cancelled':
          setPendingChord(null)
          event.stopImmediatePropagation()
          break
        case 'unbound':
          setPendingChord(null)
          event.stopImmediatePropagation()
          break
        case 'none':
          break
      }
    },
    [bindings, pendingChordRef, setPendingChord, activeContexts, handlerRegistryRef],
  )

  useInput(handleInput)
  return null
}
