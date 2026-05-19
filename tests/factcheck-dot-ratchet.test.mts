import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs gate logic, no d.ts (intentional, like
// factcheck-ratio / edgecross-svg).
import { dotResidualContract } from '../scripts/factcheck-dot-ratchet.mjs'

// Contract-lock for the item-1a / ADR-0014 dot-engine attachMerge/
// labelHit residual ratchet (the user-chosen edgecross-pattern
// resolution). A gate's value is its demonstrated RED, not its
// observed green (every-gate-proven-red): the CONTRACT stays
// attachMerge=labelHit=0 and honestly RED-documented; this ratchet
// must (a) pass at-or-below the committed dot baseline, (b) FAIL on
// the EXACT defect it guards — a REGRESSION past baseline (e.g. the
// disproved in-place-fix class), (c) require an absent stem to be 0
// (a new fixture may not silently introduce a residual).
const BASE = {
  'c4-all-rel-variants': { attachMerge: 15, labelHit: 0 },
  'c4-exhaustive': { attachMerge: 0, labelHit: 3 },
}

describe('factcheck-dot-ratchet — ADR 0014 residual ratchet contract', () => {
  it('GREEN: exactly at the committed dot baseline ⇒ not regressed', () => {
    expect(dotResidualContract(BASE, 'c4-all-rel-variants', 15, 0))
      .toEqual({ regressed: 0, missing: false })
    expect(dotResidualContract(BASE, 'c4-exhaustive', 0, 3))
      .toEqual({ regressed: 0, missing: false })
  })

  it('GREEN: improvement toward 0 (the contract) passes — a fix that '
    + 'reduces the residual must NOT be blocked', () => {
    expect(dotResidualContract(BASE, 'c4-all-rel-variants', 9, 0).regressed).toBe(0)
    expect(dotResidualContract(BASE, 'c4-exhaustive', 0, 0).regressed).toBe(0)
    expect(dotResidualContract(BASE, 'c4-all-rel-variants', 0, 0).regressed).toBe(0)
  })

  it('RED: a REGRESSION past baseline on attachMerge is detected '
    + '(the exact defect — e.g. the 30→40 in-place-fix class)', () => {
    expect(dotResidualContract(BASE, 'c4-all-rel-variants', 16, 0).regressed).toBe(1)
  })

  it('RED: a REGRESSION past baseline on labelHit is detected', () => {
    expect(dotResidualContract(BASE, 'c4-exhaustive', 0, 4).regressed).toBe(1)
  })

  it('RED: either metric regressing trips it (attachMerge holds, '
    + 'labelHit grows)', () => {
    expect(dotResidualContract(BASE, 'c4-all-rel-variants', 15, 1).regressed).toBe(1)
  })

  it('absent stem MUST be 0 on both — a new fixture may not silently '
    + 'introduce a residual (same rule as edgecrossRatchet); missing '
    + 'flagged so UPDATE can add it', () => {
    expect(dotResidualContract(BASE, 'brand-new', 0, 0))
      .toEqual({ regressed: 0, missing: true })
    expect(dotResidualContract(BASE, 'brand-new', 1, 0))
      .toEqual({ regressed: 1, missing: true })
    expect(dotResidualContract({}, 'anything', 0, 2).regressed).toBe(1)
  })
})
