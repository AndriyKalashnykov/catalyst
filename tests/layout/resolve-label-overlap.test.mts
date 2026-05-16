import { describe, it, expect } from 'vitest'
import { resolveLabelOverlap, type NodeCenter, type NodeRect } from '../../src/layout/edgeLanes.mjs'

// Geometry-exact single-edge label de-collision. The label is an
// axis-aligned rect anchored at the A↔B centre-line midpoint; the
// function returns the minimal perpendicular offset that separates it
// from every obstacle rect (or null when the midpoint is already clear).
// Pure geometry — no spacing constant, no sampling.

const C = (cx: number, cy: number, hw = 50, hh = 30): NodeCenter => ({ cx, cy, hw, hh })
const overlaps = (
  ax: number, ay: number, aw: number, ah: number, r: NodeRect,
) => ax < r.x + r.w && ax + aw > r.x && ay < r.y + r.h && ay + ah > r.y

describe('resolveLabelOverlap', () => {
  it('returns null when the midpoint label clears every obstacle', () => {
    const a = C(0, 0), b = C(400, 0)               // horizontal edge, mid (200,0)
    const far: NodeRect = { x: 0, y: 300, w: 80, h: 60 }
    expect(resolveLabelOverlap(a, b, 60, 20, [far])).toBeNull()
  })

  it('returns null for a degenerate edge or empty label', () => {
    expect(resolveLabelOverlap(C(10, 10), C(10, 10), 40, 20, [])).toBeNull()
    expect(resolveLabelOverlap(C(0, 0), C(100, 0), 0, 20, [{ x: 0, y: -10, w: 200, h: 20 }])).toBeNull()
  })

  it('offsets the label off an obstacle straddling the midpoint, and the shifted rect is clear', () => {
    const a = C(0, 0), b = C(400, 0)               // mid (200,0); perp = (0,±1)
    const obstacle: NodeRect = { x: 170, y: -40, w: 60, h: 80 } // covers the mid
    const off = resolveLabelOverlap(a, b, 80, 24, [obstacle])
    expect(off).not.toBeNull()
    // perpendicular of a horizontal edge is vertical → pure dy push
    expect(off!.dx).toBe(0)
    expect(Math.abs(off!.dy)).toBeGreaterThan(0)
    // the label rect at the returned offset no longer overlaps
    const lx = 200 + off!.dx - 40
    const ly = 0 + off!.dy - 12
    expect(overlaps(lx, ly, 80, 24, obstacle)).toBe(false)
  })

  it('chooses the minimal-magnitude clearing offset (smaller of up/down)', () => {
    const a = C(0, 0), b = C(400, 0)
    // obstacle slightly below the midpoint → pushing UP is the shorter escape
    const obstacle: NodeRect = { x: 170, y: -5, w: 60, h: 80 }
    const off = resolveLabelOverlap(a, b, 80, 24, [obstacle])!
    expect(off.dy).toBeLessThan(0)                 // pushed up (negative y), the nearer edge
  })

  it('clears ALL obstacles, not just the first', () => {
    const a = C(0, 0), b = C(0, 400)               // vertical edge, mid (0,200), perp horizontal
    const o1: NodeRect = { x: -40, y: 170, w: 80, h: 30 }
    const o2: NodeRect = { x: 30, y: 175, w: 80, h: 30 }
    const off = resolveLabelOverlap(a, b, 50, 20, [o1, o2])
    expect(off).not.toBeNull()
    const lx = 0 + off!.dx - 25
    const ly = 200 + off!.dy - 10
    expect(overlaps(lx, ly, 50, 20, o1)).toBe(false)
    expect(overlaps(lx, ly, 50, 20, o2)).toBe(false)
  })
})
