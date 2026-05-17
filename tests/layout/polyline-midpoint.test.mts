import { describe, it, expect } from 'vitest'
import { polylineMidpoint } from '../../src/layout/edgeLanes.mjs'

// polylineMidpoint must return the point at HALF THE CUMULATIVE ARC
// LENGTH of the routed polyline — drawio's actual default edge-label
// anchor for a multi-bend edge. The #24-hier fix re-seats a label by
// `offset = ELK-label-centre − polylineMidpoint(route)`; if this helper
// returned the endpoint mean or the middle vertex instead, every
// re-seated multi-bend label would be placed wrong. These are
// discriminator cases: the length-midpoint differs from BOTH the
// straight endpoint mean AND the middle vertex.

describe('polylineMidpoint', () => {
  it('two-point segment → geometric midpoint', () => {
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }]))
      .toEqual({ x: 50, y: 0 })
  })

  it('degenerate inputs', () => {
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 })
    expect(polylineMidpoint([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9 })
  })

  it('L-route: length-midpoint ≠ endpoint mean, ≠ middle vertex', () => {
    // 0,0 → 100,0 (len 100) → 100,100 (len 100); total 200, half 100
    // ⇒ exactly the corner vertex (100,0).
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    const mid = polylineMidpoint(pts)
    expect(mid).toEqual({ x: 100, y: 0 })
    // endpoint mean would be (50,50) — explicitly NOT this:
    expect(mid).not.toEqual({ x: 50, y: 50 })
  })

  it('walks past short leading segments to the true length-midpoint', () => {
    // segs: 10 (0→10), 10 (10→20), 180 (20→200) ; total 200, half 100
    // ⇒ 80 into the 3rd segment from x=20 ⇒ x=100.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 200, y: 0 }]
    expect(polylineMidpoint(pts)).toEqual({ x: 100, y: 0 })
    // middle vertex (index-midpoint) would be x=20 — NOT the contract:
    expect(polylineMidpoint(pts)).not.toEqual({ x: 20, y: 0 })
  })

  it('tolerates zero-length duplicate points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]
    expect(polylineMidpoint(pts)).toEqual({ x: 50, y: 0 })
  })
})
