import { EntityParser, EntityDescriptor } from "./puml/EntityParser.mjs"
import { Mx, MxGeometry } from './mx/Mx.mjs'
import { MxPoint } from './mx/MxPoint.mjs'
import { RelParser } from './puml/RelParser.mjs'
import { LayoutEngine, LayoutResult } from './layout/LayoutEngine.mjs'
import { assignEdgeLanes, resolveLabelOverlap, polylineMidpoint, type NodeCenter, type NodeRect } from './layout/edgeLanes.mjs'
import { measureEdgeLabel } from './layout/measureNode.mjs'
import { spaceAdvance } from './text/TextMetrics.mjs'
import { RELATIONSHIP_LABEL_PX } from './mx/c4/theme.mjs'
import { StyleParser } from './puml/StyleParser.mjs'
import { DECIMAL_RADIX } from "./constants.mjs"
import type { ParsedStyles, StyleOverride } from './puml/StyleParser.mjs'

// C4 element type -> the element-kind name used by UpdateElementStyle().
const ELEMENT_KIND: Record<string, string> = {
  Person: 'person', Person_Ext: 'external_person',
  System: 'system', System_Ext: 'external_system',
  SystemDb: 'system_db', SystemQueue: 'system_queue',
  Container: 'container', Container_Ext: 'external_container',
  ContainerDb: 'container_db', ContainerQueue: 'container_queue',
  Component: 'component', Component_Ext: 'external_component',
}

/** Merge UpdateElementStyle(by-kind) then AddElementTag(by $tags) overrides. */
function overrideFor(type: string, tags: string | undefined, styles: ParsedStyles): StyleOverride | undefined {
  const merged: StyleOverride = {}
  const kind = ELEMENT_KIND[type]
  if (kind && styles.elementStyles.has(kind)) Object.assign(merged, styles.elementStyles.get(kind))
  for (const tag of (tags ?? '').split('+').map(s => s.trim()).filter(Boolean)) {
    if (styles.elementTags.has(tag)) Object.assign(merged, styles.elementTags.get(tag))
  }
  return Object.keys(merged).length ? merged : undefined
}

