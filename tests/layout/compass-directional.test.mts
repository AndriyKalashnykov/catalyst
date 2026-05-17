import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'

// P2 Strategy A (invisible co-rank edges). `Rel_U/D/L/R` must place the
// target on the source's compass side. An L/R relation's own s→t edge
// ranks t a layer BELOW s (a layered-engine fact true of ELK, dagre,
// PlantUML/dot alike), so catalyst (a) does NOT feed the L/R relation
// as a ranking edge and (b) synthesizes invisible edges that mirror the
// source's FULL predecessor+successor rank-constraint set onto the
// target — pinning the target to the source's exact rank regardless of
// the source's own chain depth (a single shared successor is only a
// one-sided bound and fails when the source sits on a longer chain).
// The synthetic structure is emitted ONLY when an L/R relation exists,
// so hint-free graphs are byte-identical (the scoping guarantee).
//
// Fidelity bar (per the P2 research): PlantUML itself does not
// deterministically honor mixed compass, so the contract is "every
// compass DIRECTION honored", not pixel-perfect co-ranking. P2 stays
// advisory in factcheck; these lock the directional contract.

const opts = { rankdir: 'TB' as const, nodesep: 50, edgesep: 10, ranksep: 36 }
const sys = (alias: string) => ({ type: 'System', alias, label: alias, technology: '', description: '' })

describe('P2 compass — Rel_U/D/L/R directional placement', () => {
  it('places all four compass targets on the correct side of the hub', async () => {
    const ents = ['hub', 'n', 's', 'e', 'w'].map(sys)
    const rels = [
      { source: 'hub', target: 'n', label: 'up', description: '', direction: 'U' as const },
      { source: 'hub', target: 's', label: 'down', description: '', direction: 'D' as const },
      { source: 'hub', target: 'w', label: 'left', description: '', direction: 'L' as const },
      { source: 'hub', target: 'e', label: 'right', description: '', direction: 'R' as const },
    ]
    const ld = await LayoutEngine.calculateLayout(ents, rels, opts, [])
    const c = (id: string) => {
      const x = ld.nodes.find(z => z.id === id)!
      return { cx: x.x + x.width / 2, cy: x.y + x.height / 2 }
    }
    const hub = c('hub'), n = c('n'), s = c('s'), e = c('e'), w = c('w')
    expect(n.cy).toBeLessThan(hub.cy)       // North above
    expect(s.cy).toBeGreaterThan(hub.cy)    // South below
    expect(w.cx).toBeLessThan(hub.cx)       // West left
    expect(e.cx).toBeGreaterThan(hub.cx)    // East right
    // no synthetic phantom/sink leaks into the emitted node set
    expect(ld.nodes.some(z => z.id.startsWith('__cmp'))).toBe(false)
  })

  it('West co-ranks with the hub (full pred+succ mirror pins the exact rank)', async () => {
    const ents = ['hub', 'n', 's', 'w'].map(sys)
    const rels = [
      { source: 'hub', target: 'n', label: 'u', description: '', direction: 'U' as const },
      { source: 'hub', target: 's', label: 'd', description: '', direction: 'D' as const },
      { source: 'hub', target: 'w', label: 'l', description: '', direction: 'L' as const },
    ]
    const ld = await LayoutEngine.calculateLayout(ents, rels, opts, [])
    const c = (id: string) => { const x = ld.nodes.find(z => z.id === id)!; return { cx: x.x + x.width / 2, cy: x.y + x.height / 2 } }
    const hub = c('hub'), w = c('w')
    // mirroring n→hub and hub→s onto w (n→w, w→s) pins w to hub's rank
    expect(w.cy).toBeCloseTo(hub.cy, 0)
    expect(w.cx).toBeLessThan(hub.cx)
  })

  it('a hint-free graph gets ZERO synthetic structure (scoping guarantee)', async () => {
    const ents = ['a', 'b', 'c'].map(sys)
    const rels = [
      { source: 'a', target: 'b', label: 'f', description: '' },
      { source: 'b', target: 'c', label: 'g', description: '' },
    ]
    const ld = await LayoutEngine.calculateLayout(ents, rels, opts, [])
    expect(ld.nodes.some(z => z.id.startsWith('__cmp'))).toBe(false)
    // plain chain ranks top-down, untouched by the compass machinery
    const y = (id: string) => ld.nodes.find(z => z.id === id)!.y
    expect(y('a')).toBeLessThan(y('b'))
    expect(y('b')).toBeLessThan(y('c'))
  })
})
