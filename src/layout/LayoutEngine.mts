import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api.js'
import { EntityDescriptor } from '../puml/EntityDescriptor.interface.mjs'
import { spaceAdvance, renderedLineHeight, MX_DEFAULT_FONTSIZE } from '../text/TextMetrics.mjs'
import { measureNode, measureEdgeLabel } from './measureNode.mjs'

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
  /** ELK-computed label rectangle (absolute), when the edge carried a
   *  measured label. Lets callers/tests verify it clears every node. */
  label?: { x: number; y: number; width: number; height: number }
}

interface LayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  clusters: LayoutNode[]
  width: number
  height: number
  /** True when the Context (`org.eclipse.elk.stress`) algorithm was
   *  used (people/systems only) rather than hierarchical `layered`.
   *  #24 scope guard: only Context solo edges get the synthetic
   *  centre-midpoint waypoint — hierarchical edges already carry a
   *  deterministic ELK ORTHOGONAL route and MUST stay byte-identical. */
  context: boolean
}

type Rel = { source: string; target: string; label: string; description: string; direction?: 'U' | 'D' | 'L' | 'R' }
type Lay = { source: string; target: string; direction?: 'U' | 'D' | 'L' | 'R'; distance?: number }


/**
 * Layout via elkjs (Eclipse Layout Kernel, `org.eclipse.elk.layered`).
 *
 * Why ELK, not dagre: dagre 3.0.0's documented option surface (wiki + the
 * installed README's referenced config) and an empirical spike both prove it
 * has NO aspect-ratio / layer-wrapping / same-rank / in-layer-order control —
 * so it produced 8:1 ribbons and could not honor Rel_L/Rel_R. elkjs 0.11.1's
 * own `knownLayoutOptions()` registry confirms native support for all of
 * these. Verified by spike (ibmwm-c4-context: aspect 7.94 → 2.26, 13/13
 * nodes, 11/11 edges routed, compound nesting preserved).
 *
 * ELK coordinates are top-left and parent-relative — accumulated to absolute
 * here (no centre conversion). Interfaces/΅ static signature are unchanged so
 * catalyst.mts is untouched.
 */
class LayoutEngine {
  private elk = new ELK()
  private entities: EntityDescriptor[] = []
  private relations: Rel[] = []
  private constraints: Lay[] = []
  private graphOpts: Record<string, string> = {}

  /**
   * Compound-node (boundary / Deployment_Node) top title band that ELK
   * reserves as `elk.padding[top]`. It MUST be ≥ the boundary label's
   * full RENDERED height, else the title overlaps the dashed border and
   * nested children (the `topology-deep-nesting` defect).
   *
   * The boundary templates emit TWO lines — Name (bold; 13px is the
   * tallest, EnterpriseBoundary) then `[Type]` (the mxGraph default
   * size) — at the renderer's 1.2 line box (`renderedLineHeight`, the
   * cited mxGraph constant), plus one font-derived space-advance inset
   * so the text is not flush on the stroke. Every term is a real
   * renderer/font metric — no invented constant. (Previously this
   * reserved only ONE fontkit `lineHeight(16)` ≈ 23px while the real
   * 2-line render needs ≈ 28px → the overlap.)
   */
  private titlePadding(): { top: number; side: number } {
    const EB_TITLE_PX = 13 // EnterpriseBoundary Name font-size (the taller of the two boundary templates' explicit CSS)
    return {
      top: Math.ceil(
        renderedLineHeight(EB_TITLE_PX) +              // Name line
        renderedLineHeight(MX_DEFAULT_FONTSIZE) +      // [Type] line
        spaceAdvance(EB_TITLE_PX, true)),              // font-derived inset off the border
      side: Math.ceil(spaceAdvance(MX_DEFAULT_FONTSIZE, false))
    }
  }

  addNodes(entities: EntityDescriptor[]): void { this.entities = entities }
  addEdges(relations: Rel[]): void { this.relations = relations }
  addLayoutConstraints(constraints: Lay[]): void { this.constraints = constraints }

