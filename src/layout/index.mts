// Export all layout-related modules. `dot` (DotLayout) is the only
// layout engine — the ELK engine was removed (FU1 / ADR 0014).
export { DotLayout } from './DotLayout.mjs'
export type { LayoutResult, LayoutNode, LayoutEdge } from './types.mjs'
