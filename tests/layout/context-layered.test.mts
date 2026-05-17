import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'

// CONTRACT (ADR 0008, supersedes 0005): a C4 *Context* diagram
// (people/systems only — no Container/Component) is laid out with the
// SAME `org.eclipse.elk.layered` hierarchical ranking as every other C4
// diagram type, because PlantUML renders Context with Graphviz `dot`
// (hierarchical ranking) too. The old `stress`+`sporeOverlap` Context
// branch is removed: it diverged from PlantUML in every shape — it
// staircased linear chains, scattered hub-and-spoke, and radial-ised the
// wide rank PlantUML embraces. These tests lock the layered contract;
// reverting to `stress` regresses every one of them.

const chain = (n: number) => {
  const ents = Array.from({ length: n }, (_, i) => ({
    type: 'System', alias: `s${i}`, label: `Stage ${i}`,
    technology: '', description: `step ${i}`,
  }))
  const rels = ents.slice(0, -1).map((e, i) => ({
    source: e.alias, target: ents[i + 1].alias, label: 'feeds', description: 'gRPC',
  }))
  return { ents, rels }
}

describe('Context uses layered ranking (PlantUML/dot fidelity, ADR 0008)', () => {
  it('a linear chain of Systems is a straight column, not a diagonal staircase', async () => {
    // P4 root-cause regression lock. Under the removed `stress`+declump
    // pipeline this exact graph produced x = [8,53,90,119,140]
    // (spread 132 — a diagonal staircase). `layered` DOWN aligns the
    // identical-width boxes into one column (spread 0), matching
    // PlantUML's dot render. A revert to stress fails here.
    const { ents, rels } = chain(5)
    const r = await LayoutEngine.calculateLayout(ents, rels)
    const xs = r.nodes.map((n) => n.x!)
    const spread = Math.max(...xs) - Math.min(...xs)
    expect(spread, `linear-chain x-spread ${spread} (stress baseline = 132; layered column = 0)`)
      .toBe(0)
  })

  it('a Context layout has zero node overlap (layered is overlap-free by construction)', async () => {
    // Was the `sporeOverlap` declump gate. `layered` produces
    // non-overlapping ranked output without any second pass.
    const { ents, rels } = chain(6)
    const hub = { type: 'System', alias: 'HUB', label: 'Bus', technology: '', description: 'broker' }
    const spokes = Array.from({ length: 6 }, (_, i) => ({
      type: i % 2 ? 'System_Ext' : 'Person', alias: `p${i}`,
      label: `Actor ${i}`, technology: '', description: `peer ${i}`,
    }))
    const allEnts = [...ents, hub, ...spokes]
    const allRels = [...rels, ...spokes.map((s) => ({ source: 'HUB', target: s.alias, label: 'routes', description: '' }))]
    const r = await LayoutEngine.calculateLayout(allEnts, allRels)
    const L = r.nodes
    const overlaps: string[] = []
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j]
        if (a.x! < b.x! + b.width && a.x! + a.width > b.x! &&
            a.y! < b.y! + b.height && a.y! + a.height > b.y!)
          overlaps.push(`${a.id}~${b.id}`)
      }
    expect(overlaps, 'overlapping nodes — layered must be overlap-free').toEqual([])
  })

  it('hub-and-spoke ranks hierarchically (hub above its targets), like PlantUML/dot', async () => {
    // PlantUML/dot renders a star as clean ranks: source on one rank,
    // its targets on the next rank DOWN. `stress` scattered them around
    // the hub with no rank structure. Assert the hierarchical ranking:
    // every direct target's box sits strictly below the hub's box.
    const hub = { type: 'System', alias: 'H', label: 'Event Bus', technology: '', description: 'broker' }
    const targets = Array.from({ length: 5 }, (_, i) => ({
      type: 'System', alias: `t${i}`, label: `Worker ${i}`, technology: '', description: '',
    }))
    const rels = targets.map((t) => ({ source: 'H', target: t.alias, label: 'dispatch', description: '' }))
    const r = await LayoutEngine.calculateLayout([hub, ...targets], rels)
    const byId = new Map(r.nodes.map((n) => [n.id, n] as const))
    const h = byId.get('H')!
    const hBottom = h.y! + h.height
    for (const t of targets) {
      const tn = byId.get(t.alias)!
      expect(tn.y!, `${t.alias} must rank below the hub (dot-style), hub.bottom=${hBottom} ${t.alias}.y=${tn.y}`)
        .toBeGreaterThanOrEqual(hBottom)
    }
  })

  it('a Context layout produces deterministic geometry (re-run is identical)', async () => {
    // `stress`/`force` were seed-sensitive; `layered` is deterministic,
    // which is what keeps the golden/route-signature gates stable.
    const { ents, rels } = chain(4)
    const a = await LayoutEngine.calculateLayout(ents, rels)
    const b = await LayoutEngine.calculateLayout(ents, rels)
    const sig = (r: { nodes: { id: string; x?: number; y?: number }[] }) =>
      r.nodes.map((n) => `${n.id}@${n.x},${n.y}`).sort().join('|')
    expect(sig(a)).toBe(sig(b))
  })
})
