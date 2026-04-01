import React, { type PropsWithChildren, type Ref } from 'react'
import { Box } from '@claude-code-kit/ink-renderer'
import type { DOMElement } from '@claude-code-kit/ink-renderer'
import type { ClickEvent } from '@claude-code-kit/ink-renderer'
import type { FocusEvent } from '@claude-code-kit/ink-renderer'
import type { KeyboardEvent } from '@claude-code-kit/ink-renderer'
import type { Color, Styles } from '@claude-code-kit/ink-renderer'
import { getTheme, type Theme, useTheme } from './ThemeProvider'

type ThemedColorProps = {
  readonly borderColor?: keyof Theme | Color
  readonly borderTopColor?: keyof Theme | Color
  readonly borderBottomColor?: keyof Theme | Color
  readonly borderLeftColor?: keyof Theme | Color
  readonly borderRightColor?: keyof Theme | Color
  readonly backgroundColor?: keyof Theme | Color
}

type BaseStylesWithoutColors = Omit<
  Styles,
  | 'textWrap'
  | 'borderColor'
  | 'borderTopColor'
  | 'borderBottomColor'
  | 'borderLeftColor'
  | 'borderRightColor'
  | 'backgroundColor'
>

export type Props = BaseStylesWithoutColors &
  ThemedColorProps & {
    ref?: Ref<DOMElement>
    tabIndex?: number
    autoFocus?: boolean
    onClick?: (event: ClickEvent) => void
    onFocus?: (event: FocusEvent) => void
    onFocusCapture?: (event: FocusEvent) => void
    onBlur?: (event: FocusEvent) => void
    onBlurCapture?: (event: FocusEvent) => void
    onKeyDown?: (event: KeyboardEvent) => void
    onKeyDownCapture?: (event: KeyboardEvent) => void
    onMouseEnter?: () => void
    onMouseLeave?: () => void
  }

function resolveColor(
  color: keyof Theme | Color | undefined,
  theme: Theme,
): Color | undefined {
  if (!color) return undefined
  if (
    color.startsWith('rgb(') ||
    color.startsWith('#') ||
    color.startsWith('ansi256(') ||
    color.startsWith('ansi:')
  ) {
    return color as Color
  }
  return theme[color as keyof Theme] as Color
}

function ThemedBox({
  borderColor,
  borderTopColor,
  borderBottomColor,
  borderLeftColor,
  borderRightColor,
  backgroundColor,
  children,
  ref,
  ...rest
}: PropsWithChildren<Props>): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)

  const resolvedBorderColor = resolveColor(borderColor, theme)
  const resolvedBorderTopColor = resolveColor(borderTopColor, theme)
  const resolvedBorderBottomColor = resolveColor(borderBottomColor, theme)
  const resolvedBorderLeftColor = resolveColor(borderLeftColor, theme)
  const resolvedBorderRightColor = resolveColor(borderRightColor, theme)
  const resolvedBackgroundColor = resolveColor(backgroundColor, theme)

  return (
    <Box
      ref={ref}
      borderColor={resolvedBorderColor}
      borderTopColor={resolvedBorderTopColor}
      borderBottomColor={resolvedBorderBottomColor}
      borderLeftColor={resolvedBorderLeftColor}
      borderRightColor={resolvedBorderRightColor}
      backgroundColor={resolvedBackgroundColor}
      {...rest}
    >
      {children}
    </Box>
  )
}

export default ThemedBox
