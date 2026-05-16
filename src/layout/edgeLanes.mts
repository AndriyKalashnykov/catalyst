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
}

/** Default lane spacing for the routed waypoint. */
export const EDGE_LANE_GAP_PX = 44
/** Label fan: perpendicular + along-edge px spread per lane (labels are wide,
 *  so they need a larger spread than the line waypoints). */
export const LABEL_PERP_GAP_PX = 120
export const LABEL_ALONG_GAP_PX = 150

/** Distance from a box centre to where the ray `(ex,ey)` exits the box, for
 *  a rectangle with half-extents `(hw,hh)`. Pure geometry (rectangle ↔ ray
 *  intersection); used to cap the along-edge label offset at the real free
 *  span between the two node borders — no heuristic fraction. */
function boxExitDistance(hw: number, hh: number, ex: number, ey: number): number {
  const tx = ex !== 0 ? hw / Math.abs(ex) : Infinity
  const ty = ey !== 0 ? hh / Math.abs(ey) : Infinity
  return Math.min(tx, ty)
}

/**
 * @param relations  visible relations, in emission order; the index into this
 *                    array is the key of the returned map.
 * @param nodeCenter  alias → box centre.
 * @param isExcludedEndpoint  e.g. `id => clusterIds.has(id)` — boundary/cluster
 *                    endpoints are auto-routed by draw.io, never laned.
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
    idxs.forEach((relIdx, idx) => {
      // Centre the fan on 0: a 2-edge pair splits to ±half, a 3-edge group to
      // {-1,0,+1}·gap, etc. The waypoint separates the LINES; the label offset
      // fans the (wide) LABELS along both perpendicular and edge directions so
      // they never stack at the shared midpoint.
      const lane = idx - (idxs.length - 1) / 2
      const shift = lane * gapPx
      // Perpendicular label spread is the safe axis (sideways, away from both
      // boxes). The along-edge component is capped at the real free span
      // between the two node borders, so the label can never be pushed onto
      // or past either box — derived from geometry, not a guessed fraction.
      const perpMag = lane * LABEL_PERP_GAP_PX
      const alongRaw = lane * LABEL_ALONG_GAP_PX
      const tA = boxExitDistance(A.hw, A.hh, ex, ey)
      const tB = boxExitDistance(B.hw, B.hh, ex, ey)
      const alongCap = Math.max(0, len / 2 - Math.max(tA, tB))
      const alongMag = Math.sign(alongRaw) * Math.min(Math.abs(alongRaw), alongCap)
      out.set(relIdx, {
        waypoint: { x: Math.round(mcx + px * shift), y: Math.round(mcy + py * shift) },
        labelOffset: {
          dx: Math.round(px * perpMag + ex * alongMag),
          dy: Math.round(py * perpMag + ey * alongMag),
        },
        perp: { x: px, y: py },
        shift,
      })
    })
  }
  return out
}

/** Axis-aligned rectangle (top-left + size) — a node's box in absolute px. */
export interface NodeRect { x: number; y: number; w: number; h: number }

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
