/**
 * Multi-edge lane separation (renderer-side).
 *
 * ELK de-collides antiparallel/parallel edges by distributing their node-border
 * attach points, but catalyst drops ELK's 2-point sections (no interior bend),
 * so draw.io would re-route every edge in a same-node-pair group
 * centre-to-centre — collinear, with labels stacked at the shared midpoint.
 *
 * This module groups relations by their UNORDERED node pair (catching
 * antiparallel `Rel`+`Rel_Back` AND parallel duplicates) and, for any group of
 * >1 edge, fans each onto its own lane: a deterministic perpendicular offset
 * from the pair midpoint plus a matching label offset.
 *
 * Pure & side-effect free so it is unit-testable without ELK/draw.io.
 */

/** Box centre + half-extents (hw = width/2, hh = height/2). The half-extents
 *  let the along-edge label cap be derived from real geometry (the label
 *  cannot be pushed past either node's border) rather than a guessed fraction. */
export interface NodeCenter { cx: number; cy: number; hw: number; hh: number }

export interface LaneGeometry {
  /** Interior waypoint draw.io routes the edge through (absolute coords). */
  waypoint: { x: number; y: number }
  /**
   * Label position as an absolute px offset from the edge's default label
   * anchor — emitted as `<mxPoint as="offset">` on the edge geometry.
   * Spike-verified: drawio-export honors the offset mxPoint but IGNORES the
   * `geometry.x` along-edge fraction, so fraction-based positioning does not
   * de-collide labels.
   */
  labelOffset: { dx: number; dy: number }
  /**
   * Canonical-frame perpendicular UNIT vector + signed lane shift (px). Lets
   * the caller offset ELK's own routed polyline points by the same lane
   * amount (preserving obstacle-aware bends) instead of replacing them with
   * the single midpoint `waypoint`.
   */
  perp: { x: number; y: number }
  shift: number
  /**
   * Per-lane box-border attach fractions (mxGraph `exitX/exitY` on the
   * SOURCE, `entryX/entryY` on the TARGET — each in [0,1] of that box).
   * P10: without these every same-pair edge attaches at the box CENTRE,
   * so two antiparallel one-way edges visually collapse into one
   * (looking bidirectional + arrowless). Offsetting the attach point by
   * the lane's own `shift` along the box border facing the other node
   * makes each edge leave/enter a DISTINCT point — two clearly separate
   * one-way lines, each with its single arrowhead, exactly as PlantUML
   * renders Rel(a,c)+Rel(c,a). Geometry-derived (centre ± shift as a
   * fraction of the real box extent), clamped to the border.
   */
  exit: { x: number; y: number }
  entry: { x: number; y: number }
}

/** Default lane spacing for the routed waypoint (the minimum fan width
 *  when labels are absent/narrow). When a group carries labels the
 *  effective gap is widened to the group's widest label so each label,
 *  sitting on its OWN lane line, clears the neighbouring lane's label —
 *  see `assignEdgeLanes`. PlantUML fans parallel duplicates exactly this
 *  way: each label rides next to its own curve, never stacked. */
export const EDGE_LANE_GAP_PX = 44

/** mxGraph exit/entry fractions are in [0,1] of the box; 0.5 == the
 *  centre of that edge (the unconstrained default catalyst used before
 *  P10). Named so the per-lane attach math reads as "centre ± offset". */
const HALF = 0.5
/** Clamp an exit/entry fraction onto the box border. A lane whose
 *  perpendicular offset would exceed the box extent is pinned to the
 *  corner rather than detaching outside the shape. */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * @param relations  visible relations, in emission order; the index into this
 *                    array is the key of the returned map.
 * @param nodeCenter  alias → box centre.
 * @param isExcludedEndpoint  e.g. `id => clusterIds.has(id)` — boundary/cluster
 *                    endpoints are auto-routed by draw.io, never laned.
 * @param gapPx  minimum lane spacing (used when labels are absent/narrow).
 * @param labelWidthOf  optional: relIdx → measured label width (px). When
 *                    given, each group's effective gap is widened to the
 *                    group's widest label (+`labelPadPx`) so every label,
 *                    placed ON its own lane line at the mid-gap, clears the
 *                    neighbouring lane's label. Absent ⇒ behave as before
 *                    (gap = `gapPx`).
 * @param labelPadPx  font-derived breathing added to the label-driven gap
 *                    (a real metric supplied by the caller, e.g. one space
 *                    advance at the relationship-label font).
 * @returns  per-relation-index lane geometry, ONLY for relations that belong to
 *           a same-pair group of size ≥2 whose endpoints both have a centre.
 *           Single-edge pairs / self-loops / excluded endpoints are absent
 *           (caller keeps its existing behaviour for those).
 */
