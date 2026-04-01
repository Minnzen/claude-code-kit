import type { ReactNode, Ref } from 'react'
import type { DOMElement } from '../dom'
import type { ClickEvent } from '../events/click-event'
import type { FocusEvent } from '../events/focus-event'
import type { KeyboardEvent } from '../events/keyboard-event'
import type { Styles, TextStyles } from '../styles'

type InkBoxProps = {
  ref?: Ref<DOMElement>
  style?: Styles
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
  stickyScroll?: boolean
  children?: ReactNode
}

type InkTextProps = {
  style?: Styles
  textStyles?: TextStyles
  children?: ReactNode
}

type InkLinkProps = {
  href: string
  children?: ReactNode
}

type InkRawAnsiProps = {
  rawText: string
  rawWidth: number
  rawHeight: number
}

type InkVirtualTextProps = {
  style?: Styles
  textStyles?: TextStyles
  children?: ReactNode
}

type InkRootProps = {
  children?: ReactNode
}

type InkProgressProps = {
  children?: ReactNode
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': InkBoxProps
      'ink-text': InkTextProps
      'ink-link': InkLinkProps
      'ink-raw-ansi': InkRawAnsiProps
      'ink-virtual-text': InkVirtualTextProps
      'ink-root': InkRootProps
      'ink-progress': InkProgressProps
    }
  }
}
