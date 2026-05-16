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

export interface NodeCenter { cx: number; cy: number }

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
}

/** Default lane spacing for the routed waypoint. */
export const EDGE_LANE_GAP_PX = 44
/** Label fan: perpendicular + along-edge px spread per lane (labels are wide,
 *  so they need a larger spread than the line waypoints). */
export const LABEL_PERP_GAP_PX = 120
export const LABEL_ALONG_GAP_PX = 150

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
  const pairGroup = new Map<string, number[]>()
  relations.forEach((r, i) => {
    if (r.source === r.target || isExcludedEndpoint(r.source) || isExcludedEndpoint(r.target)) return
    const key = [r.source, r.target].sort().join('|')
    const arr = pairGroup.get(key) ?? []
    arr.push(i)
    pairGroup.set(key, arr)
  })

  const out = new Map<number, LaneGeometry>()
  for (const [key, idxs] of pairGroup) {
    if (idxs.length < 2) continue
    const [k1, k2] = key.split('|')
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
      out.set(relIdx, {
        waypoint: { x: Math.round(mcx + px * shift), y: Math.round(mcy + py * shift) },
        labelOffset: {
          dx: Math.round(px * lane * LABEL_PERP_GAP_PX + ex * lane * LABEL_ALONG_GAP_PX),
          dy: Math.round(py * lane * LABEL_PERP_GAP_PX + ey * lane * LABEL_ALONG_GAP_PX),
        },
      })
    })
  }
  return out
}
