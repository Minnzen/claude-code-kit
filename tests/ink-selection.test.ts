import { expect, test } from 'vitest'
import {
  createSelectionState,
  finishSelection,
  getSelectedText,
  hasSelection,
  selectWordAt,
  selectionBounds,
  startSelection,
  updateSelection,
} from '../packages/ink-renderer/src/selection.ts'
import {
  CellWidth,
  CharPool,
  HyperlinkPool,
  StylePool,
  createScreen,
  setCellAt,
} from '../packages/ink-renderer/src/screen.ts'

function createSingleLineScreen(text: string) {
  const styles = new StylePool()
  const screen = createScreen(
    text.length,
    1,
    styles,
    new CharPool(),
    new HyperlinkPool(),
  )

  for (let col = 0; col < text.length; col++) {
    setCellAt(screen, col, 0, {
      char: text[col]!,
      styleId: screen.emptyStyleId,
      width: CellWidth.Narrow,
      hyperlink: undefined,
    })
  }

  return screen
}

test('bare click and first-cell drag tremor do not create a selection', () => {
  const selection = createSelectionState()

  startSelection(selection, 2, 0)
  updateSelection(selection, 2, 0)
  finishSelection(selection)

  expect(hasSelection(selection)).toBe(false)
  expect(selectionBounds(selection)).toBe(null)
})

test('selectWordAt keeps path-style words together for copy', () => {
  const screen = createSingleLineScreen('cd /usr/bin/bash now')
  const selection = createSelectionState()

  selectWordAt(selection, screen, 6, 0)
  finishSelection(selection)

  expect(hasSelection(selection)).toBe(true)
  expect(selectionBounds(selection)).toEqual({
    start: { col: 3, row: 0 },
    end: { col: 15, row: 0 },
  })
  expect(getSelectedText(selection, screen)).toBe('/usr/bin/bash')
})
