// Shared layout-result contract — the interface between the layout
// engine and `layoutData2mx` (the Mx emit). Extracted from the former
// `LayoutEngine.mts` when the ELK engine was removed (FU1, ADR 0014):
// `dot` (`DotLayout.mts`) is the only engine, but these types stay in
// a neutral module so the emit path does not depend on the engine
// implementation.

interface LayoutNode {
  id: string
  width: number
  height: number
  x?: number
  y?: number
  type?: string
  isCluster?: boolean
  parent?: string
  children?: string[]
}

interface LayoutEdge {
  source: string
  target: string
  name?: string
  points?: { x: number; y: number }[]
  /** Engine-computed label rectangle (absolute), when the edge carried
   *  a measured label. Lets callers/tests verify it clears every node. */
  label?: { x: number; y: number; width: number; height: number }
}

interface LayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  clusters: LayoutNode[]
  width: number
  height: number
  /**
   * Item 1a / ADR 0014 — `dot` routes every edge as a GLOBALLY
   * crossing-free spline, so `layoutData2mx` emits `edges[].points`
   * VERBATIM (`curved=1`) and bypasses the legacy `assignEdgeLanes`
   * perpendicular-shove (that lane machinery existed only to
   * compensate for ELK's poor multi-edge routing; applied on top of
   * dot's already-fanned splines it reintroduced the very crossings
   * the engine swap eliminated — measured: rel-fan-stress raw 0 →
   * post-lane 10). Always true now (dot is the only engine); retained
   * as an explicit emit contract rather than an implicit assumption.
   */
  routesAuthoritative?: boolean
}

export type { LayoutResult, LayoutNode, LayoutEdge }
