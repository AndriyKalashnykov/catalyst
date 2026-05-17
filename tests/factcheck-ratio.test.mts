import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs gate logic, no d.ts (intentional, like p4b-svg-geom)
import { RATIO_TOL, ratioContract } from '../scripts/factcheck-ratio.mjs'

// Contract-lock for ADR 0011 step-0's fidelity-monotone ratchet. A bug
// here re-opens the silent-rot class (14 fixtures at wRatio 0.19–0.67
// once shipped "CLEAN" because the axis was advisory) — so the ratchet
// semantics are pinned: improvement passes, regression-away-from-parity
// beyond one quantisation quantum fails, no-baseline ⇒ not-a-failure.

const BASE = { foo: { w: 0.5, h: 0.8 } }

describe('factcheck-ratio — ADR 0011 ratchet contract', () => {
  it('RATIO_TOL is the 2-dp quantisation quantum', () => {
    expect(RATIO_TOL).toBe(0.01)
  })

  it('exactly at baseline → clean (|1−ratio| unchanged)', () => {
    expect(ratioContract(BASE, 'foo', 0.5, 0.8)).toEqual({ ratioBad: 0, missing: false })
  })

  it('improvement toward parity (ratio → 1) passes — C3/C2 must not be blocked', () => {
    expect(ratioContract(BASE, 'foo', 0.7, 0.9).ratioBad).toBe(0)   // both closer to 1
    expect(ratioContract(BASE, 'foo', 1.0, 1.0).ratioBad).toBe(0)   // perfect
    expect(ratioContract(BASE, 'foo', 0.95, 0.8).ratioBad).toBe(0)  // w improves, h holds
  })

  it('regression NARROWER than baseline (|1−w| grows) fails', () => {
    // w 0.5→0.40: |1−0.40|=0.60 > |1−0.5|+0.01=0.51 ⇒ ratioBad
    expect(ratioContract(BASE, 'foo', 0.40, 0.8).ratioBad).toBe(1)
  })

  it('regression OVER-WIDE past parity (|1−w| grows the other way) also fails', () => {
    // baseline w 0.5 (dist 0.5); w 1.6 → dist 0.6 > 0.51 ⇒ ratioBad
    expect(ratioContract(BASE, 'foo', 1.6, 0.8).ratioBad).toBe(1)
  })

  it('either-axis regression trips it (h regresses while w holds)', () => {
    // h 0.8→0.6: |1−0.6|=0.40 > |1−0.8|+0.01=0.21 ⇒ ratioBad
    expect(ratioContract(BASE, 'foo', 0.5, 0.6).ratioBad).toBe(1)
  })

  it('a move within one quantum is tolerated (float-rounding envelope, not a mask)', () => {
    // w 0.5→0.49: |1−0.49|=0.51 ≤ |1−0.5|+0.01=0.51 ⇒ clean (boundary)
    expect(ratioContract(BASE, 'foo', 0.49, 0.8).ratioBad).toBe(0)
    // one tick past the quantum fails
    expect(ratioContract(BASE, 'foo', 0.48, 0.8).ratioBad).toBe(1)
  })

  it('no baseline entry ⇒ not a failure, flagged missing (UPDATE adds it)', () => {
    expect(ratioContract(BASE, 'unknown', 0.1, 9)).toEqual({ ratioBad: 0, missing: true })
    expect(ratioContract({}, 'foo', 0.1, 9)).toEqual({ ratioBad: 0, missing: true })
  })
})
