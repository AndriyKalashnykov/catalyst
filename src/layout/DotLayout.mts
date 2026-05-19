// =============================================================================
// Item 1a · P1+P2 — Graphviz `dot` layout engine (C4→dot emitter + adapter)
// =============================================================================
//
// A drop-in alternative to `LayoutEngine` (elkjs) that lays out the SAME
// parsed C4 model with Graphviz `dot` — the engine PlantUML itself uses,
// proven in P0 to drive the project's `edgecross` metric 30→0 while
// being byte-deterministic (pinned `@hpcc-js/wasm-graphviz`).
//
// SCOPE DISCIPLINE (the user's standing constraint): the C4 parse
// (EntityParser/RelParser), the emit (`layoutData2mx`/Mx/templates) and
// every gate are UNTOUCHED. This file only produces the existing
// `LayoutResult` contract from `dot` instead of ELK, so the call site
// swaps one class (P4 flag). Coordinate space, field names and the
// `rel<i>`/`lay<i>` edge-name convention are exactly what
// `layoutData2mx` already consumes (verified against catalyst.mts).
//
//   P1 — C4→dot graph emitter (`buildDot`): ranks TB, `cluster_*`
//        subgraphs for *_Boundary/Deployment_Node nesting, node
//        width/height from the ADR-0010 content-fit `measureNode`
//        boxes pinned with `fixedsize=true` (dot must NOT re-measure
//        text), edge order = relation order, directional hints
//        (Rel_U/D/L/R) + Lay_* constraints mapped to dot ranking,
//        stable declaration order ⇒ byte-stable source.
//   P2 — dot JSON → `LayoutResult` adapter (`adapt`): node positions,
//        cluster boxes and edge splines mapped into catalyst's single
//        absolute top-left coordinate space (dot is bottom-left,
//        y-up — flipped about the bb height).
//
// Determinism: stable node/edge declaration order + the pinned engine
// ⇒ identical input → byte-identical output (proven P0, gated P4/P5).
// =============================================================================

import { Graphviz } from '@hpcc-js/wasm-graphviz'
import { EntityDescriptor } from '../puml/EntityDescriptor.interface.mjs'
import { measureNode } from './measureNode.mjs'
import type { LayoutResult, LayoutNode, LayoutEdge } from './LayoutEngine.mjs'

type Rel = { source: string; target: string; label: string; description: string; direction?: 'U' | 'D' | 'L' | 'R' }
type Lay = { source: string; target: string; direction?: 'U' | 'D' | 'L' | 'R'; distance?: number }
type LayoutOptions = {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  edgesep?: number
  ranksep?: number
  marginx?: number
  marginy?: number
}

// Graphviz constant: 72 points = 1 inch (graphviz.org/docs/outputs).
// `dot` takes node width/height in INCHES and emits positions/splines
// in POINTS. Defining each node's inch size as `px/PT_PER_IN` makes
// 1 emitted dot-point == 1 catalyst-pixel by construction — the
// adapter then needs only an origin flip, no scale factor (this exact
// identity was validated in the P0 spike).
const PT_PER_IN = 72

// Cubic-bezier sampling density for a dot spline → polyline. Matches
// the `edgecross`/route-fidelity instruments' SAMPLES (24): the drawn
// curve bows toward its control points, so a faithful waypoint set
// samples the curve rather than reducing it to its hull. Sub-pixel
// chord error at gallery scale.
const SPLINE_SAMPLES = 24

// One shared WASM Graphviz instance, lazily loaded once per process
// (load() is async and ~MBs of wasm — re-loading per layout would be
// wasteful and the instance is stateless across layout() calls).
let graphvizPromise: Promise<Graphviz> | null = null
const getGraphviz = (): Promise<Graphviz> =>
  (graphvizPromise ??= Graphviz.load())

/** dot-quote a string for use inside a double-quoted dot ID/label. */
const q = (s: unknown): string =>
  String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/**
 * P1 — emit a deterministic dot graph from the parsed C4 model.
 *
 * Returns the dot source AND the cluster-name→alias map (dot requires
 * subgraph names to start with `cluster` for cluster semantics, so the
 * boundary's own alias cannot be the subgraph name verbatim; the map
 * lets the adapter recover the alias for `LayoutResult.clusters[].id`,
 * which `layoutData2mx` looks up against the entity tree).
 */