export function assignEdgeLanes(
  relations: ReadonlyArray<{ source: string; target: string }>,
  nodeCenter: ReadonlyMap<string, NodeCenter>,
  isExcludedEndpoint: (id: string) => boolean,
  gapPx: number = EDGE_LANE_GAP_PX,
  labelWidthOf?: (relIdx: number) => number,
  labelPadPx: number = 0,
): Map<number, LaneGeometry> {
  // Group by unordered pair, preserving emission order within each group.
  // Key is JSON of the sorted pair (unambiguous for ANY alias content — no
  // delimiter round-trip); the endpoints are carried in the value so we never
  // split a string back into aliases.
  const pairGroup = new Map<string, { a: string; b: string; idxs: number[] }>()
  relations.forEach((r, i) => {
    if (r.source === r.target || isExcludedEndpoint(r.source) || isExcludedEndpoint(r.target)) return
    const [a, b] = [r.source, r.target].sort()
    const key = JSON.stringify([a, b])
    const g = pairGroup.get(key) ?? { a, b, idxs: [] }
    g.idxs.push(i)
    pairGroup.set(key, g)
  })

  const out = new Map<number, LaneGeometry>()
  for (const { a: k1, b: k2, idxs } of pairGroup.values()) {
    if (idxs.length < 2) continue
    const A = nodeCenter.get(k1)
    const B = nodeCenter.get(k2)
    if (!A || !B) continue
    // ONE canonical frame for the whole group (keyed on the sorted pair). Using
    // each relation's own source→target would flip the perpendicular for the
    // antiparallel partner and the offsets would cancel back onto one line.
    const dx = B.cx - A.cx
    const dy = B.cy - A.cy
    const len = Math.hypot(dx, dy) || 1
    const ex = dx / len  // edge-direction unit
    const ey = dy / len
    const px = -ey       // perpendicular unit
    const py = ex
    const mcx = (A.cx + B.cx) / 2
    const mcy = (A.cy + B.cy) / 2
    // Effective gap: the lane lines (and the labels riding them) must be far
    // enough apart that two adjacent labels — each ≤ the group's widest
    // label, both centred on their own lane — never touch. Adjacent lane
    // centres are `gap` apart and each label spans ≤ maxW, so gap ≥ maxW
    // (+font breathing) guarantees clearance. Pure geometry, no guessed
    // fraction. Falls back to `gapPx` when no label widths are supplied.
    const maxLabelW = labelWidthOf
      ? idxs.reduce((m, i) => Math.max(m, labelWidthOf(i) || 0), 0)
      : 0
    const effGap = Math.max(gapPx, Math.ceil(maxLabelW + labelPadPx))
    idxs.forEach((relIdx, idx) => {
      // Centre the fan on 0: a 2-edge pair splits to ±half, a 3-edge group to
      // {-1,0,+1}·gap, etc. The waypoint sets the LANE line. drawio-export
      // anchors an edge label at the straight A↔B midpoint (NOT the routed
      // waypoint — render-verified), so to seat the label ON its own lane
      // line the offset must be exactly the lane's OWN perpendicular shift
      // `(px,py)·shift` — i.e. the displacement from the midpoint anchor to
      // the lane line. The previous code used a SEPARATE inflated constant
      // (±120 perp / ±150 along) instead of the line's own shift, which
      // flung every non-centre label off its line (the P1 defect). With
      // `effGap` ≥ the group's widest label, adjacent on-line labels clear
      // each other. The centre lane (shift 0) keeps offset (0,0).
      const lane = idx - (idxs.length - 1) / 2
      const shift = lane * effGap
      // Per-lane box-border attach points (P10/P12). Use the RELATION's
      // own source→target so the arrowhead end is correct; spread the
      // attach fraction along the border facing the other box.
      //
      // P12 root-fix: the previous form was
      // `clamp01(0.5 + px·shift / (2·hw))` — the lane's GEOMETRIC
      // perpendicular displacement mapped to a [0,1] border fraction
      // and CLAMPED. With ≥4 same-pair edges the outer lanes' shift
      // (±2·effGap, effGap driven by label width) overflows the box
      // half-extent, so two or more lanes saturate at the SAME corner
      // (c4-all-rel-variants a→b: rel0→1.0, rel1→0.96 — 9 px apart →
      // visual merge). The attach spread is a SEPARATE concern from the
      // routed-line/label spread (`effGap`): K attach points must be
      // EVENLY distributed across the whole border, never clamped.
      // Fraction = 0.5 + dir·lane/(K−1): the canonical "K points evenly
      // in [0,1]" (extremes at the corners, step 1/(K−1) ⇒ adjacent
      // attaches are border-extent/(K−1) px apart — provably separated,
      // no constant). `dir` = sign of the perpendicular component so
      // each lane's attach stays on the side toward its own waypoint
      // (no self-cross) and antiparallel partners keep opposite sides.
      const S = nodeCenter.get(relations[relIdx].source)
      const T = nodeCenter.get(relations[relIdx].target)
      let exit = { x: HALF, y: HALF }
      let entry = { x: HALF, y: HALF }
      if (S && T) {
        const sdx = T.cx - S.cx, sdy = T.cy - S.cy
        const vertical = Math.abs(sdy) >= Math.abs(sdx)
        const K = idxs.length
        // even fraction across the border by signed lane index
        const spread = (dir: number): number =>
          clamp01(HALF + (K > 1 ? (dir >= 0 ? 1 : -1) * lane / (K - 1) : 0))
        if (vertical) {
          // leave/enter on the top/bottom edge; spread along X.
          // Sign by px (perpendicular x) so the attach is on the same
          // side as this lane's waypoint (mcx + px·shift).
          const fx = spread(px)
          exit = { x: fx, y: sdy > 0 ? 1 : 0 }
          entry = { x: fx, y: sdy > 0 ? 0 : 1 }
        } else {
          // leave/enter on the left/right edge; spread along Y (py).
          const fy = spread(py)
          exit = { x: sdx > 0 ? 1 : 0, y: fy }
          entry = { x: sdx > 0 ? 0 : 1, y: fy }
        }
      }
      out.set(relIdx, {
        waypoint: { x: Math.round(mcx + px * shift), y: Math.round(mcy + py * shift) },
        // `+ 0` normalises a signed-zero (`Math.round(0 * -shift)` → `-0`)
        // so the offset compares/serialises as `0`, never `-0`.
        labelOffset: { dx: Math.round(px * shift) + 0, dy: Math.round(py * shift) + 0 },
        perp: { x: px, y: py },
        shift,
        exit,
        entry,
      })
    })
  }
  return out
}

