import { EntityParser, EntityDescriptor } from "./puml/EntityParser.mjs"
import { Mx, MxGeometry } from './mx/Mx.mjs'
import { MxPoint } from './mx/MxPoint.mjs'
import { RelParser } from './puml/RelParser.mjs'
import { parseNotes, type C4Note } from './puml/NoteParser.mjs'
import { parseProperties, type C4PropertyTable } from './puml/PropertyParser.mjs'
import { splitLabelLines } from './text/labelLines.mjs'
import { ELEMENT_BODY_PX, PUML_LEAF_BOX } from './mx/c4/theme.mjs'
import { LayoutEngine, LayoutResult } from './layout/LayoutEngine.mjs'
import { DotLayout } from './layout/DotLayout.mjs'
import { assignEdgeLanes, resolveLabelOverlap, slideLabelAlongLane, polylineMidpoint, enforceApproachClearance, type NodeCenter, type NodeRect } from './layout/edgeLanes.mjs'
import { measureEdgeLabel } from './layout/measureNode.mjs'
import { spaceAdvance, textWidth, renderedLineHeight, MX_DEFAULT_FONTSIZE } from './text/TextMetrics.mjs'
import { RELATIONSHIP_LABEL_PX, DIAGRAM_TITLE_PX, SHAPE } from './mx/c4/theme.mjs'

/** Final-approach / first-departure perpendicular standoff for emitted
 *  edge waypoints. `2·REL_ARROW_SIZE` clears draw.io's arrowhead reach
 *  (the spike vs the real render: occlusion stops past ~1·arrow, a
 *  clean shaft needs ~2·) + the integer-quantisation half-step (emitted
 *  mxPoints are `Math.round`-ed). Cited renderer constant ×2 + ½-ULP —
 *  a measured metric, NOT a tuned pad. See
 *  `docs/research/arrowhead-orthogonal-routing.md`. */
const APPROACH_CLEARANCE_PX = 2 * SHAPE.REL_ARROW_SIZE + 0.5
import { StyleParser } from './puml/StyleParser.mjs'
import { SeqConverter } from './seq/SeqConverter.mjs'
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