export function buildDot(
  entities: EntityDescriptor[],
  relations: Rel[],
  constraints: Lay[],
  options: LayoutOptions,
): { src: string; clusterAlias: Map<string, string> } {
  const rankdir = options.rankdir ?? 'TB'
  const clusterAlias = new Map<string, string>()
  const lines: string[] = ['digraph G {']
  // `newrank=true` makes `rank=same` constraints honoured across
  // cluster boundaries (the L/R hint case); `compound=true` allows
  // edges to/from clusters. Graph-level spacings come from the
  // caller's CatalystOptions (same public knobs ELK mapped) — only
  // emitted when set, so a default graph is byte-stable.
  lines.push(`  graph [rankdir=${rankdir}, newrank=true, compound=true${
    options.ranksep !== undefined ? `, ranksep="${options.ranksep / PT_PER_IN}"` : ''}${
    options.nodesep !== undefined ? `, nodesep="${options.nodesep / PT_PER_IN}"` : ''}];`)
  // Sizes are pinned from catalyst's content-fit measurement; dot must
  // NOT relayout text (ADR-0010 owns box sizing) → fixedsize=true.
  lines.push('  node [shape=box, fixedsize=true];')

  let clusterIdx = 0
  const emit = (e: EntityDescriptor, indent: string): void => {
    if (e.children && e.children.length) {
      // Boundary / Deployment_Node → cluster subgraph. Stable
      // collision-free name; alias recovered via clusterAlias.
      const cname = `cluster_${clusterIdx++}`
      clusterAlias.set(cname, e.alias)
      lines.push(`${indent}subgraph "${cname}" {`)
      lines.push(`${indent}  label="${q(e.label)}";`)
      for (const c of e.children) emit(c, indent + '  ')
      lines.push(`${indent}}`)
    } else {
      const d = measureNode(e)
      // 4 dp keeps the source byte-stable and the px→inch round-trip
      // exact enough that w_px = round(width_in*72) recovers the
      // measured pixel extent.
      const w = (d.width / PT_PER_IN).toFixed(4)
      const h = (d.height / PT_PER_IN).toFixed(4)
      lines.push(`${indent}"${q(e.alias)}" [width=${w}, height=${h}];`)
    }
  }
  for (const e of entities) emit(e, '  ')

  // Visible relations as ranking edges, in relation order, each stamped
  // `id="rel<i>"` so the adapter maps the routed spline back to the
  // relation index EXPLICITLY (dot may reorder edges and parallel edges
  // share a node-pair — positional mapping would be wrong). This is the
  // exact `rel<i>` convention layoutData2mx keys on.
  //
  // Directional hints mirror LayoutEngine's semantics so a swap does
  // not change intent:
  //  - U: target ranks ABOVE source ⇒ feed the ranking edge reversed
  //       (the VISIBLE connector is still drawn by layoutData2mx from
  //       pumlRelations with the authored direction — ranking-edge
  //       reversal never flips the arrowhead).
  //  - D / none: forward (default TB).
  //  - L/R: same-rank siblings. A normal edge would rank them on
  //       different rows (true of dot, ELK and PlantUML/dot alike), so
  //       the rel edge is emitted `constraint=false` (no rank effect)
  //       and the pair is pinned with `{rank=same}`; left/right order
  //       is biased by an invisible same-rank ordering edge.
  relations.forEach((r, i) => {
    const dir = r.direction
    if (dir === 'L' || dir === 'R') {
      lines.push(`  "${q(r.source)}" -> "${q(r.target)}" [id="rel${i}", constraint=false];`)
      lines.push(`  { rank=same; "${q(r.source)}"; "${q(r.target)}"; }`)
      // Same-rank left↔right ordering: an invisible non-constraining
      // edge from the intended-left to the intended-right node biases
      // dot's in-rank ordering without affecting ranks.
      const [lft, rgt] = dir === 'R' ? [r.source, r.target] : [r.target, r.source]
      lines.push(`  "${q(lft)}" -> "${q(rgt)}" [style=invis, constraint=false];`)
    } else {
      const up = dir === 'U'
      const s = up ? r.target : r.source
      const t = up ? r.source : r.target
      lines.push(`  "${q(s)}" -> "${q(t)}" [id="rel${i}"];`)
    }
  })

  // Layout-only Lay_* constraints: invisible ranking edges (id `lay<i>`
  // so layoutData2mx ignores them — it only threads `rel<i>`).
  constraints.forEach((c, i) => {
    const up = c.direction === 'U'
    const s = up ? c.target : c.source
    const t = up ? c.source : c.target
    lines.push(`  "${q(s)}" -> "${q(t)}" [id="lay${i}", style=invis];`)
  })

  lines.push('}')
  return { src: lines.join('\n'), clusterAlias }
}

