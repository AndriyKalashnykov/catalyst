import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs gate logic, no d.ts (intentional, like
// factcheck-ratio / p4b-svg-geom). isMain-guarded CLI side-effects.
import {
  ATTACH_SEP_MIN, ARROWS_BIDIRECTIONAL, ARROWS_ONE_WAY,
  norm, textPreserved, arrowCountOk,
  intersects, contains, partialOverlap, attachPoint, attachMerged,
} from '../scripts/factcheck-predicates.mjs'

// A gate's value is its demonstrated RED, not its observed green
// (portfolio rule silent-fake-gate-classes / gate-RED-proves-
// enforcement). Every factcheck contract metric is exercised here with
// BOTH a GREEN case (correct input → predicate passes) AND a RED case
// (the exact defect the metric claims to catch → predicate flags it).
// A green-only assertion would be indistinguishable from no gate, so
// each block's RED case is the load-bearing one.

describe('factcheck cited constants', () => {
  it('ATTACH_SEP_MIN = 28 (2 × REL_ARROW_SIZE 14 — cited, not guessed)', () => {
    expect(ATTACH_SEP_MIN).toBe(28)
  })
  it('arrowhead-count contract: bidirectional 2, one-way 1', () => {
    expect(ARROWS_BIDIRECTIONAL).toBe(2)
    expect(ARROWS_ONE_WAY).toBe(1)
  })
})

describe('norm — text normalisation + DOCUMENTED blind spot', () => {
  it('GREEN: collapses whitespace, strips XML escaping incl. P8 double-escape', () => {
    expect(norm('  a   b  ')).toBe('a b')
    expect(norm('a &amp; b')).toBe('a & b')
    expect(norm('&amp;lt;x&amp;gt;')).toBe('<x>')
    expect(norm(null)).toBe('')
    expect(norm(undefined)).toBe('')
  })
  it('BLIND SPOT (asserted so it cannot silently widen): `\\n` and '
    + '`<br/>` BOTH collapse to a space → norm cannot tell a correctly '
    + 'translated multi-line label from a literal-`\\n` tofu regression. '
    + 'That regression class is guarded by the hRatio ratchet, NOT '
    + 'labelDrop (see edge-multiline-labels).', () => {
    const literalNL = 'writes\\nleaf cert + key to'        // tofu regression
    const translated = 'writes<br/>leaf cert + key to'     // correct emit
    const escaped = 'writes&lt;br/&gt;leaf cert + key to'  // correct emit, XML-escaped
    // The blind spot: all three normalise IDENTICALLY. If a future edit
    // makes norm distinguish them this assertion fails and forces a
    // conscious re-decision about which gate guards the regression.
    expect(norm(literalNL)).toBe(norm(translated))
    expect(norm(translated)).toBe(norm(escaped))
    expect(norm(literalNL)).toBe('writes leaf cert + key to')
  })
})

describe('textPreserved — labelDrop / entityMiss-name decision', () => {
  it('GREEN: text present, incl. through <br/> wrap + XML-escaping', () => {
    expect(textPreserved('submits request', 'submits request')).toBe(true)
    expect(textPreserved('a very long verb',
      'a very<br/>long verb')).toBe(true)                  // word-wrapped
    expect(textPreserved('A & B', 'A &amp; B')).toBe(true) // XML-escaped
    expect(textPreserved('name', 'wrong c4Name', 'the name here')).toBe(true) // 2nd candidate
    expect(textPreserved('', 'anything')).toBe(true)       // empty expected ⇒ vacuously ok
  })
  it('RED: a genuinely dropped label is flagged (labelDrop does work)', () => {
    expect(textPreserved('submits payment request', 'opens')).toBe(false)
    expect(textPreserved('publishes', '')).toBe(false)        // verb emitted empty
    expect(textPreserved('verb', 'wrong', 'also wrong')).toBe(false) // no candidate matches
  })
})

describe('arrowCountOk — arrowBad decision (P10 class)', () => {
  it('GREEN: bidirectional ⇒ 2 heads, one-way ⇒ exactly 1', () => {
    expect(arrowCountOk(2, true)).toBe(true)
    expect(arrowCountOk(1, false)).toBe(true)
  })
  it('RED: the three P10 defects each flag', () => {
    expect(arrowCountOk(1, true)).toBe(false)   // BiRel rendered one-way
    expect(arrowCountOk(2, false)).toBe(false)  // one-way looks bidirectional
    expect(arrowCountOk(0, false)).toBe(false)  // one-way rendered arrowless
  })
})

describe('intersects / contains / partialOverlap — nodeOverlap + labelHit core', () => {
  const A = { x: 0, y: 0, w: 100, h: 100 }
  it('GREEN: disjoint rects do not overlap', () => {
    expect(intersects(A, { x: 200, y: 0, w: 10, h: 10 })).toBe(false)
    expect(partialOverlap(A, { x: 200, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('GREEN: containment is legit compound nesting, NOT an overlap '
    + '(catalyst emits flat+absolute — a boundary visually contains '
    + 'its children)', () => {
    const child = { x: 20, y: 20, w: 10, h: 10 }
    expect(contains(A, child)).toBe(true)
    expect(partialOverlap(A, child)).toBe(false)   // must NOT be flagged
    expect(partialOverlap(child, A)).toBe(false)   // order-independent
  })
  it('RED: a real partial node/label collision IS flagged', () => {
    const overlapping = { x: 50, y: 50, w: 100, h: 100 } // straddles A's corner
    expect(intersects(A, overlapping)).toBe(true)
    expect(partialOverlap(A, overlapping)).toBe(true)    // the defect
  })
  it('contains epsilon: a 2px inset still counts as contained', () => {
    expect(contains(A, { x: -2, y: -2, w: 104, h: 104 })).toBe(true)
    expect(contains(A, { x: -3, y: 0, w: 106, h: 100 })).toBe(false)
  })
})

describe('attachPoint — edge endpoint attach geometry', () => {
  const n = { x: 100, y: 200, w: 80, h: 40 }
  it('frac undefined ⇒ box centre on that axis (mxGraph default)', () => {
    expect(attachPoint(n, undefined, undefined)).toEqual({ x: 140, y: 220 })
  })
  it('fractional border position', () => {
    expect(attachPoint(n, 0, 0.5)).toEqual({ x: 100, y: 220 })   // left edge, mid height
    expect(attachPoint(n, 1, 1)).toEqual({ x: 180, y: 240 })     // bottom-right corner
  })
  it('null node ⇒ origin (matches inline `n ? … : 0`)', () => {
    expect(attachPoint(null, 0.5, 0.5)).toEqual({ x: 0, y: 0 })
  })
})

describe('attachMerged — attachMerge decision (P1 lane separation)', () => {
  it('GREEN: separated on at least one end ⇒ NOT merged', () => {
    const s1 = { x: 0, y: 0 }, t1 = { x: 0, y: 500 }
    const s2 = { x: 0, y: 0 }, t2 = { x: 0, y: 600 } // src identical, tgt 100 apart
    expect(attachMerged(s1, t1, s2, t2)).toBe(false)
  })
  it('GUARD against the 2026-05-17 X-only false-positive: a horizontal '
    + 'fan separated in Y on one end (exitX pinned, exitY spread) is '
    + 'NOT merged — the contract is Euclidean on BOTH ends', () => {
    // both pairs share X but the source ends are 66px apart in Y
    const s1 = { x: 195, y: 100 }, t1 = { x: 195, y: 400 }
    const s2 = { x: 195, y: 166 }, t2 = { x: 195, y: 400 }
    expect(attachMerged(s1, t1, s2, t2)).toBe(false)
  })
  it('RED: BOTH ends within ATTACH_SEP_MIN ⇒ the two edges collapse '
    + 'into one visual line (the P1/P10 defect IS detected)', () => {
    const s1 = { x: 100, y: 100 }, t1 = { x: 300, y: 100 }
    const s2 = { x: 105, y: 102 }, t2 = { x: 303, y: 101 } // ~5px / ~3px apart
    expect(attachMerged(s1, t1, s2, t2)).toBe(true)
  })
  it('boundary: exactly ATTACH_SEP_MIN apart is NOT merged (`< min`, '
    + 'strict — two arrowheads exactly touching still read distinct)', () => {
    const s1 = { x: 0, y: 0 }, t1 = { x: 0, y: 0 }
    const s2 = { x: ATTACH_SEP_MIN, y: 0 }, t2 = { x: 0, y: 0 } // src exactly 28 apart
    expect(attachMerged(s1, t1, s2, t2)).toBe(false)
    const s2b = { x: ATTACH_SEP_MIN - 1, y: 0 }
    expect(attachMerged(s1, t1, s2b, t2)).toBe(true)            // 27 < 28 ⇒ merged
  })
})
