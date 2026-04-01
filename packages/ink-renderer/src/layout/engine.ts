import type { LayoutNode } from './node'
import { createYogaLayoutNode } from './yoga'

export function createLayoutNode(): LayoutNode {
  return createYogaLayoutNode()
}