/** Axis-aligned rectangle (top-left + size) — a node's box in absolute px. */
export interface NodeRect { x: number; y: number; w: number; h: number }

/**
 * Border attach fraction for a routed edge's endpoint, chosen so the
 * incident segment is PERPENDICULAR to the attached border.
 *
 * A non-laned multi-bend edge is routed orthogonally by ELK; catalyst
 * used to drop ELK's endpoint attach points and let draw.io re-attach
 * to the box CENTRE — making the last segment a diagonal into the
 * arrowhead's *side* (the `topology-cyclic` `requeues` defect: the head
 * enters skew instead of head-on into the triangle's base). Pinning
 * `exit`/`entry` here at the border on the same axis as the adjacent
 * waypoint makes draw.io draw that segment straight into the border, so
 * the arrowhead sits flush and the shaft enters the triangle's base.
 *
 * `p`   = ELK's endpoint attach point (on/at the box border).
 * `adj` = the adjacent interior waypoint (ELK's next/prev bend).
 * `box` = the endpoint node's centre + half-extents.
 *
 * The p→adj segment ELK produced is axis-aligned; we keep the border on
 * that axis (vertical segment ⇒ top/bottom border, horizontal ⇒
 * left/right) and clamp the along-border fraction to [0,1]. Pure
 * geometry, no tuned constant.
 */
export function endpointAttachFraction(
  p: { x: number; y: number },
  adj: { x: number; y: number },
  box: NodeCenter,
): { x: number; y: number } {
  const left = box.cx - box.hw, top = box.cy - box.hh
  const w = box.hw * 2 || 1, h = box.hh * 2 || 1
  const dx = Math.abs(adj.x - p.x), dy = Math.abs(adj.y - p.y)
  if (dx >= dy) {
    // incident segment horizontal ⇒ attach on the left/right border
    return { x: p.x <= box.cx ? 0 : 1, y: clamp01((p.y - top) / h) }
  }
  // incident segment vertical ⇒ attach on the top/bottom border
  return { x: clamp01((p.x - left) / w), y: p.y <= box.cy ? 0 : 1 }
}