async function layoutData2mx(layoutData: LayoutResult, pumlElements: EntityDescriptor[], pumlRelations: { source: string, target: string, label: string, description: string, bidirectional?: boolean, back?: boolean, tags?: string }[], styles: ParsedStyles, title?: string, notes: C4Note[] = [], props: Map<string, C4PropertyTable> = new Map()): Promise<string> {
  const mx = new Mx(layoutData.height || 600, layoutData.width || 800,
    { sketch: styles.sketch, hideStereotype: styles.hideStereotype })
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

  // C4 `note left|right|top|bottom of X` callouts (was silently
  // dropped; `note over` is sequence-only — PlantUML errors on it in a
  // static diagram — so it is NOT a static-C4 form, see NoteParser).
  // Placed POST-LAYOUT from the target node's laid-out box —
  // ELK/EntityParser untouched ⇒ static-C4 corpus byte-identical by
  // construction (no corpus fixture has a note; gallery-verify proves
  // it). Every dimension is a measured font metric or the cited
  // PlantUML inset — no magic constant. v1 limitation: ELK is unaware
  // of notes (no reflow); a note is clamped to ≥0 so it never goes
  // off-canvas, which can overlap an edge-of-diagram target.
  const NOTE_PX = ELEMENT_BODY_PX;
  const NOTE_PAD = PUML_LEAF_BOX.INSET;
  const NOTE_GAP = renderedLineHeight(NOTE_PX);
  notes.forEach((nt, i) => {
    const geoms = nt.targets
      .map((tg) => nodeCenter.get(tg)).filter((c): c is NodeCenter => !!c);
    if (geoms.length === 0) return;            // unresolved target → best-effort skip (v1)
    const bx1 = Math.min(...geoms.map((g) => g.cx - g.hw));
    const by1 = Math.min(...geoms.map((g) => g.cy - g.hh));
    const bx2 = Math.max(...geoms.map((g) => g.cx + g.hw));
    const by2 = Math.max(...geoms.map((g) => g.cy + g.hh));
    const lines = splitLabelLines(nt.text);
    const lns = lines.length ? lines : [''];
    const w = Math.ceil(lns.reduce(
      (m, l) => Math.max(m, textWidth(l, NOTE_PX, false)), 0) + 2 * NOTE_PAD);
    const h = Math.ceil(lns.length * renderedLineHeight(NOTE_PX) + 2 * NOTE_PAD);
    let x: number, y: number;
    switch (nt.pos) {
      case 'left':   x = bx1 - w - NOTE_GAP;            y = by1 + (by2 - by1 - h) / 2; break;
      case 'right':  x = bx2 + NOTE_GAP;                y = by1 + (by2 - by1 - h) / 2; break;
      case 'top':    x = bx1 + (bx2 - bx1 - w) / 2;     y = by1 - h - NOTE_GAP;        break;
      case 'bottom': x = bx1 + (bx2 - bx1 - w) / 2;     y = by2 + NOTE_GAP;            break;
      default:       x = (bx1 + bx2) / 2 - w / 2;       y = (by1 + by2) / 2 - h / 2;   break; // fallback (centred)
    }
    mx.addMxNote(
      new MxGeometry(h, w, Math.max(0, Math.round(x)), Math.max(0, Math.round(y))),
      nt.text, `note-${i}`);
  });

  // C4 `SHOW_LEGEND` — a tag-entry legend box placed POST-LAYOUT to
  // the RIGHT of the content (PlantUML's "legend right"). Entries =
  // the AddElementTag/AddRelTag/AddBoundaryTag stereotypes; swatch =
  // each tag's fillColor. Overlay only ⇒ zero corpus risk (no corpus
  // fixture uses SHOW_LEGEND). Sizes from font metrics — no magic.
  if (styles.legend) {
    const seen = new Set<string>();
    const entries: { name: string; fill: string }[] = [];
    for (const m of [styles.elementTags, styles.boundaryTags, styles.relTags]) {
      for (const [name, ov] of m) {
        if (seen.has(name)) continue;
        seen.add(name);
        entries.push({ name, fill: ov.fillColor ?? '#cccccc' });
      }
    }
    if (entries.length) {
      const lh = renderedLineHeight(NOTE_PX);
      const SWATCH = Math.ceil(lh);                 // measured: a line-tall swatch
      const lw = entries.reduce(
        (m, e) => Math.max(m, textWidth(e.name, NOTE_PX, false)), textWidth('Legend', NOTE_PX, true));
      const lW = Math.ceil(lw + SWATCH + 3 * NOTE_PAD);
      const lH = Math.ceil((entries.length + 1) * lh + 2 * NOTE_PAD);
      const lX = Math.round((layoutData.width || 800) + NOTE_GAP);
      mx.addMxLegend(new MxGeometry(lH, lW, lX, 0), entries);
    }
  }

  // C4 `AddProperty`/`SetPropertyHeader` — a property table rendered
  // POST-LAYOUT just below its element (v1: an adjacent cell, not
  // embedded — structurally faithful, properties SHOWN not dropped).
  // Overlay only ⇒ zero corpus risk. Sizes from font metrics.
  let pIdx = 0;
  for (const [alias, tbl] of props) {
    const c = nodeCenter.get(alias);
    if (!c) continue;                               // unresolved → skip (v1)
    const allRows = [...(tbl.header.length ? [tbl.header] : []), ...tbl.rows];
    const cols = Math.max(...allRows.map((r) => r.length), 1);
    const colW: number[] = [];
    for (let ci = 0; ci < cols; ci++) {
      colW[ci] = Math.ceil(allRows.reduce(
        (m, r) => Math.max(m, textWidth(r[ci] ?? '', NOTE_PX, false)), 0) + 2 * NOTE_PAD);
    }
    const pW = colW.reduce((a, b) => a + b, 0);
    const pH = Math.ceil(allRows.length * renderedLineHeight(NOTE_PX) + 2 * NOTE_PAD);
    const pX = Math.round(c.cx - pW / 2);
    const pY = Math.round(c.cy + c.hh + NOTE_GAP);
    mx.addMxPropertyTable(
      new MxGeometry(pH, pW, Math.max(0, pX), Math.max(0, pY)),
      tbl.header, tbl.rows, `proptable-${pIdx++}`);
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
    if (layoutData.routesAuthoritative && poly && poly.length > 2
        && !clusterIds.has(rel.source) && !clusterIds.has(rel.target)) {
      // Item 1a — AUTHORITATIVE ROUTE (the `dot` engine). dot routes
      // every edge as a globally crossing-free spline (parallel /
      // BiRel / antiparallel edges fanned by dot's own port ordering
      // — the whole point of the swap). Emit its interior waypoints
      // VERBATIM; `curved=1` (ADR 0013, no edgeStyle) makes draw.io
      // spline through them faithfully. The ELK-era lane
      // perpendicular-shove and the multi-bend/straight ELK branches
      // are DELIBERATELY bypassed: applied on top of dot's splines
      // they reintroduce exactly the crossings the swap removes
      // (measured root cause: rel-fan-stress raw spline 0 crossings →
      // post-lane render 10; the CLAUDE.md item-2 "local per-pair
      // perpendicular translation ignorant of other edges" defect).
      const interior = poly.slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      for (const p of interior) g.addArrayPoint(new MxPoint(p.x, p.y))
      // dot does not place edge labels; draw.io anchors the label at
      // the rendered path midpoint (what PlantUML/dot also do). Slide
      // ALONG the route axis only to clear any unrelated leaf — the
      // same geometry-exact de-collision the ELK branches use, and
      // byte-inert (t=0) wherever it already clears.
      const A = nodeCenter.get(rel.source)
      const B = nodeCenter.get(rel.target)
      if (A && B) {
        const route = [{ x: A.cx, y: A.cy }, ...interior, { x: B.cx, y: B.cy }]
        const mid = polylineMidpoint(route)
        const d = measureEdgeLabel(rel.label, rel.description, edgeLabelCap(rel.source, rel.target))
        const vx = B.cx - A.cx, vy = B.cy - A.cy
        const len = Math.hypot(vx, vy) || 1
        const axis = { x: vx / len, y: vy / len }
        const obstacles: NodeRect[] = []
        for (const [id, c] of nodeCenter) {
          if (id === rel.source || id === rel.target) continue
          obstacles.push({ x: c.cx - c.hw, y: c.cy - c.hh, w: c.hw * 2, h: c.hh * 2 })
        }
        const t = slideLabelAlongLane({ x: mid.x, y: mid.y }, axis, d.width, d.height, obstacles)
        if (t !== 0) g.addPoint(new MxPoint(Math.round(axis.x * t), Math.round(axis.y * t), 'offset'))
      }
    } else if (lane) {
      // Collect the interior waypoints actually emitted so the label
      // anchor below is computed against the SAME polyline the renderer
      // (and the factcheck oracle) sees — never ELK's raw attach-point
      // poly (the P12 base-point lesson, mirrored here for laned edges).
      const laneInterior: { x: number; y: number }[] = []
      if (poly && poly.length > 2 && !clusterIds.has(rel.source) && !clusterIds.has(rel.target)) {
        // ELK produced a real obstacle-aware polyline for this laned edge —
        // preserve its bends, just shift each interior point into the lane
        // (rather than discarding the route for a single midpoint waypoint).
        for (const p of poly.slice(1, -1)) {
          laneInterior.push({
            x: Math.round(p.x + lane.perp.x * lane.shift),
            y: Math.round(p.y + lane.perp.y * lane.shift),
          })
        }
      } else {
        // Common case (per spike: ELK returns straight 2-point sections for
        // adjacent same-pair edges) — synthesize the lane midpoint waypoint.
        laneInterior.push({ x: lane.waypoint.x, y: lane.waypoint.y })
      }
      // Perpendicular-approach clearance for the LANED multi-bend
      // sub-case (ELK routed a real polyline around — e.g. the laned
      // ANTIPARALLEL back-edge in rel-tech-vs-notech, whose feeder turn
      // otherwise cuts through its own arrowhead, same occlusion class
      // as topology-cyclic — confirmed by the SVG `arrowskew` gate).
      // The single-midpoint synthesized fan case (length 1) is the
      // load-bearing perpendicular lane spread — NOT an approach run —
      // so it is left untouched (a different geometry, not spiked here).
      const Alane = nodeCenter.get(rel.source)
      const Blane = nodeCenter.get(rel.target)
      const laneEmit = (Alane && Blane && laneInterior.length >= 2)
        ? enforceApproachClearance(laneInterior, Alane, Blane, APPROACH_CLEARANCE_PX)
        : laneInterior
      for (const p of laneEmit) g.addArrayPoint(new MxPoint(p.x, p.y))
      // Fan the label off the shared midpoint via an absolute offset mxPoint
      // (drawio-export honors this; it ignores the geometry.x fraction).
      // P12: the lane offset alone (perpendicular spread) places the label
      // ON its lane line — but that line can cross an UNRELATED leaf that
      // ELK happened to rank in the corridor (c4-all-rel-variants `d`,
      // c4-exhaustive `sys`). The perpendicular position is load-bearing
      // (it fans the group's labels), so de-collide by sliding ALONG the
      // lane line only. Anchor = the rendered route's midpoint + the lane
      // offset, exactly what the factcheck `labelHit` gate computes, so
      // the slide fires on precisely the gate's defect set and is inert
      // (byte-identical) everywhere it already passes.
      let labelDx = lane.labelOffset.dx, labelDy = lane.labelOffset.dy
      const A = Alane
      const B = Blane
      if (A && B) {
        // P12: anchor on the route drawio actually draws (the
        // clearance-adjusted `laneEmit`, not the pre-adjust array).
        const route = [{ x: A.cx, y: A.cy }, ...laneEmit, { x: B.cx, y: B.cy }]
        const m = polylineMidpoint(route)
        const centre = { x: m.x + labelDx, y: m.y + labelDy }
        const vx = B.cx - A.cx, vy = B.cy - A.cy
        const len = Math.hypot(vx, vy) || 1
        const axis = { x: vx / len, y: vy / len }
        const d = measureEdgeLabel(rel.label, rel.description, edgeLabelCap(rel.source, rel.target))
        const obstacles: NodeRect[] = []
        for (const [id, c] of nodeCenter) {
          if (id === rel.source || id === rel.target) continue
          obstacles.push({ x: c.cx - c.hw, y: c.cy - c.hh, w: c.hw * 2, h: c.hh * 2 })
        }
        const t = slideLabelAlongLane(centre, axis, d.width, d.height, obstacles)
        if (t !== 0) {
          labelDx = Math.round(labelDx + axis.x * t)
          labelDy = Math.round(labelDy + axis.y * t)
        }
      }
      g.addPoint(new MxPoint(labelDx, labelDy, 'offset'))
    } else if (poly && poly.length > 2 && !clusterIds.has(rel.source) && !clusterIds.has(rel.target)) {
      const rawInterior = poly.slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      // Perpendicular-approach clearance (the REAL fix for the
      // orthogonalEdgeStyle arrowhead skew — proven vs the drawio
      // render, `docs/research/arrowhead-orthogonal-routing.md`). Push
      // the endpoint-adjacent bends out so draw.io's feeder cannot
      // occlude the arrowhead. The SAME adjusted array is used for the
      // emit AND the label base-point (P12: anchor on the route drawio
      // actually draws).
      const Ac = nodeCenter.get(rel.source)
      const Bc = nodeCenter.get(rel.target)
      const interior = (Ac && Bc)
        ? enforceApproachClearance(rawInterior, Ac, Bc, APPROACH_CLEARANCE_PX)
        : rawInterior
      for (const p of interior) {
        g.addArrayPoint(new MxPoint(p.x, p.y))
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
      //
      // P12: the anchor MUST be computed over the polyline drawio
      // ACTUALLY renders, not ELK's raw `poly`. catalyst emits only the
      // INTERIOR waypoints (poly.slice(1,-1)) and lets drawio re-attach
      // the endpoints to the source/target CELL CENTRES — so ELK's
      // node-attach-point endpoints are discarded. Computing the offset
      // against `polylineMidpoint(poly)` (ELK attach endpoints) but
      // applying it against drawio's `[A-centre,…interior,B-centre]`
      // route is a base-point mismatch: in c4-container it displaced the
      // ingress→apps "Routes /" and lb→apps labels ~186 px onto the
      // `docker` leaf. Anchor on the same route the comparator/drawio
      // use so `renderedMidpoint + offset === ELK-label-centre` by
      // construction (provable against the factcheck oracle, not eyeballed).
      const lbl = layoutEdgeLabelByRelIdx.get(i)
      const A = Ac
      const B = Bc
      if (lbl && A && B) {
        const route = [{ x: A.cx, y: A.cy }, ...interior, { x: B.cx, y: B.cy }]
        const mid = polylineMidpoint(route)
        // The label renders at ELK's placed rect `lbl` (the offset
        // below re-anchors renderedMidpoint → lbl.centre). ELK places
        // it clear of the boxes IT laid out, but a multi-rank routed
        // edge's label can still land on an INTERVENING leaf whose
        // (correct, ADR-0011-bigger) box ELK packed tighter than the
        // label needs — the c4-deployment `SQL` over `cache` defect.
        // This branch was the ONLY de-collision-less one (laned uses
        // slideLabelAlongLane, straight uses resolveLabelOverlap);
        // add the SAME geometry-exact slide so all three guarantee no
        // `labelHit`. Slide is byte-inert where ELK already cleared
        // (t=0 ⇒ unchanged offset), so only the genuine defect set
        // moves — provable against the factcheck oracle.
        let cx = lbl.x + lbl.width / 2, cy = lbl.y + lbl.height / 2
        const vx = B.cx - A.cx, vy = B.cy - A.cy
        const len = Math.hypot(vx, vy) || 1
        const axis = { x: vx / len, y: vy / len }
        const obstacles: NodeRect[] = []
        for (const [id, c] of nodeCenter) {
          if (id === rel.source || id === rel.target) continue
          obstacles.push({ x: c.cx - c.hw, y: c.cy - c.hh, w: c.hw * 2, h: c.hh * 2 })
        }
        const t = slideLabelAlongLane(
          { x: cx, y: cy }, axis, lbl.width, lbl.height, obstacles)
        if (t !== 0) { cx += axis.x * t; cy += axis.y * t }
        g.addPoint(new MxPoint(
          Math.round(cx - mid.x),
          Math.round(cy - mid.y),
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
    await mx.addMxC4Relationship(g, rel.source, rel.target, 'Relationship', rel.label, rel.description, undefined, rel.bidirectional === true, Object.keys(relOvr).length ? relOvr : undefined, edgeLabelCap(rel.source, rel.target), rel.back === true, (lane && !layoutData.routesAuthoritative) ? { exit: lane.exit, entry: lane.entry } : undefined)
    if (!emittedIds.has(rel.source) || !emittedIds.has(rel.target)) {
      // Not silently swallowed: an unresolved endpoint means the puml
      // referenced an alias that never produced a shape. Surface it so the
      // parity test / CI fails loudly instead of shipping an orphan connector.
      console.warn(`catalyst: relationship "${rel.source}" -> "${rel.target}" has an endpoint with no emitted shape; drawio connector will be orphaned`)
    }
  }

  // Completeness invariant (MDE M2M-transformation principle): the
  // source `title` directive MUST trace to a target element. PlantUML
  // renders it bold-black at the TOP of the canvas, content below; we
  // mirror that by seating the title one blank line above the topmost
  // emitted shape (the same "one renderedLineHeight of clearance"
  // convention as the boundary title-band). Placing it ABOVE the
  // content (rather than translating every cell down) keeps every
  // existing cell byte-identical — the only delta is one added cell,
  // and the factcheck oracle excludes `__title` from node-extent so
  // wRatio/overlap/ratchet stay like-for-like.
  if (title) {
    const boxes = [...(layoutData.nodes ?? []), ...(layoutData.clusters ?? [])]
    if (boxes.length) {
      const minX = Math.min(...boxes.map(b => b.x ?? 0))
      const minY = Math.min(...boxes.map(b => b.y ?? 0))
      const titleH = Math.ceil(renderedLineHeight(DIAGRAM_TITLE_PX))
      const gap = Math.ceil(renderedLineHeight(MX_DEFAULT_FONTSIZE))
      const titleW = Math.ceil(textWidth(title, DIAGRAM_TITLE_PX, true))
      mx.addTitle(title, new MxGeometry(titleH, titleW, minX, minY - titleH - gap))
    }
  }

  return await mx.generate()
}



export interface CatalystOptions {
  layoutDirection?: 'TB' | 'BT' | 'LR' | 'RL'
  nodesep?: number
  edgesep?: number
  ranksep?: number
  /** @deprecated #15 — accepted for API compatibility but IGNORED:
   *  LayoutEngine maps only nodesep/edgesep/ranksep to ELK. */
  marginx?: number
  /** @deprecated #15 — accepted for API compatibility but IGNORED. */
  marginy?: number
  /**
   * Item 1a — layout engine selector. `'elk'` (DEFAULT) is the
   * battle-tested elkjs path; `'dot'` opts into the Graphviz-`dot`
   * engine (the swap target — PlantUML's own engine, 0 edge crossings).
   * Precedence: this option › `process.env.LAYOUT_ENGINE` › `'elk'`.
   * ELK stays the default + the only fallback until 1a/P6; a `dot`
   * failure is NEVER silently swallowed into the ELK path (that would
   * be fake-green) — it surfaces so P3–P5 measure real behaviour.
   */
  layoutEngine?: 'elk' | 'dot'
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

    // catalyst converts the STATIC C4 subset (Context/Container/
    // Component/Deployment). The C4-PlantUML *dynamic/sequence* flavor
    // (C4_Sequence.puml, actor/participant + message arrows) is a
    // SEPARATE pipeline (ADR 0007): this detector is the dispatch seam
    // — when it matches, hand off to `SeqConverter` instead of throwing.
    // `SeqParser` inside it still fail-louds (throws `SeqParseError`) on
    // a v2-deferred construct (`==divider==`, `alt/opt/loop`, `box`),
    // so the no-silent-drop contract is preserved end-to-end. A
    // non-sequence zero-element input still fail-louds below.
    const seq = /^\s*!include\b.*\bC4_Sequence(?:\.puml)?\b/m.test(pumlContent)
      || /^\s*participant\s+/m.test(pumlContent)
    // Dispatch to the sequence pipeline FIRST — the `C4_Sequence`
    // include (and a raw `participant` line) is authoritative: a
    // sequence diagram is NOT static C4 even though C4_Sequence
    // legitimately reuses the `Rel()`/`Person()`/`*_Boundary()`
    // macros (ADR 0007 §Fact-check). Gating this on
    // `elements===0 && relations===0` mis-routed every C4-macro-form
    // sequence diagram into the static-C4/ELK path → ELK
    // `Referenced shape does not exist` crash / 0 lifelines (caught
    // by the seq-perm-* permutation matrix; the raw-arrow form
    // happened to parse 0 relations so the old gate accidentally
    // worked for it). Static C4 never includes C4_Sequence nor uses
    // a `participant` line, so the static corpus is unaffected
    // (gallery-verify/factcheck/arrowskew byte-identical — verified).
    if (seq) {
      return SeqConverter.convert(pumlContent)
    }
    if (elements.length === 0 && relations.length === 0) {
      throw new Error(
        'no convertible C4 elements found — catalyst parsed zero entities '
        + 'and zero relations from the input. Expected static C4-PlantUML '
        + '(Person/System/Container/Component/Node + Rel/BiRel/RelIndex). '
        + 'Refusing to emit a content-less draw.io stub.',
      )
    }

    const layoutOptions = {
      rankdir: options.layoutDirection || 'TB',
      // #15 magic-constant taxonomy: `nodesep` → ELK
      // `elk.spacing.nodeNode`. 50 is a DOCUMENTED CONVENTION (ELK's
      // own default is 20; 50 is catalyst's chosen intra-rank gap — a
      // tunable public-API default, the slot-2 "canonical default"
      // form, overridable via `options.nodesep`).
      nodesep: options.nodesep || 50,
      // `edgesep` → ELK `elk.layered.spacing.edgeEdgeBetweenLayers`;
      // 10 == that option's own ELK default (a CITED renderer default,
      // not a tuned value), kept as the tunable public-API default.
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
      // #15: `marginx`/`marginy` were emitted here as `|| 20` but
      // `LayoutEngine` maps ONLY nodesep/edgesep/ranksep to ELK — the
      // margin values were dead config (never reached the layout
      // engine). Removed (byte-identical: ELK never saw them). The
      // public `CatalystOptions.marginx?/marginy?` fields are retained
      // as accepted-but-ignored no-ops to keep the API non-breaking.
    }

    // Item 1a / ADR 0014 — engine selection. `LayoutEngine` (elkjs)
    // and `DotLayout` (Graphviz-dot) share an identical static
    // signature, so the swap is one binding. Precedence: option ›
    // env › DEFAULT. **P6 (2026-05-19): the default is now `dot`** —
    // PlantUML's own engine, 0 edge crossings (edgecross 30→0 proven
    // on the rendered render-truth). ELK remains reachable as the
    // explicit opt-out fallback (`layoutEngine:'elk'` /
    // `LAYOUT_ENGINE=elk`) and is NOT removed until ≥1 green release
    // on `dot` (ADR 0014 §P6 deprecation). A dot failure is not
    // caught here (it must surface — masking it would be the cardinal
    // fake-green).
    const engineName = options.layoutEngine
      ?? (process.env.LAYOUT_ENGINE === 'elk' ? 'elk' : 'dot')
    const engine = engineName === 'dot' ? DotLayout : LayoutEngine
    const layoutData = await engine.calculateLayout(elements, relations, layoutOptions, layoutConstraints)
    // PlantUML `title <text>` (single-line; the form used corpus-wide).
    // Skip-listed by EntityParser — parsed here so the completeness
    // invariant (every source construct traces to a target element)
    // holds: the title is emitted as a drawio cell, not dropped.
    const title = (/^[ \t]*title[ \t]+(.+?)[ \t]*$/m.exec(pumlContent) ?? [])[1]
    return await layoutData2mx(layoutData, elements, relations, styles, title, parseNotes(pumlContent), parseProperties(pumlContent))
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