  setLayoutOptions(options: {
    rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
    nodesep?: number
    edgesep?: number
    ranksep?: number
    marginx?: number
    marginy?: number
  }): void {
    const dir = { TB: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' }[options.rankdir ?? 'TB']
    this.graphOpts = {
      'elk.direction': dir,
      // nodesep/ranksep map to ELK layered spacings (caller-tunable; the
      // CatalystOptions defaults are the public, documented values).
      ...(options.nodesep !== undefined ? { 'elk.spacing.nodeNode': String(options.nodesep) } : {}),
      ...(options.ranksep !== undefined ? { 'elk.layered.spacing.nodeNodeBetweenLayers': String(options.ranksep) } : {}),
      ...(options.edgesep !== undefined ? { 'elk.layered.spacing.edgeEdgeBetweenLayers': String(options.edgesep) } : {})
    }
  }

  /** Build the ELK node tree. Leaves are text-measured (L3); compound nodes
   * (boundaries / Deployment_Node) get children + a font-derived title pad. */
  private buildNodes(entities: EntityDescriptor[]): ElkNode[] {
    const pad = this.titlePadding()
    const toElk = (e: EntityDescriptor): ElkNode => {
      if (e.children && e.children.length) {
        return {
          id: e.alias,
          children: e.children.map(toElk),
          layoutOptions: {
            'elk.padding': `[top=${pad.top},left=${pad.side},bottom=${pad.side},right=${pad.side}]`
          }
        }
      }
      const d = measureNode(e)
      return { id: e.alias, width: d.width, height: d.height }
    }
    return entities.map(toElk)
  }

  /**
   * L1 L/R via ELK model order: ELK honors the children-array order within a
   * layer when considerModelOrder is on. For Rel_R(a,b) b is right of a, for
   * Rel_L(a,b) b is left of a — reorder same-parent sibling groups so the
   * array reflects that. Conflicts resolve first-seen (documented).
   */
  private applyHorizontalOrder(roots: ElkNode[]): void {
    const order = new Map<string, { left: Set<string>; right: Set<string> }>()
    const rel = (a: string) => order.get(a) ?? order.set(a, { left: new Set(), right: new Set() }).get(a)!
    for (const r of this.relations) {
      if (r.direction === 'R') rel(r.source).right.add(r.target)
      else if (r.direction === 'L') rel(r.source).left.add(r.target)
    }
    if (order.size === 0) return
    const sortSiblings = (nodes: ElkNode[]) => {
      nodes.sort((x, y) => {
        if (order.get(x.id)?.right.has(y.id) || order.get(y.id)?.left.has(x.id)) return -1
        if (order.get(x.id)?.left.has(y.id) || order.get(y.id)?.right.has(x.id)) return 1
        return 0
      })
      for (const n of nodes) if (n.children) sortSiblings(n.children)
    }
    sortSiblings(roots)
  }

  /**
   * Spec-grounded algorithm selection (not a numeric heuristic). A C4
   * *Context* diagram contains only people/systems (+ boundaries) and NO
   * Container/Component/Deployment_Node — it is an inherently hub-and-spoke
   * overview that `layered` spreads into a wide ribbon (true of dagre, ELK
   * AND PlantUML's own Graphviz/dot). Container/Component/Deployment diagrams
   * are hierarchical/flow and belong in `layered`. The discriminator is the
   * C4 spec's own diagram-level definition — the set of entity types present
   * — read straight from the parsed model.
   */
  private isHierarchical(): boolean {
    const deeper = /^(Container|Component|Node|Deployment_Node)/
    const scan = (es: EntityDescriptor[]): boolean =>
      es.some(e => deeper.test(e.type) || (e.children ? scan(e.children) : false))
    return scan(this.entities)
  }

  /** alias → measured leaf width. Compound nodes (boundaries) are absent
   *  on purpose: their final width is ELK-decided, so an edge touching one
   *  gets no wrap cap (Infinity) — exactly the "unknown endpoint" case. */
  private leafWidths(entities: EntityDescriptor[], out = new Map<string, number>()): Map<string, number> {
    for (const e of entities) {
      if (e.children && e.children.length) this.leafWidths(e.children, out)
      else out.set(e.alias, measureNode(e).width)
    }
    return out
  }

  private buildGraph(): ElkNode {
    const children = this.buildNodes(this.entities)
    this.applyHorizontalOrder(children)
    // Edge-label wrap cap = the narrower of the two endpoint nodes'
    // MEASURED widths (pure geometry — a label never wider than the
    // smallest box it sits between; no magic constant). Unknown/cluster
    // endpoint ⇒ Infinity ⇒ no wrap (prior behaviour for that edge).
    const lw = this.leafWidths(this.entities)
    const edgeCap = (a: string, b: string): number => {
      const wa = lw.get(a), wb = lw.get(b)
      return wa !== undefined && wb !== undefined ? Math.min(wa, wb) : Infinity
    }

    // Visible relations as ELK edges. L1 U/D is engine-agnostic: feeding the
    // edge reversed makes the target rank above the source (the VISIBLE
    // connector is still emitted from pumlRelations in layoutData2mx with the
    // authored from→to, so this only affects placement). L/R handled by model
    // order above. `rel<i>` name lets layoutData2mx pull the routed polyline.
    const edges: ElkExtendedEdge[] = this.relations.map((r, i) => {
      const up = r.direction === 'U'
      // Phase 2: feed the measured label rectangle to ELK so it reserves
      // space and routes/places nodes clear of the label. The verb is
      // r.label; the bracketed technology is r.description (C4-PlantUML's
      // swapped-field grammar — see layoutData2mx). `lay<i>` constraint
      // edges are invisible and intentionally get NO label.
      const dim = measureEdgeLabel(r.label, r.description, edgeCap(r.source, r.target))
      return {
        id: `rel${i}`,
        sources: [up ? r.target : r.source],
        targets: [up ? r.source : r.target],
        labels: [{ text: r.label, width: dim.width, height: dim.height }],
      }
    })
    // Layout-only Lay_* edges: present for ELK ranking, NOT in pumlRelations,
    // so layoutData2mx never draws them (it only emits `rel<n>` geometry +
    // visible edges from pumlRelations).
    this.constraints.forEach((c, i) => {
      const up = c.direction === 'U'
      edges.push({ id: `lay${i}`, sources: [up ? c.target : c.source], targets: [up ? c.source : c.target] })
    })

    // Phase 2: edge-label spacing, font-derived (not invented constants).
    // The edges already carry measured label rectangles; these options tell
    // ELK how far to keep a label from its own edge and from nodes, so a
    // label is never laid on top of a box. Applied to BOTH algorithms —
    // `spacing.edgeLabel`/`spacing.edgeNode` are core options honoured by
    // layered and force/stress alike.
    const labelGap = String(Math.ceil(spaceAdvance(11, false)))
    const lineGap = String(Math.ceil(renderedLineHeight(MX_DEFAULT_FONTSIZE)))
    const edgeLabelOpts: Record<string, string> = {
      'elk.spacing.edgeLabel': labelGap,
      'elk.spacing.edgeNode': lineGap,
      'elk.edgeLabels.inline': 'false',
    }

    const hierarchical = this.isHierarchical()
    const layoutOptions: Record<string, string> = hierarchical
      ? {
          // Hierarchical C4 (Container/Component/Deployment): layered flow.
          'elk.algorithm': 'org.eclipse.elk.layered',
          'elk.direction': 'DOWN',
          'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
          'elk.edgeRouting': 'ORTHOGONAL',
          ...edgeLabelOpts,
          // Layered places edge labels and reserves a band for them; CENTER
          // keeps the verb on the connector midpoint (matches catalyst's
          // own label anchor) while still reserving vertical space.
          'elk.layered.edgeLabels.sideSelection': 'ALWAYS_DOWN',
          // `elk.layered.wrapping.*` was tried and removed: ELK's docs state
          // wrapping splits a long *sequence of layers* into side-by-side
          // chunks — NOT a single over-wide rank — and it empirically
          // flattened normal ranking. Plain layered already balances
          // hierarchical C4 (multiple ranks); the wide-star case is handled
          // by the stress (Context) branch below, not by mis-using wrapping.
          // L1 L/R: bias within-layer order by model order WITHOUT overriding
          // edge ranking (forceNodeModelOrder rejected — it flattens ranks).
          'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          // Phase 4: NETWORK_SIMPLEX node placement (over the BRANDES_KOEPF
          // default). Full-corpus spike (catalyst fixtures + all 10 ibm-wm
          // diagrams): ZERO regressions, strictly better — real c4-container
          // 44→30 crossings, c4-deployment-profile-b 19→16, -c 17→13, all
          // others unchanged, 0 node overlaps everywhere. NOTE: the
          // backlog's "lay each boundary as a SEPARATE subgraph" hypothesis
          // was empirically DISPROVEN (SEPARATE_CHILDREN = 115 crossings on
          // c4-container, far worse than 44) — the real lever for the big
          // flat-compound Container tangle is node placement, not hierarchy
          // mode. No emit-model change needed (flat+absolute stays).
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
          ...this.graphOpts
        }
      : {
          // C4 Context (hub-and-spoke): `stress` over `force` (Phase 3).
          // Empirical spike on the real ibm-wm c4-context (post Phase 1+2
          // node sizes): force = 3 edge crossings, stress = 0, and stress
          // is DETERMINISTIC (force is seed-based — unstable golden/route
          // signatures). `stress` confirmed in elkjs 0.11.1's own
          // knownLayoutAlgorithms() registry. Edges stay straight (a
          // context overview is not a flow diagram); graphOpts
          // (rankdir/spacing) don't apply and are intentionally not spread.
          'elk.algorithm': 'org.eclipse.elk.stress',
          'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
          ...edgeLabelOpts
        }

    return { id: 'root', layoutOptions, children, edges }
  }

  /**
   * Phase 3 second pass. `stress` minimises edge crossings (0 on the real
   * c4-context) but, unlike `force`, has NO node-repulsion — it can leave
   * boxes overlapping (the layout-quality gate's invariant). ELK's
   * `sporeOverlap` is purpose-built to remove node overlaps while
   * preserving the relative arrangement, so the crossing-minimal positions
   * from stress survive. Deterministic. Compound nesting (boundaries) is
   * kept via INCLUDE_CHILDREN; the spacing is the same font-derived title
   * band used elsewhere (a real metric, not an invented constant).
   */
  private async declump(laid: ElkNode): Promise<ElkNode> {
    const gap = this.titlePadding().top
    const clone = (n: ElkNode): ElkNode => ({
      id: n.id,
      x: n.x, y: n.y, width: n.width, height: n.height,
      ...(n.children ? { children: n.children.map(clone) } : {}),
    })
    const g2: ElkNode = {
      id: laid.id,
      layoutOptions: {
        'elk.algorithm': 'org.eclipse.elk.sporeOverlap',
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.spacing.nodeNode': String(gap),
      },
      children: (laid.children ?? []).map(clone),
      edges: (laid.edges ?? []) as ElkExtendedEdge[],
    }
    return this.elk.layout(g2)
  }

  async calculateLayout(): Promise<LayoutResult> {
    const g = this.buildGraph()
    // elkjs returns a laid-out graph: x/y/width/height on shapes, routed
    // `sections` on edges (top-level edge coords are absolute).
    let r = await this.elk.layout(g)
    // Context (non-hierarchical) used `stress` — declump any node overlaps
    // it left, preserving its crossing-minimal arrangement.
    if (!this.isHierarchical()) r = await this.declump(r)

    const nodes: LayoutNode[] = []
    const clusters: LayoutNode[] = []
    // ELK child coords are relative to the parent → accumulate to absolute.
    const walk = (n: { id: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] }, ox: number, oy: number, parent?: string) => {
      const x = (n.x ?? 0) + ox
      const y = (n.y ?? 0) + oy
      const kids = (n.children ?? []) as typeof nodes extends never ? never : Array<{ id: string; x?: number; y?: number; width?: number; height?: number; children?: unknown[] }>
      const isCluster = kids.length > 0
      const ln: LayoutNode = {
        id: n.id, x, y,
        width: n.width ?? 0, height: n.height ?? 0,
        isCluster,
        parent,
        children: isCluster ? kids.map(k => k.id) : undefined
      }
      ;(isCluster ? clusters : nodes).push(ln)
      for (const k of kids) walk(k, x, y, n.id)
    }
    for (const c of r.children ?? []) walk(c, 0, 0)

    // L1 L/R — safe same-rank post-pass. A Rel_L/Rel_R also emits an a→b
    // edge, so a layered engine ranks a and b on DIFFERENT rows whenever
    // that edge constrains them — "b beside a" is then geometrically
    // impossible (true of ELK, dagre, and PlantUML/dot alike). So we only
    // act when ELK *already* placed the two on the same rank — detected by
    // their vertical extents overlapping (a geometric fact from the real
    // output, not a tolerance/threshold). In that case swap their x to
    // satisfy the hint; otherwise leave the layout untouched. This never
    // fights the layered structure and cannot degrade the layout.
    const byId = new Map<string, LayoutNode>()
    for (const n of [...nodes, ...clusters]) byId.set(n.id, n)
    for (const rel of this.relations) {
      if (rel.direction !== 'L' && rel.direction !== 'R') continue
      const a = byId.get(rel.source)
      const b = byId.get(rel.target)
      if (!a || !b || a.x === undefined || b.x === undefined || a.y === undefined || b.y === undefined) continue
      const sameRank = a.y < b.y + b.height && b.y < a.y + a.height // y-extents overlap
      if (!sameRank) continue
      const wantBefore = rel.direction === 'L'              // L: target left of source
      const isBefore = b.x < a.x
      if (isBefore !== wantBefore) { const t = a.x; a.x = b.x; b.x = t }
    }

    // Top-level edges → coords are absolute (relative to root). Map ELK
    // sections to a polyline; layoutData2mx threads `rel<n>` ones as drawio
    // waypoints (L2) and ignores `lay<n>` (layout-only).
    const edges: LayoutEdge[] = []
    for (const e of r.edges ?? []) {
      const m = /^(rel|lay)(\d+)$/.exec(e.id)
      if (!m) continue
      const isRel = m[1] === 'rel'
      const src = isRel ? this.relations[+m[2]] : this.constraints[+m[2]]
      if (!src) continue
      const s = e.sections?.[0]
      const pts = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : []
      // Phase 2: surface ELK's placed label rectangle (absolute for
      // top-level edges) so callers/tests can verify it clears every node.
      const lbl = (e as { labels?: { x?: number; y?: number; width?: number; height?: number }[] }).labels?.[0]
      const label = lbl && lbl.width
        ? { x: lbl.x ?? 0, y: lbl.y ?? 0, width: lbl.width ?? 0, height: lbl.height ?? 0 }
        : undefined
      edges.push({ source: src.source, target: src.target, name: e.id, points: pts, label })
    }

    return {
      nodes,
      edges,
      clusters,
      width: Math.ceil(r.width ?? 0),
      height: Math.ceil(r.height ?? 0),
      context: !this.isHierarchical(),
    }
  }

  static async calculateLayout(
    entities: EntityDescriptor[],
    relations: Rel[],
    options?: {
      rankdir?: 'TB' | 'BT' | 'LR' | 'RL'
      nodesep?: number
      edgesep?: number
      ranksep?: number
      marginx?: number
      marginy?: number
    },
    layoutConstraints: Lay[] = []
  ): Promise<LayoutResult> {
    const engine = new LayoutEngine()
    if (options) engine.setLayoutOptions(options)
    engine.addNodes(entities)
    engine.addEdges(relations)
    engine.addLayoutConstraints(layoutConstraints)
    return engine.calculateLayout()
  }
}

export { LayoutEngine, LayoutResult, LayoutNode, LayoutEdge }