/** Epsilon for the "fully contains" test — MUST equal the factcheck
 *  `labelHit` gate's `contains(...,eps)` inset so this de-collision
 *  triggers on EXACTLY the cases the gate flags (and stays inert,
 *  hence byte-identical, on the cases it passes). */
const CONTAIN_EPS = 2

/** Half the integer-coordinate quantum. Emitted mxPoint offsets are
 *  `Math.round`-ed, so the rendered label centre can differ from the
 *  computed one by ≤0.5 px on each axis. Clearing the label rect
 *  inflated by this envelope guarantees the quantised (rounded) rect
 *  the renderer/gate actually sees still clears — without it the
 *  closed-form tangent `t` leaves a sub-pixel graze that rounding tips
 *  back into a `labelHit`. This is the quantisation half-step, not a
 *  tuned spacing constant. */
const ROUND_ENVELOPE = 0.5

/**
 * Minimal slide ALONG a lane line to lift a label off every obstacle.
 *
 * A multi-edge laned label rides its own lane line at `centre`
 * (= the rendered route's midpoint + the lane's PERPENDICULAR offset).
 * That perpendicular position is load-bearing — it is what fans the
 * group's labels apart — so de-colliding with an unrelated leaf must
 * move the label ALONG the lane line (axis = unit source→target), never
 * across it. Sliding along the axis cannot reduce the ≥`effGap`
 * perpendicular separation, so sibling labels stay fanned by
 * construction.
 *
 * Returns the smallest signed `t` (px) for which `centre + axis·t`
 * clears every obstacle under the SAME predicate `factcheck-geometry`'s
 * `labelHit` uses — a real intersection that is neither containment
 * direction, with the identical `CONTAIN_EPS` inset — so the slide
 * fires on exactly the gate's defect set. Closed-form candidate-set
 * optimiser (the optimum on a line is at an axis-contact boundary),
 * same shape as `resolveLabelOverlap`. Returns 0 when already clear
 * (⇒ caller emits the unchanged lane offset ⇒ byte-identical for every
 * fixture the gate already passes) and 0 when no candidate clears
 * (fail-safe: never move a label somewhere no better).
 */
export function slideLabelAlongLane(
  centre: { x: number; y: number },
  axis: { x: number; y: number },
  labelW: number,
  labelH: number,
  obstacles: ReadonlyArray<NodeRect>,
): number {
  if (labelW <= 0 || labelH <= 0 || obstacles.length === 0) return 0
  const ax = axis.x, ay = axis.y
  if (ax === 0 && ay === 0) return 0
  // Inflate the label half-extent by the rounding envelope so a chosen
  // tangent `t` clears even after the emitted offset is integer-rounded.
  const hlw = labelW / 2 + ROUND_ENVELOPE, hlh = labelH / 2 + ROUND_ENVELOPE
  const ew = labelW + 2 * ROUND_ENVELOPE, eh = labelH + 2 * ROUND_ENVELOPE
  const hits = (t: number): boolean => {
    const rx = centre.x + ax * t - hlw, ry = centre.y + ay * t - hlh
    return obstacles.some((o) => {
      const inter = rx < o.x + o.w && rx + ew > o.x &&
                    ry < o.y + o.h && ry + eh > o.y
      if (!inter) return false
      // gate-identical containment exception (either direction ⇒ not a hit)
      const rContainsO = rx - CONTAIN_EPS <= o.x && ry - CONTAIN_EPS <= o.y &&
        rx + ew + CONTAIN_EPS >= o.x + o.w &&
        ry + eh + CONTAIN_EPS >= o.y + o.h
      const oContainsR = o.x - CONTAIN_EPS <= rx && o.y - CONTAIN_EPS <= ry &&
        o.x + o.w + CONTAIN_EPS >= rx + ew &&
        o.y + o.h + CONTAIN_EPS >= ry + eh
      return !rContainsO && !oContainsR
    })
  }
  if (!hits(0)) return 0
  // Candidate slides: where the label rect just touches an obstacle on
  // an axis (moving past separates it). Solve centre+axis·t ± half == edge.
  const cands: number[] = [0]
  for (const o of obstacles) {
    if (ax !== 0) {
      cands.push((o.x - hlw - centre.x) / ax, (o.x + o.w + hlw - centre.x) / ax)
    }
    if (ay !== 0) {
      cands.push((o.y - hlh - centre.y) / ay, (o.y + o.h + hlh - centre.y) / ay)
    }
  }
  cands.sort((u, v) => Math.abs(u) - Math.abs(v))
  for (const t of cands) if (!hits(t)) return t
  return 0
}