async function layoutData2mx(layoutData: LayoutResult, pumlElements: EntityDescriptor[], pumlRelations: { source: string, target: string, label: string, description: string, bidirectional?: boolean, back?: boolean, tags?: string }[], styles: ParsedStyles): Promise<string> {
  const mx = new Mx(layoutData.height || 600, layoutData.width || 800)
  const parser = new EntityParser()

  // LayoutEngine (elkjs) returns every shape in ONE absolute coordinate
  // space (ELK parent-relative top-left coords accumulated to absolute).
  // Every cell is emitted flat under root ("1"); a boundary visually
  // contains its children because its computed box encloses their absolute
  // positions. (drawio parent-relative coords would double-offset against
  // the absolute layout output — flat + absolute is the consistent model.)

  // Every entity alias that actually got emitted as a drawio vertex/cluster.
  // Used to guarantee (and surface) edge-endpoint resolution: a relationship
  // whose source/target isn't in here would be an orphan connector in drawio.
  const emittedIds = new Set<string>()

  // Clusters (boundaries / Deployment_Node) FIRST so they render behind their
  // children (drawio z-order = document order). ELK-computed box encloses
  // the children's absolute positions; emitted flat (parent "1").
  if (layoutData.clusters && Array.isArray(layoutData.clusters)) {
    for (const cluster of layoutData.clusters) {
      const g = new MxGeometry(cluster.height, cluster.width, cluster.x, cluster.y)
      const info = parser.getObjectWithPropertyAndValueInHierarchy(pumlElements, 'alias', cluster.id)

      if (info) {
        // Boundary tags use boundaryTags/boundaryDefault; non-boundary
        // clusters (e.g. Deployment_Node) reuse the element override path.
        const isBoundary = info.type.endsWith('Boundary')
        let ovr = overrideFor(info.type, info.tags, styles)
        if (isBoundary) {
          const b: StyleOverride = { ...styles.boundaryDefault }
          for (const tag of (info.tags ?? '').split('+').map(s => s.trim()).filter(Boolean)) {
            if (styles.boundaryTags.has(tag)) Object.assign(b, styles.boundaryTags.get(tag))
          }
          ovr = Object.keys(b).length ? b : undefined
        }
        await mx.addMxC4(cluster.id, g, info.type, info.label, info.technology, info.description, undefined, ovr, info.link)
        emittedIds.add(cluster.id)
      }
    }
  }

  // Leaf shapes on top. Pass every valid C4 type through — Mx.addMxC4's
  // switch decides the shape/style.
  // Centre of every emitted leaf box, keyed by alias — used below to fan
  // same-node-pair edge groups into distinct lanes.
  const nodeCenter = new Map<string, NodeCenter>()
  if (layoutData.nodes && Array.isArray(layoutData.nodes)) {
    for (const node of layoutData.nodes) {
      const g = new MxGeometry(node.height, node.width, node.x, node.y)
      const info = parser.getObjectWithPropertyAndValueInHierarchy(pumlElements, 'alias', node.id)

      if (info) {
        // P8: tags that have an AddElementTag declaration render as
        // `«tag»` stereotype segments (same split rule as overrideFor).
        const stereotypeTags = (info.tags ?? '')
          .split('+').map((s) => s.trim())
          .filter((tg) => tg && styles.elementTags.has(tg))
        await mx.addMxC4(node.id, g, info.type, info.label, info.technology, info.description, undefined, overrideFor(info.type, info.tags, styles), info.link, stereotypeTags)
        emittedIds.add(node.id)
        const nx = node.x ?? 0, ny = node.y ?? 0
        nodeCenter.set(node.id, {
          cx: nx + node.width / 2, cy: ny + node.height / 2,
          hw: node.width / 2, hh: node.height / 2,
        })
      }
    }
  }

  // Emit ONE drawio edge per parsed relation — driven by pumlRelations, NOT by
  // the layout engine's edge set. The hard guarantee is "no relation is
  // silently dropped", which means iterating the relations themselves. Layout
  // points are looked up by the `rel<index>` edge name when present, else a
  // default geometry is used (drawio re-routes from source/target cells).
  const layoutEdgeByRelIdx = new Map<number, { x: number; y: number }[]>()
  // ELK's reserved non-overlapping label rect (absolute) per edge. Threaded
  // for the non-laned poly>2 (multi-bend hierarchical) branch so the label
  // can be re-seated onto ELK's rect instead of drawio's auto-anchor.
  const layoutEdgeLabelByRelIdx = new Map<number, { x: number; y: number; width: number; height: number }>()
  if (layoutData.edges && Array.isArray(layoutData.edges)) {
    for (const e of layoutData.edges) {
      const m = /^rel(\d+)$/.exec(e.name ?? '')
      if (m && e.points && e.points.length > 0) {
        layoutEdgeByRelIdx.set(parseInt(m[1], DECIMAL_RADIX), e.points)
      }
      if (m && e.label) {
        layoutEdgeLabelByRelIdx.set(parseInt(m[1], DECIMAL_RADIX), e.label)
      }
    }
  }
  // L2: ELK computes a routed polyline (edge sections) in the SAME absolute
  // space as the emitted shapes (LayoutEngine accumulates ELK's parent-
  // relative coords to absolute). Thread the INTERIOR points (drop the
  // first/last node-attach points — drawio anchors to the cells itself) as
  // drawio waypoints. Skipped when an endpoint is a
  // cluster: L4 reroutes such ranking edges onto a leaf, so that polyline
  // would not match the visible boundary endpoints — let drawio auto-route.
  const clusterIds = new Set<string>((layoutData.clusters ?? []).map(c => c.id))

  // Edge-label wrap cap — MUST match what LayoutEngine fed measureEdgeLabel
  // so the rendered wrapped block equals the space ELK reserved: the
  // narrower of the two endpoint leaves' widths (nodeCenter.hw*2 == the
  // measured leaf width ELK preserved). Cluster/unknown endpoint ⇒
  // Infinity ⇒ no wrap. Pure geometry, no constant.
  const edgeLabelCap = (a: string, b: string): number => {
    const ca = nodeCenter.get(a), cb = nodeCenter.get(b)
    return ca && cb ? Math.min(ca.hw * 2, cb.hw * 2) : Infinity
  }

  // Multi-edge lane separation — see src/layout/edgeLanes.mts for the why.
  // Feed each relation's MEASURED label width so the lane gap widens to the
  // group's widest label: every label then rides its own lane line at the
  // mid-gap (offset 0) without colliding with the neighbouring lane's
  // label, the way PlantUML fans parallel duplicates. The wrap cap matches
  // edgeLabelCap (what ELK reserved), and the breathing pad is one space
  // advance at the relationship-label font — a real metric, not a guess.
  const laneLabelWidth = (i: number): number =>
    measureEdgeLabel(
      pumlRelations[i].label,
      pumlRelations[i].description,
      edgeLabelCap(pumlRelations[i].source, pumlRelations[i].target),
    ).width
  const laneLabelPad = Math.ceil(spaceAdvance(RELATIONSHIP_LABEL_PX, false))
  const edgeLanes = assignEdgeLanes(
    pumlRelations, nodeCenter, (id) => clusterIds.has(id),
    undefined, laneLabelWidth, laneLabelPad,
  )

  for (let i = 0; i < pumlRelations.length; i++) {
    const rel = pumlRelations[i]
    const g = new MxGeometry()
    g.$.relative = 1
    const lane = edgeLanes.get(i)
    const poly = layoutEdgeByRelIdx.get(i)
    if (lane) {
      if (poly && poly.length > 2 && !clusterIds.has(rel.source) && !clusterIds.has(rel.target)) {
        // ELK produced a real obstacle-aware polyline for this laned edge —
        // preserve its bends, just shift each interior point into the lane
        // (rather than discarding the route for a single midpoint waypoint).
        for (const p of poly.slice(1, -1)) {
          g.addArrayPoint(new MxPoint(
            Math.round(p.x + lane.perp.x * lane.shift),
            Math.round(p.y + lane.perp.y * lane.shift),
          ))
        }
      } else {
        // Common case (per spike: ELK returns straight 2-point sections for
        // adjacent same-pair edges) — synthesize the lane midpoint waypoint.
        g.addArrayPoint(new MxPoint(lane.waypoint.x, lane.waypoint.y))
      }
      // Fan the label off the shared midpoint via an absolute offset mxPoint
      // (drawio-export honors this; it ignores the geometry.x fraction).
      g.addPoint(new MxPoint(lane.labelOffset.dx, lane.labelOffset.dy, 'offset'))
    } else if (poly && poly.length > 2 && !clusterIds.has(rel.source) && !clusterIds.has(rel.target)) {
      for (const p of poly.slice(1, -1)) {
        g.addArrayPoint(new MxPoint(Math.round(p.x), Math.round(p.y)))
      }
      // #24-hier: a non-laned MULTI-BEND hierarchical edge. ELK already
      // reserved a non-overlapping label rect (layoutEdgeLabelByRelIdx),
      // but drawio auto-anchors the label at the routed polyline's
      // LENGTH-midpoint — which, for the External-fanout edges in
      // edge-large-graph, lands in the crammed junction. Re-seat the
      // label onto ELK's rect with the absolute offset between ELK's
      // label centre and drawio's path-midpoint anchor. Same offset
      // mxPoint mechanism the lane fan + Context solo paths use; scoped
      // to THIS branch only (2-point `calls` chain, laned, and
      // Context(#24) paths are untouched ⇒ byte-identical).
      const lbl = layoutEdgeLabelByRelIdx.get(i)
      if (lbl && poly) {
        const mid = polylineMidpoint(poly)
        g.addPoint(new MxPoint(
          Math.round(lbl.x + lbl.width / 2 - mid.x),
          Math.round(lbl.y + lbl.height / 2 - mid.y),
          'offset',
        ))
      }
    } else {
      // Straight 2-point edge: ELK returned a section with no bend points
      // (a same-rank or short hierarchical hop). ELK does not place the
      // label, so drawio anchors it at the A↔B midpoint, which can land
      // on an unrelated node. Push it the minimal geometry-exact distance
      // to clear every other box — the same offset mechanism the lane fan
      // and the #56 multi-bend re-seat use. No synthetic waypoint is
      // added: ELK's straight route is already deterministic and matches
      // PlantUML/dot's straight connector for this case.
      const A = nodeCenter.get(rel.source)
      const B = nodeCenter.get(rel.target)
      if (A && B) {
        const d = measureEdgeLabel(rel.label, rel.description, edgeLabelCap(rel.source, rel.target))
        const obstacles: NodeRect[] = []
        for (const [id, c] of nodeCenter) {
          if (id === rel.source || id === rel.target) continue
          obstacles.push({ x: c.cx - c.hw, y: c.cy - c.hh, w: c.hw * 2, h: c.hh * 2 })
        }
        const off = resolveLabelOverlap(A, B, d.width, d.height, obstacles)
        if (off) g.addPoint(new MxPoint(off.dx, off.dy, 'offset'))
      }
    }
    const relOvr: StyleOverride = { ...styles.relDefault }
    for (const tag of (rel.tags ?? '').split('+').map(s => s.trim()).filter(Boolean)) {
      if (styles.relTags.has(tag)) Object.assign(relOvr, styles.relTags.get(tag))
    }
    // C4-PlantUML grammar: Rel(from, to, "verb", ?"technology"). The parser
    // names group 5 `label` (the verb shown bold, -> c4Name) and group 6
    // `description` (which is semantically the *technology*, shown bracketed
    // -> c4Technology). Passing rel.description as the `technology` arg fixes
    // the swapped-field bug where the verb landed in unused c4Name and the
    // template rendered the technology bold + an empty "[]".
    await mx.addMxC4Relationship(g, rel.source, rel.target, 'Relationship', rel.label, rel.description, undefined, rel.bidirectional === true, Object.keys(relOvr).length ? relOvr : undefined, edgeLabelCap(rel.source, rel.target), rel.back === true)
    if (!emittedIds.has(rel.source) || !emittedIds.has(rel.target)) {
      // Not silently swallowed: an unresolved endpoint means the puml
      // referenced an alias that never produced a shape. Surface it so the
      // parity test / CI fails loudly instead of shipping an orphan connector.
      console.warn(`catalyst: relationship "${rel.source}" -> "${rel.target}" has an endpoint with no emitted shape; drawio connector will be orphaned`)
    }
  }

  return await mx.generate()
}



