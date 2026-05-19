import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assignPortOrder, type NodeCenter, type PortAttach } from '../src/layout/edgeLanes.mjs'

/**
 * Exhaustive contract for the bearing-sorted ordered-port pass
 * (rotation-system crossing minimization, FIXED node positions —
 * docs/research/edge-crossing-minimization.md).
 *
 * NO hardcoded expected attach coords — every expectation is
 * RE-DERIVED from the input geometry, so a wrong algorithm cannot be
 * "passed" by a transcribed constant (the no-guesswork rule). The
 * load-bearing assertions are the two correctness INVARIANTS proven by
 * the research:
 *
 *  I1 (rotation system): at every node, the cyclic order of the
 *     assigned attach points around the box perimeter MUST equal the
 *     cyclic order of the bearings from the node centre to the far
 *     endpoints. Any inversion is an avoidable incident-fan crossing.
 *
 *  I2 (nested fan): for K same-(unordered)-pair edges, their attach
 *     RANK sequence MUST be monotone-consistent at BOTH endpoints
 *     (edge i is rank i at A and rank i at B) — else ⌊K/2⌋·⌈K/2⌉
 *     forced intra-bundle crossings.
 *
 * Plus adversarial / not-happy-path coverage (hub fan, K-parallel,
 * antiparallel, multi-pair at one node, all four sides, degenerate
 * collinear bearings, excluded endpoints, self-loops, empty).
 *
 * Every scenario also emits a deterministic SVG model to
 * build/portorder-models/<name>.svg (boxes + the attach→far-centre
 * segment per edge) for repeatable human eyeballing — vector, no AA
 * jitter, regenerated identically each run.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODEL_DIR = join(__dirname, '..', 'build', 'portorder-models')
mkdirSync(MODEL_DIR, { recursive: true })

type Rel = { source: string; target: string }
const box = (cx: number, cy: number, w = 120, h = 60): NodeCenter =>
  ({ cx, cy, hw: w / 2, hh: h / 2 })
const never = () => false

/** Absolute attach point of a fraction on a node box. */
const abs = (n: NodeCenter, p: { x: number; y: number }) => ({
  x: n.cx - n.hw + p.x * (2 * n.hw),
  y: n.cy - n.hh + p.y * (2 * n.hh),
})

/** Perimeter parameter in [0,4): 0..1 top (N), 1..2 right (E), 2..3
 *  bottom (S), 3..4 left (W) — a monotone clockwise walk used to
 *  compare the CYCLIC order of attach points (I1). Derived from the
 *  fraction, never hardcoded. */
function perim(p: { x: number; y: number }): number {
  if (p.y === 0) return p.x                       // N: left→right
  if (p.x === 1) return 1 + p.y                   // E: top→bottom
  if (p.y === 1) return 2 + (1 - p.x)             // S: right→left
  return 3 + (1 - p.y)                            // W: bottom→top
}

/** Render a deterministic SVG model for repeatable eyeballing. */
function model(name: string, nodes: Map<string, NodeCenter>, rels: Rel[],
  out: Map<number, PortAttach>): void {
  const xs = [...nodes.values()]
  const minX = Math.min(...xs.map(n => n.cx - n.hw)) - 40
  const minY = Math.min(...xs.map(n => n.cy - n.hh)) - 40
  const W = Math.max(...xs.map(n => n.cx + n.hw)) - minX + 40
  const H = Math.max(...xs.map(n => n.cy + n.hh)) - minY + 40
  const tr = (x: number, y: number) => `${(x - minX).toFixed(1)},${(y - minY).toFixed(1)}`
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" font-family="sans-serif" font-size="11">\n`
  for (const [id, n] of nodes)
    s += `<rect x="${(n.cx - n.hw - minX).toFixed(1)}" y="${(n.cy - n.hh - minY).toFixed(1)}" width="${(2 * n.hw).toFixed(1)}" height="${(2 * n.hh).toFixed(1)}" fill="#eef" stroke="#446"/>`
      + `<text x="${(n.cx - minX).toFixed(1)}" y="${(n.cy - minY + 4).toFixed(1)}" text-anchor="middle">${id}</text>\n`
  rels.forEach((r, i) => {
    const pa = out.get(i); if (!pa) return
    const S = nodes.get(r.source)!, T = nodes.get(r.target)!
    const a = abs(S, pa.exit), b = abs(T, pa.entry)
    const hue = (i * 53) % 360
    s += `<line x1="${(a.x - minX).toFixed(1)}" y1="${(a.y - minY).toFixed(1)}" x2="${(b.x - minX).toFixed(1)}" y2="${(b.y - minY).toFixed(1)}" stroke="hsl(${hue} 70% 45%)" stroke-width="1.5"/>`
      + `<circle cx="${(a.x - minX).toFixed(1)}" cy="${(a.y - minY).toFixed(1)}" r="3" fill="hsl(${hue} 70% 45%)"/>\n`
  })
  s += '</svg>\n'
  writeFileSync(join(MODEL_DIR, `${name}.svg`), s)
  void tr
}

