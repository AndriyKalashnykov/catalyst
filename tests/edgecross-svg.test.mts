import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs gate logic, no d.ts (intentional, like
// route-fidelity / bendcount-svg). isMain-guarded CLI side-effects.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  SHARE_TOL, NODE_R,
  properIntersection, sharedNode, polylineCrossings, countCrossings,
  edgecrossRatchet, edgePolys,
} from '../scripts/edgecross-svg.mjs'

// A gate's value is its demonstrated RED (every-gate-proven-red). The
// edgeCross contract exists because NO prior gate measured edge
// crossings (factcheck attachMerge = same-pair collapse only;
// route-fidelity = per-edge detour, corpus-MEAN; arrowskew =
// arrowhead occlusion). Each block has a GREEN case AND a RED case
// that fails on the exact defect (a non-incident crossing); the
// incident-fan exclusion is asserted so it cannot silently widen into
// "ignores real crossings near a node".

describe('cited convention constants', () => {
  it('SHARE_TOL = REL_ARROW_SIZE (14); NODE_R = 2× (28)', () => {
    expect(SHARE_TOL).toBe(14)
    expect(NODE_R).toBe(28)
  })
})

describe('properIntersection', () => {
  it('GREEN: a clean X returns the crossing point', () => {
    expect(properIntersection([0, 0], [10, 10], [0, 10], [10, 0]))
      .toEqual([5, 5])
  })
  it('GREEN: parallel / disjoint → null', () => {
    expect(properIntersection([0, 0], [10, 0], [0, 5], [10, 5])).toBeNull()
    expect(properIntersection([0, 0], [1, 0], [5, 5], [6, 5])).toBeNull()
  })
  it('touching only at a shared endpoint is NOT a proper crossing', () => {
    // two edges meeting at (0,0) — incidence, not a crossing
    expect(properIntersection([0, 0], [10, 5], [0, 0], [10, -5])).toBeNull()
  })
})

describe('sharedNode', () => {
  it('detects a shared endpoint within SHARE_TOL', () => {
    const A = [[0, 0], [50, 50]]
    const B = [[100, 100], [3, 4]]                 // B end ≈ A start (dist 5 ≤ 14)
    expect(sharedNode(A, B)).toEqual([1.5, 2])
  })
  it('returns null when no endpoints are within tolerance', () => {
    expect(sharedNode([[0, 0], [50, 0]], [[0, 100], [50, 100]])).toBeNull()
  })
})

describe('polylineCrossings — the contract decision', () => {
  it('GREEN: two non-incident parallel edges → 0', () => {
    const A = [[0, 0], [100, 0]]
    const B = [[0, 20], [100, 20]]
    expect(polylineCrossings(A, B).count).toBe(0)
  })

  it('RED: two NON-incident edges that cross are flagged (the defect '
    + 'no prior gate could see — a→b × c→a far from any shared node)', () => {
    // distinct endpoints (no shared node), clean mid-span crossing.
    const A = [[0, 0], [100, 100]]
    const B = [[0, 100], [100, 0]]
    const r = polylineCrossings(A, B)
    expect(r.count).toBe(1)
    expect(r.points[0]).toEqual([50, 50])
  })

  it('EXCLUSION asserted: incident edges crossing WITHIN NODE_R of '
    + 'their shared node is legitimate convergence ⇒ 0 (must not '
    + 'silently widen into ignoring a real crossing)', () => {
    // both edges start at ≈(0,0) (shared node) and immediately splay;
    // their only intersection is at the shared node → excluded.
    const A = [[0, 0], [10, 50]]
    const B = [[1, 1], [10, -50]]
    expect(polylineCrossings(A, B).count).toBe(0)
  })

  it('RED: incident edges that ALSO cross FAR from the shared node '
    + '(beyond NODE_R) IS still a defect — exclusion is local, not '
    + 'a blanket "incident ⇒ ignore"', () => {
    // shared node at ≈(0,0); A runs straight right along y=0. B leaves
    // the same node above A then plunges vertically through it at
    // x=150 — a proper crossing at (150,0), dist 150 ≫ NODE_R(28).
    const A = [[0, 0], [200, 0]]
    const B = [[1, 1], [150, 1], [150, -30]]
    const r = polylineCrossings(A, B)
    expect(r.count).toBe(1)
    expect(r.points[0]).toEqual([150, 0])
    expect(r.points.every((p: number[]) => Math.hypot(p[0], p[1]) > NODE_R)).toBe(true)
  })

  it('edgecrossRatchet — regression guard (NOT a contract downgrade)', () => {
    const base = { 'rel-bidirectional': 1, 'rel-fan-stress': 6 }
    // hold or improve ⇒ not a regression
    expect(edgecrossRatchet(base, 'rel-bidirectional', 1).regressed).toBe(0)
    expect(edgecrossRatchet(base, 'rel-fan-stress', 4).regressed).toBe(0)
    expect(edgecrossRatchet(base, 'rel-fan-stress', 0).regressed).toBe(0)
    // RED: the exact disproven-fix regression (1→2, 6→11) is caught
    expect(edgecrossRatchet(base, 'rel-bidirectional', 2).regressed).toBe(1)
    expect(edgecrossRatchet(base, 'rel-fan-stress', 11).regressed).toBe(1)
    // a fixture not in the baseline must stay at 0 (no new crossings)
    expect(edgecrossRatchet(base, 'topology-linear-chain', 0).regressed).toBe(0)
    expect(edgecrossRatchet(base, 'topology-linear-chain', 1).regressed).toBe(1)
  })

  it('countCrossings sums pairwise and lists the offending pair', () => {
    const polys = [
      { pts: [[0, 0], [100, 100]] },   // 0
      { pts: [[0, 100], [100, 0]] },   // 1  crosses 0 at (50,50)
      { pts: [[0, 200], [100, 200]] },  // 2  isolated
    ]
    const r = countCrossings(polys)
    expect(r.total).toBe(1)
    expect(r.detail[0]).toMatchObject({ i: 0, j: 1, count: 1 })
  })
})