export interface CatalystOptions {
  layoutDirection?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  edgesep?: number
  ranksep?: number
  marginx?: number
  marginy?: number
}

export class Catalyst {
  /**
   * Convert PlantUML C4 diagram to draw.io XML format
   * @param pumlContent - The PlantUML content as string
   * @param options - Layout options for the diagram
   * @returns Promise<string> - The draw.io XML content
   */
  static async convert(pumlContent: string, options: CatalystOptions = {}): Promise<string> {
    const elements = new EntityParser().parse(pumlContent)
    const relations = RelParser.getRelations(pumlContent)
    const layoutConstraints = RelParser.getLayoutConstraints(pumlContent)
    const styles = StyleParser.parse(pumlContent)

    // Fail loudly instead of emitting a content-less stub. catalyst converts
    // the STATIC C4 subset (Context/Container/Component/Deployment with
    // Person/System/Container/Component/Node + Rel/BiRel/RelIndex). The
    // C4-PlantUML *dynamic/sequence* flavor (C4_Sequence.puml, actor/
    // participant + message arrows / ==stage== dividers) has no handler, so
    // it would otherwise produce a valid-but-empty <mxGraphModel> that
    // renders as a blank image downstream — a silent failure.
    const seq = /^\s*!include\b.*\bC4_Sequence(?:\.puml)?\b/m.test(pumlContent)
      || /^\s*participant\s+/m.test(pumlContent)
    if (elements.length === 0 && relations.length === 0) {
      if (seq) {
        throw new Error(
          'unsupported C4-PlantUML diagram type: C4_Sequence — catalyst '
          + 'converts the static C4 subset only (Context / Container / '
          + 'Component / Deployment). Sequence/dynamic-message diagrams are '
          + 'not supported.',
        )
      }
      throw new Error(
        'no convertible C4 elements found — catalyst parsed zero entities '
        + 'and zero relations from the input. Expected static C4-PlantUML '
        + '(Person/System/Container/Component/Node + Rel/BiRel/RelIndex). '
        + 'Refusing to emit a content-less draw.io stub.',
      )
    }

    const layoutOptions = {
      rankdir: options.layoutDirection || 'TB',
      nodesep: options.nodesep || 50,
      edgesep: options.edgesep || 10,
      // Inter-layer gap → ELK `layered.spacing.nodeNodeBetweenLayers`.
      // 36 == Graphviz `dot`'s default ranksep (0.5in = 36pt). dot IS
      // PlantUML's own C4 layout engine, i.e. the exact renderer the
      // side-by-side comparison is judged against — so matching its
      // ranksep removes the "connectors too long vs the PlantUML render"
      // gap. Empirically (spike, post line-height/fidelity): example.puml
      // edge centre-distance 268→240 (~10% shorter), c4-container
      // unaffected, ZERO node- or label-overlap regression at this value.
      // A cited reference, not a tuned constant.
      ranksep: options.ranksep || 36,
      marginx: options.marginx || 20,
      marginy: options.marginy || 20
    }

    const layoutData = await LayoutEngine.calculateLayout(elements, relations, layoutOptions, layoutConstraints)
    return await layoutData2mx(layoutData, elements, relations, styles)
  }

  /**
   * Parse PlantUML content and extract entities
   * @param pumlContent - The PlantUML content as string
   * @returns EntityDescriptor[] - Array of parsed entities
   */
  static parseEntities(pumlContent: string): EntityDescriptor[] {
    return new EntityParser().parse(pumlContent)
  }

  /**
   * Parse PlantUML content and extract relations
   * @param pumlContent - The PlantUML content as string
   * @returns Array of relations
   */
  static parseRelations(pumlContent: string): { source: string, target: string, label: string, description: string, bidirectional: boolean, back: boolean }[] {
    return RelParser.getRelations(pumlContent)
  }
}
