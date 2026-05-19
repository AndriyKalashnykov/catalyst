import { describe, it, expect } from 'vitest'
import { slideLabelAlongLane, type NodeRect } from '../../src/layout/edgeLanes.mjs'

// Contract for slideLabelAlongLane — the authoritative-route branch's
// label de-collision (dot engine). A label that lands on an unrelated
// leaf is slid the MINIMAL distance ALONG its route axis to clear every
// obstacle under the same predicate factcheck's `labelHit` uses;
// returns 0 when already clear (⇒ byte-identical) and respects the
// containment exception + the integer-rounding envelope. (Extracted
// verbatim from the former tests/edge-lanes.test.mts when the ELK lane
// apparatus was removed — FU1 / ADR 0014.)
describe('slideLabelAlongLane', () => {
  const xAxis = { x: 1, y: 0 }

  it('returns 0 when the label already clears every obstacle', () => {
    const obs: NodeRect[] = [{ x: 100, y: 100, w: 50, h: 50 }]
    expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs)).toBe(0)
  })

  it('returns 0 for degenerate inputs (no obstacles / zero size / zero axis)', () => {
    expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, [])).toBe(0)
    expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 0, 18,
      [{ x: -10, y: -10, w: 20, h: 20 }])).toBe(0)
    expect(slideLabelAlongLane({ x: 0, y: 0 }, { x: 0, y: 0 }, 40, 18,
      [{ x: -10, y: -10, w: 20, h: 20 }])).toBe(0)
  })

  it('slides the MINIMAL distance along the axis to clear an obstacle', () => {
    // PARTIAL overlap (label straddles the node's left edge — the real
    // defect shape; a label fully INSIDE a node is the containment
    // exception, covered below). label 40×18 at origin, half-width
    // 20 + 0.5 envelope = 20.5. obstacle x∈[10,210]: clear leftward at
    // cx ≤ 10 − 20.5 ⇒ t = −10.5 (minimal vs the +230.5 rightward).
    const obs: NodeRect[] = [{ x: 10, y: -50, w: 200, h: 100 }]
    const t = slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs)
    expect(t).toBeCloseTo(-10.5, 6)
    const lx = t - 20.5, rx = t + 20.5        // emitted-rect envelope
    expect(rx <= 10 || lx >= 210).toBe(true)  // cleared
  })

  it('slides along Y when the axis is vertical', () => {
    // partial overlap on the label's bottom; axis = +Y. half-height
    // 9 + 0.5 = 9.5; obstacle y∈[5,205] ⇒ clear up at t = 5 − 9.5 = −4.5.
    const obs: NodeRect[] = [{ x: -100, y: 5, w: 200, h: 200 }]
    const t = slideLabelAlongLane({ x: 0, y: 0 }, { x: 0, y: 1 }, 40, 18, obs)
    expect(t).toBeCloseTo(-4.5, 6)
  })

  it('honours the containment exception (label ⊆ node ⇒ not a hit ⇒ 0)', () => {
    // huge obstacle fully containing the label: the factcheck gate
    // does NOT flag this, so the slide must stay inert (byte-identical).
    const obs: NodeRect[] = [{ x: -500, y: -500, w: 1000, h: 1000 }]
    expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs)).toBe(0)
  })

  it('clears ALL obstacles, not just the first', () => {
    // two partial obstacles flanking the origin; the gap between them
    // (−20 … 10, width 30) is narrower than the 41-wide envelope, so
    // the only feasible slides are fully OUTSIDE both — the optimiser
    // must skip the near candidates that re-hit the other obstacle.
    const obs: NodeRect[] = [
      { x: 10, y: -50, w: 30, h: 100 },
      { x: -60, y: -50, w: 40, h: 100 },
    ]
    const t = slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs)
    const lx = t - 20.5, rx = t + 20.5
    for (const o of obs)
      expect(rx <= o.x || lx >= o.x + o.w).toBe(true)
  })
})