// CI-ENFORCED corpus ratchet + the instrument-trust fact-check, run
// in vitest (deterministic over the COMMITTED drawio-export
// render-truth — no docker). This closes the "ratchet is manual-only,
// passive" gap: a routing regression in the committed render now
// fails CI here, not only under a manual `make edgecross`.
//
// GUARANTEE & LIMITATION (stated honestly): this gates the COMMITTED
// gallery SVGs. `gallery-verify` regenerates only the `.drawio`; the
// `.svg` render-truth is refreshed by `make gallery` (docker, manual).
// So an emit change that worsens crossings is caught the moment the
// gallery SVGs are re-rendered+committed — NOT before (same freshness
// model as the gallery PNGs). It is a real regression guard on the
// render-truth, not a live emit gate; do not over-read it.
describe('edgeCross corpus — CI ratchet + instrument fact-check (committed render-truth)', () => {
  const SVG = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'gallery', 'svg')
  const BASE = join(dirname(fileURLToPath(import.meta.url)), 'edgecross-baseline.json')
  const have = existsSync(SVG) && existsSync(BASE)
  const stems = have
    ? [...new Set(readdirSync(SVG).filter((f) => f.endsWith('.drawio.svg'))
        .map((f) => f.replace('.drawio.svg', '')))].sort()
    : []

  it.skipIf(!have)('PlantUML render side is 0 — the instrument does NOT '
    + 'false-positive on clean dot splines (independent-signal '
    + 'fact-check, locked so it cannot silently rot)', () => {
    let total = 0
    for (const s of stems) {
      const f = join(SVG, `${s}.puml.svg`)
      if (existsSync(f)) total += countCrossings(edgePolys(readFileSync(f, 'utf8'), 'puml')).total
    }
    expect(total, 'PlantUML-side crossings must be 0 (instrument FP guard)').toBe(0)
  }, 60000)
  // ↑ 60s: under `coverage-check` (v8 instrumentation) the O(E²·P²)
  // pairwise crossing scan over all committed SVGs is ~6–8s (raw ~1s);
  // the dot engine's curved splines have many more control points than
  // ELK's sparse orthogonal routes. Deterministic & bounded — a
  // generous timeout, NOT a weakened assertion (still strict `=0`).

  it.skipIf(!have)('committed drawio render: every fixture ≤ its '
    + 'baseline (the regression ratchet, now CI-enforced) and total '
    + 'equals the fact-checked baseline', () => {
    const base = JSON.parse(readFileSync(BASE, 'utf8'))
    const regressions: string[] = []
    let total = 0
    for (const s of stems) {
      const n = countCrossings(edgePolys(readFileSync(join(SVG, `${s}.drawio.svg`), 'utf8'), 'drawio')).total
      total += n
      if (edgecrossRatchet(base, s, n).regressed) regressions.push(`${s}: ${n} > base ${base[s] ?? 0}`)
    }
    expect(regressions, 'edgeCross regression vs committed baseline').toEqual([])
    const baseTotal = Object.values(base).reduce((a, b) => (a as number) + (b as number), 0)
    expect(total, 'corpus total drifted from the fact-checked baseline (re-baseline deliberately if intended)').toBe(baseTotal)
  }, 60000)   // see the 60s rationale above (coverage-instrumented O(E²·P²) over dot curved splines)
})