/** Count proper segment crossings among the straight attach→attach
 *  lines (the pure-model crossing number — what the rotation-system
 *  invariant must drive to its lower bound). */
function pureCrossings(nodes: Map<string, NodeCenter>, rels: Rel[],
  out: Map<number, PortAttach>): number {
  const segs = rels.map((r, i) => {
    const pa = out.get(i); if (!pa) return null
    return [abs(nodes.get(r.source)!, pa.exit), abs(nodes.get(r.target)!, pa.entry)] as const
  }).filter(Boolean) as ReadonlyArray<readonly [{ x: number; y: number }, { x: number; y: number }]>
  const o = (a: any, b: any, c: any) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  let n = 0
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const [p, q] = segs[i], [r, s] = segs[j]
      const d1 = o(r, s, p), d2 = o(r, s, q), d3 = o(p, q, r), d4 = o(p, q, s)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) n++
    }
  return n
}

/** I1: assert the assigned attach perimeter order == bearing order, at
 *  every node. Returns the offending node id or '' if invariant holds. */
function checkRotationSystem(nodes: Map<string, NodeCenter>, rels: Rel[],
  out: Map<number, PortAttach>): string {
  for (const [id, C] of nodes) {
    const ends: { perimVal: number; bearing: number }[] = []
    rels.forEach((r, i) => {
      const pa = out.get(i); if (!pa) return
      if (r.source === id) {
        const F = nodes.get(r.target)!
        ends.push({ perimVal: perim(pa.exit), bearing: Math.atan2(F.cy - C.cy, F.cx - C.cx) })
      }
      if (r.target === id) {
        const F = nodes.get(r.source)!
        ends.push({ perimVal: perim(pa.entry), bearing: Math.atan2(F.cy - C.cy, F.cx - C.cx) })
      }
    })
    if (ends.length < 2) continue
    // Sorting by bearing and by perimeter must yield the SAME cyclic
    // sequence (allowing one rotation of the cycle). Compare the
    // rank-permutations; a mismatch is an inversion ⇒ avoidable cross.
    const byB = [...ends].sort((a, b) => a.bearing - b.bearing)
    const byP = [...ends].sort((a, b) => a.perimVal - b.perimVal)
    const seq = (arr: typeof ends) => arr.map(e => ends.indexOf(e))
    const A = seq(byB), B = seq(byP)
    // cyclic-equal?
    let ok = false
    for (let s = 0; s < A.length && !ok; s++)
      ok = A.every((_, k) => A[k] === B[(k + s) % B.length])
    if (!ok) return id
  }
  return ''
}

interface Scn { name: string; nodes: Map<string, NodeCenter>; rels: Rel[]; excluded?: (id: string) => boolean }