/** Sample a dot spline (op `b`: P0 then cubic-bezier triples) into a
 *  polyline, matching the instruments' curve handling. */
function splineToPolyline(pts: [number, number][]): { x: number; y: number }[] {
  if (pts.length < 4) return pts.map(([x, y]) => ({ x, y }))
  const out: { x: number; y: number }[] = [{ x: pts[0][0], y: pts[0][1] }]
  for (let i = 1; i + 2 < pts.length; i += 3) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2]
    for (let s = 1; s <= SPLINE_SAMPLES; s++) {
      const t = s / SPLINE_SAMPLES, u = 1 - t
      out.push({
        x: u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
        y: u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
      })
    }
  }
  return out
}

/**
 * P2 — map dot's JSON layout into catalyst's `LayoutResult`.
 *
 * dot uses a bottom-left origin with y growing UP and positions in
 * points; catalyst uses ONE absolute top-left space with y growing
 * DOWN in pixels. Because each node's inch size was set to `px/72`,
 * 1 point == 1 px, so the only transform is the y-flip about the
 * bounding-box height H:  y_topleft = H − y_dot.
 */
function adapt(
  gvJson: string,
  entities: EntityDescriptor[],
  relations: Rel[],
  clusterAlias: Map<string, string>,
): LayoutResult {
  const o = JSON.parse(gvJson)
  const [, , bbW, bbH] = String(o.bb).split(',').map(Number)
  const H = bbH

  // Entity tree → parent/children + alias set, recovered from the
  // PARSED model (exact) rather than dot's JSON (dot's cluster `nodes`
  // lists only direct leaf members, not nested clusters).
  const parentOf = new Map<string, string | undefined>()
  const childIds = new Map<string, string[]>()
  const isCompound = new Set<string>()
  const walkEnt = (es: EntityDescriptor[], parent?: string): void => {
    for (const e of es) {
      parentOf.set(e.alias, parent)
      if (e.children && e.children.length) {
        isCompound.add(e.alias)
        childIds.set(e.alias, e.children.map(c => c.alias))
        walkEnt(e.children, e.alias)
      }
    }
  }
  walkEnt(entities)

  // The DECLARED leaf alias set. dot silently auto-creates a default
  // (unsized) node for any edge endpoint that was never declared — so
  // the adapter must surface ONLY declared leaves, else a malformed
  // model (or a future parser gap) would leak a bogus-sized phantom
  // box instead of being caught by the completeness gate. This is a
  // real fidelity hardening: a missing declared leaf stays missing
  // (C1 catches it); an undeclared dot phantom is never surfaced.
  const declaredLeaves = new Set<string>()
  const collectLeaves = (es: EntityDescriptor[]): void => {
    for (const e of es)
      e.children && e.children.length ? collectLeaves(e.children) : declaredLeaves.add(e.alias)
  }
  collectLeaves(entities)

  const objects: any[] = o.objects ?? []
  const gvidName = new Map<number, string>()       // node _gvid → alias
  for (const obj of objects) if (obj.pos) gvidName.set(obj._gvid, obj.name)

  const nodes: LayoutNode[] = []
  const clusters: LayoutNode[] = []
  for (const obj of objects) {
    if (obj.pos !== undefined) {
      if (!declaredLeaves.has(obj.name)) continue   // undeclared dot phantom — never surface
      // Leaf node. pos = "cx,cy" (points, bottom-left); width/height
      // are the inches we set → px = inch*72 (1:1 by construction).
      const [cx, cy] = String(obj.pos).split(',').map(Number)
      const w = Math.round(Number(obj.width) * PT_PER_IN)
      const h = Math.round(Number(obj.height) * PT_PER_IN)
      nodes.push({
        id: obj.name,
        x: cx - w / 2,
        y: H - cy - h / 2,
        width: w,
        height: h,
        isCluster: false,
        parent: parentOf.get(obj.name),
      })
    } else if (obj.bb !== undefined && typeof obj.name === 'string' && obj.name.startsWith('cluster_')) {
      // Cluster (boundary / Deployment_Node). bb = "x1,y1,x2,y2"
      // (points, bottom-left) — encloses children's positions by
      // construction (exactly what layoutData2mx needs: the box visually
      // contains its children in the flat absolute model).
      const [x1, y1, x2, y2] = String(obj.bb).split(',').map(Number)
      const alias = clusterAlias.get(obj.name)
      if (!alias) continue
      clusters.push({
        id: alias,
        x: x1,
        y: H - y2,
        width: x2 - x1,
        height: y2 - y1,
        isCluster: true,
        parent: parentOf.get(alias),
        children: childIds.get(alias),
      })
    }
  }

  // Edges: recover the relation index from the stamped `id` (NOT
  // positional). `rel<i>` → threaded as routed waypoints by
  // layoutData2mx; `lay<i>` is layout-only and intentionally ignored
  // downstream, but we still surface it so callers/tests can see it.
  const edges: LayoutEdge[] = []
  for (const e of o.edges ?? []) {
    const m = /^(rel|lay)(\d+)$/.exec(String(e.id ?? ''))
    if (!m) continue
    const idx = Number(m[2])
    const src = m[1] === 'rel' ? relations[idx] : undefined
    const b = (e._draw_ ?? []).find((d: any) => d.op === 'b' || d.op === 'B')
    const pts: { x: number; y: number }[] = b
      ? splineToPolyline(b.points).map(p => ({ x: p.x, y: H - p.y }))
      : []
    // Use the AUTHORED relation endpoints (matches the visible
    // connector layoutData2mx draws from pumlRelations); fall back to
    // the dot tail/head aliases for lay edges.
    const source = src ? src.source : (gvidName.get(e.tail) ?? '')
    const target = src ? src.target : (gvidName.get(e.head) ?? '')
    edges.push({ source, target, name: m[0], points: pts })
  }

  return {
    nodes,
    clusters,
    edges,
    width: Math.ceil(bbW),
    height: Math.ceil(bbH),
    // dot routes every edge as a globally crossing-free spline (the
    // entire reason for 1a). Signal layoutData2mx to emit them
    // verbatim and skip the ELK-compensation lane machinery.
    routesAuthoritative: true,
  }
}

/**
 * Graphviz-`dot` layout. Same static surface as `LayoutEngine` so the
 * P4 `LAYOUT_ENGINE` flag swaps one class with zero call-site change
 * (catalyst.mts: `LayoutEngine.calculateLayout(...)`).
 */
class DotLayout {
  static async calculateLayout(
    entities: EntityDescriptor[],
    relations: Rel[],
    options: LayoutOptions = {},
    layoutConstraints: Lay[] = [],
  ): Promise<LayoutResult> {
    const { src, clusterAlias } = buildDot(entities, relations, layoutConstraints, options)
    const graphviz = await getGraphviz()
    const gvJson = graphviz.layout(src, 'json', 'dot')
    return adapt(gvJson, entities, relations, clusterAlias)
  }

  /** The dot SOURCE for a model — for determinism tests / debugging
   *  (no engine invocation; pure + synchronous). */
  static dotSource(
    entities: EntityDescriptor[],
    relations: Rel[],
    options: LayoutOptions = {},
    layoutConstraints: Lay[] = [],
  ): string {
    return buildDot(entities, relations, layoutConstraints, options).src
  }
}

export { DotLayout }
