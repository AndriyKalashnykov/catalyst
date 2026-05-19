/**
 * Renderer-side label de-collision + routed-edge midpoint helpers.
 *
 * Pure, side-effect-free geometry consumed by `layoutData2mx`:
 *
 *  - `slideLabelAlongLane` — slide a `dot`-routed edge's label ALONG
 *    the route axis the minimal distance to clear every unrelated leaf
 *    (the authoritative-route branch's de-collision).
 *  - `resolveLabelOverlap` — minimal perpendicular offset for a
 *    straight 2-point edge's midpoint label (the straight branch's).
 *  - `polylineMidpoint` — drawio's default edge-label anchor for a
 *    multi-bend route (cumulative-arc-length midpoint).
 *
 * The ELK-era multi-edge lane apparatus (`assignEdgeLanes`,
 * `assignPortOrder`, `enforceApproachClearance`) was removed with the
 * ELK engine (FU1 / ADR 0014) — `dot`'s own port ordering fans
 * same-pair edges, so the perpendicular-shove machinery is gone.
 */

/** Box centre + half-extents (hw = width/2, hh = height/2). */
export interface NodeCenter { cx: number; cy: number; hw: number; hh: number }

/** Axis-aligned rectangle (top-left + size) — a node's box in absolute px. */
export interface NodeRect { x: number; y: number; w: number; h: number }

/** Gate-identical containment inset (matches `factcheck-geometry`'s
 *  `labelHit` predicate so the slide fires on exactly its defect set). */
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
 * Minimal slide ALONG the route axis to lift a label off every obstacle.
 *
 * A `dot`-routed edge's label sits at `centre` (the rendered route's
 * midpoint). De-colliding with an unrelated leaf moves it ALONG the
 * route axis (unit source→target), the minimal signed `t` (px) for
 * which `centre + axis·t` clears every obstacle under the SAME
 * predicate `factcheck-geometry`'s `labelHit` uses (a real
 * intersection that is neither containment direction, identical
 * `CONTAIN_EPS` inset). Closed-form candidate-set optimiser (the
 * optimum on a line is at an axis-contact boundary). Returns 0 when
 * already clear (⇒ caller emits no offset ⇒ byte-identical for every
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
 * On a straight 2-point edge catalyst emits no waypoint, so drawio
 * anchors the label at the straight-line midpoint, which can land on
 * an unrelated node. This returns the **minimal** offset (from the
 * midpoint, along the edge's perpendicular) that separates the label's
 * axis-aligned rect from every obstacle node. The optimum along a line
 * always occurs at an axis-contact boundary, so the candidate set is
 * exactly {0} ∪ {±x-touch, ±y-touch per obstacle}; the smallest-|offset|
 * candidate that clears ALL obstacles wins. Every number is derived
 * from real rectangles — no spacing constant, no sampling step.
 * Returns `null` when the midpoint label already clears everything.
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
 * edge: drawio-export ignores the geometry.x fraction and seats the
 * label at the routed path's LENGTH-midpoint — NOT the straight
 * endpoint mean (which `resolveLabelOverlap` assumes for straight
 * edges). Used to anchor the authoritative-route branch's label slide
 * on the route drawio actually draws. Pure geometry, no constant.
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