const scenarios: Scn[] = [
  {
    name: 'hub-fan-6',
    nodes: new Map([
      ['hub', box(300, 300)], ['n0', box(300, 80)], ['n1', box(520, 160)],
      ['n2', box(560, 360)], ['n3', box(420, 520)], ['n4', box(160, 520)], ['n5', box(60, 280)],
    ]),
    rels: [0, 1, 2, 3, 4, 5].map(k => ({ source: 'hub', target: `n${k}` })),
  },
  {
    name: 'antiparallel-pair',
    nodes: new Map([['a', box(200, 100)], ['b', box(200, 360)]]),
    rels: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
  },
  {
    name: 'k5-parallel',
    nodes: new Map([['a', box(200, 100)], ['b', box(200, 380)]]),
    rels: Array.from({ length: 5 }, () => ({ source: 'a', target: 'b' })),
  },
  {
    name: 'multi-pair-at-one-node',  // the rel-bidirectional shape
    nodes: new Map([['a', box(300, 100)], ['b', box(140, 360)], ['c', box(460, 360)]]),
    rels: [
      { source: 'a', target: 'b' }, { source: 'b', target: 'a' },   // antiparallel {a,b}
      { source: 'a', target: 'c' }, { source: 'c', target: 'a' },   // antiparallel {a,c}
    ],
  },
  {
    name: 'all-four-sides',
    nodes: new Map([
      ['c', box(300, 300)], ['N', box(300, 60)], ['E', box(560, 300)],
      ['S', box(300, 560)], ['W', box(60, 300)],
    ]),
    rels: [{ source: 'c', target: 'N' }, { source: 'c', target: 'E' },
      { source: 'c', target: 'S' }, { source: 'c', target: 'W' }],
  },
  {
    name: 'degenerate-collinear',  // 3 edges, identical bearing (stacked targets)
    nodes: new Map([['a', box(100, 200)], ['b', box(500, 200)]]),
    rels: [{ source: 'a', target: 'b' }, { source: 'a', target: 'b' }, { source: 'a', target: 'b' }],
  },
  {
    name: 'excluded-and-selfloop',
    nodes: new Map([['a', box(150, 150)], ['bnd', box(400, 150)], ['a2', box(150, 150)]]),
    rels: [{ source: 'a', target: 'bnd' }, { source: 'a', target: 'a' }],
    excluded: (id) => id === 'bnd',
  },
]

describe('assignPortOrder — rotation-system invariants (no hardcoded expectations)', () => {
  for (const sc of scenarios) {
    it(`${sc.name}: I1 rotation-system order holds + SVG model emitted`, () => {
      const out = assignPortOrder(sc.rels, sc.nodes, sc.excluded ?? never)
      model(sc.name, sc.nodes, sc.rels, out)
      // fractions are valid border points in [0,1], on a border
      for (const pa of out.values())
        for (const p of [pa.exit, pa.entry]) {
          expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1)
          expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1)
          expect(p.x === 0 || p.x === 1 || p.y === 0 || p.y === 1).toBe(true) // on a border
        }
      const bad = checkRotationSystem(sc.nodes, sc.rels, out)
      expect(bad, `node "${bad}" attach order inverts vs bearing order (avoidable incident crossing)`).toBe('')
    })
  }

  it('I2 nested-fan: K same-pair edges are monotone-consistent at both ends (k5-parallel)', () => {
    const sc = scenarios.find(s => s.name === 'k5-parallel')!
    const out = assignPortOrder(sc.rels, sc.nodes, never)
    // rank of each edge at A (by exit perim) and at B (by entry perim)
    const rank = (sel: (pa: PortAttach) => { x: number; y: number }) =>
      [...out.entries()].sort((u, v) => perim(sel(u[1])) - perim(sel(v[1]))).map(e => e[0])
    expect(rank(p => p.exit)).toEqual(rank(p => p.entry))   // identical ⇒ nested, 0 intra crossings
  })

  it('the pure straight-line model has 0 crossings for the incident-fan scenarios', () => {
    // The rotation-system theorem: bearing-ordered attach ⇒ no
    // avoidable incident crossing. For single-hub / star scenarios the
    // pure model MUST be crossing-free (this is the by-construction
    // guarantee the corpus pass relies on).
    for (const nm of ['hub-fan-6', 'all-four-sides']) {
      const sc = scenarios.find(s => s.name === nm)!
      const out = assignPortOrder(sc.rels, sc.nodes, never)
      expect(pureCrossings(sc.nodes, sc.rels, out), `${nm}: pure-model crossings`).toBe(0)
    }
  })

  it('not-happy-path: empty / single-edge / all-excluded → no throw, no spurious attach', () => {
    expect(assignPortOrder([], new Map(), never).size).toBe(0)
    const one = new Map([['a', box(0, 0)], ['b', box(0, 200)]])
    // a single incident edge per node still gets a deterministic attach
    const r = assignPortOrder([{ source: 'a', target: 'b' }], one, never)
    expect(r.get(0)).toBeDefined()
    // both endpoints excluded ⇒ skipped
    expect(assignPortOrder([{ source: 'a', target: 'b' }], one, () => true).size).toBe(0)
  })

  it('deterministic: identical input ⇒ byte-identical output (drift-gate safe)', () => {
    const sc = scenarios.find(s => s.name === 'multi-pair-at-one-node')!
    const a = JSON.stringify([...assignPortOrder(sc.rels, sc.nodes, never).entries()])
    const b = JSON.stringify([...assignPortOrder(sc.rels, sc.nodes, never).entries()])
    expect(a).toBe(b)
  })
})