const aabbOverlap = (
  ax: number, ay: number, aw: number, ah: number,
  b: NodeRect,
): boolean =>
  ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y

/**
 * Single-edge label de-collision (renderer-side, geometry-exact).
 *
 * On a non-laned edge catalyst emits no waypoint, so drawio anchors the
 * label at the straight-line midpoint. On `stress`/`force` (Context)
 * layouts ELK neither routes nor places labels, so that midpoint can
 * land on top of an unrelated node (the `topology-wide-rank` /
 * `rel-parallel` / `topology-cyclic` "label on a box" defect).
 *
 * This returns the **minimal** offset (from the midpoint, along the
 * edge's perpendicular) that separates the label's axis-aligned rect
 * from every obstacle node. The optimum along a line always occurs at an
 * axis-contact boundary, so the candidate set is exactly
 * {0} ∪ {±x-touch, ±y-touch per obstacle}; we take the smallest-|offset|
 * candidate that clears ALL obstacles. Every number is derived from real
 * rectangles — no spacing constant, no sampling step. Returns `null`
 * when the midpoint label already clears everything (emit no offset).
 */
export function resolveLabelOverlap(
  a: NodeCenter,
  b: NodeCenter,
  labelW: number,
  labelH: number,
  obstacles: ReadonlyArray<NodeRect>,
): { dx: number; dy: number } | null {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const len = Math.hypot(dx, dy)
  if (len === 0 || labelW <= 0 || labelH <= 0) return null
  const px = -dy / len            // perpendicular unit
  const py = dx / len
  const mx = (a.cx + b.cx) / 2     // default label anchor = edge midpoint
  const my = (a.cy + b.cy) / 2
  const hlw = labelW / 2
  const hlh = labelH / 2

  // Label top-left after shifting the centre by t·perp.
  const lx = (t: number) => mx + px * t - hlw
  const ly = (t: number) => my + py * t - hlh
  const clearsAll = (t: number) =>
    !obstacles.some((o) => aabbOverlap(lx(t), ly(t), labelW, labelH, o))

  if (clearsAll(0)) return null    // midpoint already clear — no offset

  // Candidate offsets: for each obstacle, the four t where the label
  // rect just touches it on an axis (so moving past separates on that
  // axis). Solve mx+px·t ± hlw == o.x{,+w}  and the y analogue.
  const cands: number[] = [0]
  for (const o of obstacles) {
    if (px !== 0) {
      cands.push((o.x - hlw - mx) / px, (o.x + o.w + hlw - mx) / px)
    }
    if (py !== 0) {
      cands.push((o.y - hlh - my) / py, (o.y + o.h + hlh - my) / py)
    }
  }
  cands.sort((u, v) => Math.abs(u) - Math.abs(v))
  for (const t of cands) {
    if (clearsAll(t)) {
      return { dx: Math.round(px * t), dy: Math.round(py * t) }
    }
  }
  return null                      // unreachable in practice; fail safe
}

/**
 * Point at half the cumulative arc length of a polyline.
 *
 * This is drawio's default edge-label anchor for a routed (multi-bend)
 * edge: drawio-export ignores the geometry.x fraction and seats the label
 * at the routed path's LENGTH-midpoint — NOT the straight endpoint mean
 * (which `resolveLabelOverlap` assumes for straight Context edges). Used to
 * compute the offset that re-seats a multi-bend hierarchical edge's label
 * onto ELK's reserved non-overlapping rect. Pure geometry, no constant.
 */
export function polylineMidpoint(
  pts: ReadonlyArray<{ x: number; y: number }>,
): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y }
  const seg = (i: number) =>
    Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let total = 0
  for (let i = 1; i < pts.length; i++) total += seg(i)
  const half = total / 2
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const s = seg(i)
    if (acc + s >= half) {
      const t = s === 0 ? 0 : (half - acc) / s
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      }
    }
    acc += s
  }
  const last = pts[pts.length - 1]
  return { x: last.x, y: last.y }
}
