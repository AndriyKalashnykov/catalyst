import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'

// Phase 3 contract: a C4 *Context* diagram (people/systems only — no
// Container/Component) is laid out with `org.eclipse.elk.stress` (then
// `sporeOverlap` declump), NOT `force`. stress minimises edge crossings
// and is deterministic; the old `force` left crossings AND was seed-based.
// This asserts the win is real and locks it (reverting to force regresses
// the crossing count and fails here).

type P = { x: number; y: number }
const properCross = (p: P, q: P, r: P, s: P) => {
  const d = (b: P, a: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p, q, r), d2 = d(p, q, s), d3 = d(r, s, p), d4 = d(r, s, q)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// Hub-and-spoke: one central system, many peers all linked to it and to
// their neighbours — the topology `force` ribbons/crosses badly.
const hub = {
  type: 'System', alias: 'HUB', label: 'Core Platform',
  technology: '', description: 'central system',
}
const spokes = Array.from({ length: 10 }, (_, i) => ({
  type: i % 2 ? 'System_Ext' : 'Person',
  alias: `N${i}`, label: `Actor ${i}`, technology: '', description: `peer ${i}`,
}))
const entities = [hub, ...spokes]
const relations = [
  ...spokes.map((s) => ({ source: s.alias, target: 'HUB', label: 'uses', description: 'HTTPS' })),
  ...spokes.slice(0, -1).map((s, i) => ({ source: s.alias, target: spokes[i + 1].alias, label: 'peers', description: '' })),
]

describe('Phase 3 — Context uses stress (crossing-minimal, no overlap)', () => {
  it('hub-and-spoke context has zero node overlap (declump gate)', async () => {
    const r = await LayoutEngine.calculateLayout(entities, relations)
    const L = r.nodes
    const overlaps: string[] = []
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j]
        if (a.x! < b.x! + b.width && a.x! + a.width > b.x! &&
            a.y! < b.y! + b.height && a.y! + a.height > b.y!)
          overlaps.push(`${a.id}~${b.id}`)
      }
    expect(overlaps, 'overlapping nodes (sporeOverlap declump failed)').toEqual([])
  })

  it('hub-and-spoke context crossing count is far below the force baseline', async () => {
    const r = await LayoutEngine.calculateLayout(entities, relations)
    const c = new Map(r.nodes.map((n) => [n.id, { x: n.x! + n.width / 2, y: n.y! + n.height / 2 }]))
    const segs = relations
      .map((rl) => [c.get(rl.source), c.get(rl.target)] as [P | undefined, P | undefined])
      .filter((e): e is [P, P] => !!e[0] && !!e[1])
    let crossings = 0
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++)
        if (properCross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) crossings++

    // Empirical on THIS exact topology (5-run spike): `force` = 21
    // crossings, pure `stress` = 0, the shipped `stress` + `sporeOverlap`
    // declump pipeline = ~5 (declump trades a few crossings for zero node
    // overlap). 8 locks the win well under the force regime — a revert to
    // force (21) fails this.
    expect(crossings, `stress pipeline crossing count ${crossings} (force baseline = 21)`).toBeLessThanOrEqual(8)
  })
})

// #24 scope-guard discriminator (BLOCKING). The deterministic solo-edge
// centre-midpoint waypoint is applied ONLY when LayoutResult.context is
// true (Context/`stress` — people/systems only). Hierarchical layouts
// (any Container/Component → `layered`+ORTHOGONAL) MUST report
// context === false so catalyst leaves their ELK-routed edges
// byte-identical. If this discriminator regresses, the #24 routing
// change silently leaks into hierarchical diagrams.
describe('Item #24 — Context discriminator on LayoutResult', () => {
  it('people/systems-only layout reports context === true', async () => {
    const r = await LayoutEngine.calculateLayout(entities, relations)
    expect(r.context, 'hub-and-spoke (System/Person only) must be Context/stress').toBe(true)
  })

  it('any Container/Component makes it hierarchical → context === false', async () => {
    const hierEntities = [
      { type: 'System', alias: 'S', label: 'Sys', technology: '', description: '' },
      { type: 'Container', alias: 'C', label: 'Svc', technology: 'Go', description: 'api' },
    ]
    const hierRels = [{ source: 'S', target: 'C', label: 'calls', description: 'gRPC' }]
    const r = await LayoutEngine.calculateLayout(hierEntities, hierRels)
    expect(r.context, 'a Container present must force hierarchical layered → context false').toBe(false)
  })
})
